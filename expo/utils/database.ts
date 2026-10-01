import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { CATALOG_TABLES_SQL, USER_TABLES_SQL, USER_INDEXES_SQL, VIEWS_SQL } from '@/constants/schema';
import { fetchAllCards } from '@/utils/api';
import { fetchAllOnePieceCards, type OnePieceApiCard } from '@/utils/onepiece-api';
import { fetchAllYugiohCards, type YugiohApiCard } from '@/utils/yugioh-api';
import type { TCGId } from '@/constants/tcgs';

const dbInstances: Record<string, SQLite.SQLiteDatabase> = {};
const dbOpening: Record<string, Promise<SQLite.SQLiteDatabase> | undefined> = {};

export async function closeAllDatabases(): Promise<void> {
  const entries = Object.entries(dbInstances);
  for (const [file, database] of entries) {
    try {
      await database.closeAsync();
      console.log(`[DB] Closed ${file}`);
    } catch (error) {
      console.log(`[DB] Close skipped for ${file}:`, (error as Error).message);
    } finally {
      delete dbInstances[file];
      delete dbOpening[file];
    }
  }
}

async function withSyncTransaction(
  db: SQLite.SQLiteDatabase,
  task: (txn: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> {
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(async () => {
      await task(db);
    });
    return;
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    await task(txn);
  });
}

function dbFileForTCG(tcg: TCGId): string {
  switch (tcg) {
    case 'lorcana':
      return 'lorcana_cards.db';
    case 'onepiece':
      return 'onepiece_cards.db';
    case 'mtg':
      return 'mtg_cards.db';
    case 'pokemon':
      return 'pokemon_cards.db';
    case 'yugioh':
      return 'yugioh_cards.db';
    default:
      return 'lorcana_cards.db';
  }
}

export async function getDatabase(tcg: TCGId = 'lorcana'): Promise<SQLite.SQLiteDatabase> {
  const file = dbFileForTCG(tcg);
  const existing = dbInstances[file];
  if (existing) return existing;

  // React StrictMode / Fast Refresh can call initialization twice on web.
  // Share the same in-flight open so expo-sqlite never creates two Access Handles
  // for the same OPFS file.
  const opening = dbOpening[file];
  if (opening) return opening;

  console.log(`[DB] Opening database ${file}`);
  const promise = SQLite.openDatabaseAsync(file)
    .then((instance) => {
      dbInstances[file] = instance;
      console.log(`[DB] ${file} opened successfully`);
      return instance;
    })
    .finally(() => {
      delete dbOpening[file];
    });

  dbOpening[file] = promise;
  return promise;
}

async function execStatements(db: SQLite.SQLiteDatabase, sql: string, label: string): Promise<void> {
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('PRAGMA'));

  for (const stmt of statements) {
    try {
      await db.execAsync(stmt + ';');
    } catch (e) {
      console.log(`[DB] ${label} skipped:`, (e as Error).message);
    }
  }
}

export async function initializeTables(db: SQLite.SQLiteDatabase): Promise<void> {
  console.log('[DB] Initializing all tables...');
  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await execStatements(db, CATALOG_TABLES_SQL, 'Catalog table');
    await execStatements(db, USER_TABLES_SQL, 'User table');
    await execStatements(db, USER_INDEXES_SQL, 'Index');

    try {
      await execStatements(db, VIEWS_SQL, 'View');
    } catch (e) {
      console.log('[DB] Views skipped:', (e as Error).message);
    }

    await migrateSchema(db);

    console.log('[DB] All tables initialized successfully');
  } catch (error) {
    console.error('[DB] Error initializing tables:', error);
    throw error;
  }
}

async function migrateSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await db.execAsync('ALTER TABLE decks ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;');
  } catch {}

  const newCols = ['qty_epic', 'qty_promo', 'qty_iconic', 'qty_play'];
  for (const col of newCols) {
    try {
      await db.execAsync(`ALTER TABLE user_collection ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0;`);
    } catch {}
  }

  try { await db.execAsync('ALTER TABLE cards ADD COLUMN market_price REAL;'); } catch {}
  try { await db.execAsync('ALTER TABLE cards ADD COLUMN inventory_price REAL;'); } catch {}
  try { await db.execAsync('ALTER TABLE cards ADD COLUMN game_data TEXT;'); } catch {}

  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS purchased_starter_decks (
      id TEXT PRIMARY KEY,
      set_name TEXT NOT NULL,
      deck_name TEXT NOT NULL,
      ink_profile TEXT NOT NULL,
      purchased_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
  } catch {}

  try {
    await db.execAsync(`ALTER TABLE game_history ADD COLUMN player_name TEXT;`);
  } catch {}

  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS cardmarket_prices (
      card_id INTEGER PRIMARY KEY,
      cm_product_id INTEGER,
      avg_price REAL,
      sell_price REAL,
      trend_price REAL,
      low_price REAL,
      website_url TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id)
    );`);
  } catch {}
}

export async function checkCatalogExists(db: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    const result = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM cards"
    );
    return (result?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function getCardCount(db: SQLite.SQLiteDatabase): Promise<number> {
  try {
    const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM cards');
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

async function getCardIdByUniqueId(
  db: SQLite.SQLiteDatabase,
  uniqueId: string | null
): Promise<number | null> {
  if (!uniqueId) return null;
  try {
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM cards WHERE unique_id = ?',
      [uniqueId]
    );
    return row?.id ?? null;
  } catch {
    return null;
  }
}

const ID_MAPPING_KEY = (tcg: TCGId) => `card_id_mapping_${tcg}`;

/** Backup old card_id → unique_id before a catalog reset so v1.2 imports still work. */
export async function backupCardIdMapping(db: SQLite.SQLiteDatabase, tcg: TCGId): Promise<number> {
  try {
    const rows = await db.getAllAsync<{ id: number; unique_id: string | null }>(
      'SELECT id, unique_id FROM cards WHERE unique_id IS NOT NULL'
    );
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.unique_id) map[String(r.id)] = r.unique_id;
    }
    await AsyncStorage.setItem(ID_MAPPING_KEY(tcg), JSON.stringify(map));
    console.log(`[Mapping] Backed up ${Object.keys(map).length} card_id → unique_id entries for ${tcg}`);
    return Object.keys(map).length;
  } catch (e) {
    console.log('[Mapping] Backup failed:', (e as Error).message);
    return 0;
  }
}

/** Restore the backed-up mapping. Returns { oldId → unique_id }. */
export async function getSavedCardIdMapping(tcg: TCGId): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ID_MAPPING_KEY(tcg));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Build old_id → new_id bridge for v1.2 imports. */
export async function buildV12IdBridge(
  db: SQLite.SQLiteDatabase,
  oldIdToUniqueId: Record<string, string>
): Promise<Map<number, number>> {
  const bridge = new Map<number, number>();
  for (const [oldIdStr, uniqueId] of Object.entries(oldIdToUniqueId)) {
    const newId = await getCardIdByUniqueId(db, uniqueId);
    if (newId != null) {
      bridge.set(Number(oldIdStr), newId);
    }
  }
  console.log(`[Mapping] Built bridge: ${bridge.size} old IDs → new IDs resolved`);
  return bridge;
}

/**
 * Fallback recovery for v1.2 exports when no id_mapping backup exists.
 *
 * Strategy: the old catalog had cards in API order with later-set cards
 * appended at higher IDs after incremental syncs. We group skipped old IDs
 * by contiguous ranges, determine which set each range belongs to by
 * looking at the ID range boundaries, then map to current catalog cards
 * from the same set (sorted by card_number).
 */
export async function fallbackRecoverV12Ids(
  db: SQLite.SQLiteDatabase,
  skippedOldIds: number[]
): Promise<Map<number, number>> {
  const bridge = new Map<number, number>();
  if (skippedOldIds.length === 0) return bridge;

  try {
    console.log(`[Recover] Attempting fallback recovery for ${skippedOldIds.length} skipped IDs...`);

    // Get all set codes and their card counts from the DB
    const dbSetCards = await db.getAllAsync<{ id: number; set_code: string; card_number: string }>(
      'SELECT id, set_code, card_number FROM cards WHERE set_code IS NOT NULL ORDER BY set_code, CAST(card_number AS INTEGER)'
    );

    // Group DB cards by set_code, sorted by card_number within each set
    const dbBySet = new Map<string, { id: number; cardNumber: string }[]>();
    for (const r of dbSetCards) {
      if (!r.set_code) continue;
      const list = dbBySet.get(r.set_code) ?? [];
      list.push({ id: r.id, cardNumber: r.card_number });
      dbBySet.set(r.set_code, list);
    }

    // Determine which set the skipped IDs belong to.
    // ID ranges from lorcanajson set codes (old sync order):
    // TFC=1, ROF=2, INK=3, URS=4, SSK=5, AZS=6, ARI=7, ROJ=8, FAB=9, WHI=10, WIN=11
    // The old catalog had accumulated cards; the last set (WIN/Winterspell) got IDs ~8166-8366.
    // We can detect this by checking if skipped IDs form a contiguous range.

    const sorted = [...skippedOldIds].sort((a, b) => a - b);

    // Find contiguous ranges
    const ranges: { start: number; end: number; ids: number[] }[] = [];
    let currentRange: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] <= currentRange[currentRange.length - 1] + 5) {
        // Close enough (allow small gaps from missing alternate arts)
        currentRange.push(sorted[i]);
      } else {
        ranges.push({ start: currentRange[0], end: currentRange[currentRange.length - 1], ids: [...currentRange] });
        currentRange = [sorted[i]];
      }
    }
    ranges.push({ start: currentRange[0], end: currentRange[currentRange.length - 1], ids: [...currentRange] });

    console.log(`[Recover] Found ${ranges.length} contiguous range(s):`, ranges.map(r => `${r.start}-${r.end} (${r.ids.length} cards)`));

    // For each range, determine the likely set and map to current catalog cards.
    // Priority heuristic:
    //   1. If range size roughly matches a known set's card count → map to that set
    //   2. If range starts high (e.g., 8000+) → likely the newest set (WIN)
    for (const range of ranges) {
      let matchedSet: string | null = null;

      // Heuristic: high ID ranges (8000+) are the most recently added sets
      if (range.start >= 8000) {
        // Likely WIN (Winterspell) — the newest set in the DB
        const setCodes = [...dbBySet.keys()];
        // Find set with closest card count
        for (const [setCode, cards] of dbBySet) {
          if (Math.abs(cards.length - range.ids.length) <= 3) {
            matchedSet = setCode;
            break;
          }
        }
        // Fallback: use the last set alphabetically (likely newest)
        if (!matchedSet && setCodes.length > 0) {
          matchedSet = setCodes[setCodes.length - 1];
        }
      }

      // General heuristic: match by card count
      if (!matchedSet) {
        for (const [setCode, cards] of dbBySet) {
          if (Math.abs(cards.length - range.ids.length) <= 3) {
            matchedSet = setCode;
            break;
          }
        }
      }

      if (matchedSet && dbBySet.has(matchedSet)) {
        const setCards = dbBySet.get(matchedSet)!;
        for (let i = 0; i < Math.min(range.ids.length, setCards.length); i++) {
          bridge.set(range.ids[i], setCards[i].id);
        }
        console.log(`[Recover] Mapped ${Math.min(range.ids.length, setCards.length)} cards to set ${matchedSet}`);
      }
    }

    console.log(`[Recover] Fallback recovery resolved ${bridge.size} cards`);
    return bridge;
  } catch (e) {
    console.log('[Recover] Fallback recovery failed:', (e as Error).message);
    return bridge;
  }
}

async function syncLorcana(
  db: SQLite.SQLiteDatabase,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const apiCards = await fetchAllCards();
  const total = apiCards.length;
  console.log(`[Sync:Lorcana] Received ${total} cards`);

  await db.execAsync('DELETE FROM subtypes;');
  await db.execAsync('DELETE FROM abilities;');
  await db.execAsync('DELETE FROM images;');

  const setsMap = new Map<string, { name: string }>();
  for (const card of apiCards) {
    if (card.Set_ID && card.Set_Name) {
      setsMap.set(card.Set_ID, { name: card.Set_Name });
    }
  }

  for (const [setCode, setInfo] of setsMap) {
    await db.runAsync(
      `INSERT INTO sets (set_code, name) VALUES (?, ?)
       ON CONFLICT(set_code) DO UPDATE SET name = excluded.name`,
      [setCode, setInfo.name]
    );
  }

  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < apiCards.length; i += BATCH_SIZE) {
    const batch = apiCards.slice(i, i + BATCH_SIZE);

    await withSyncTransaction(db, async (txn) => {
      for (const card of batch) {
        await txn.runAsync(
          `INSERT INTO cards (name, version, cost, ink_color, type, rarity, set_code, card_number,
            body_text, flavor_text, strength, willpower, lore, move_cost, inkable, unique_id,
            classifications, franchise, date_added, date_modified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(unique_id) DO UPDATE SET
             name = excluded.name, cost = excluded.cost, ink_color = excluded.ink_color,
             type = excluded.type, rarity = excluded.rarity, set_code = excluded.set_code,
             card_number = excluded.card_number, body_text = excluded.body_text,
             flavor_text = excluded.flavor_text, strength = excluded.strength,
             willpower = excluded.willpower, lore = excluded.lore, move_cost = excluded.move_cost,
             inkable = excluded.inkable, classifications = excluded.classifications,
             franchise = excluded.franchise, date_modified = excluded.date_modified`,
          [
            card.Name ?? '',
            null,
            card.Cost ?? null,
            card.Color ?? null,
            card.Type ?? null,
            card.Rarity ?? null,
            card.Set_ID ?? null,
            card.Card_Num?.toString() ?? null,
            card.Body_Text ?? null,
            card.Flavor_Text ?? null,
            card.Strength ?? null,
            card.Willpower ?? null,
            card.Lore ?? null,
            card.Move_Cost ?? null,
            card.Inkable ? 1 : 0,
            card.Unique_ID ?? null,
            card.Classifications ?? null,
            card.Franchise ?? null,
            card.Date_Added ?? null,
            card.Date_Modified ?? null,
          ]
        );

        const cardId = await getCardIdByUniqueId(txn, card.Unique_ID);
        if (cardId && card.Image) {
          await txn.runAsync(
            `INSERT INTO images (card_id, image_url, thumbnail_url) VALUES (?, ?, ?)
             ON CONFLICT(card_id) DO UPDATE SET image_url = excluded.image_url, thumbnail_url = excluded.thumbnail_url`,
            [cardId, card.Image, card.Image]
          );
        }

        if (cardId && card.Classifications) {
          const subs = card.Classifications.split(',').map(s => s.trim()).filter(Boolean);
          for (const sub of subs) {
            await txn.runAsync(
              'INSERT INTO subtypes (card_id, subtype) VALUES (?, ?)',
              [cardId, sub]
            );
          }
        }

        inserted++;
      }
    });

    onProgress?.(Math.min(inserted, total), total);
  }

  await db.runAsync(
    "INSERT INTO import_log (imported_at, source, notes) VALUES (datetime('now'), 'lorcana-api.com', ?)",
    [`Synced ${inserted} cards from API`]
  );
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES ('last_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [new Date().toISOString()]
  );
  return inserted;
}

function opSetCodeFromId(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = code.match(/^([A-Z]+\d+)/);
  return m ? m[1] : null;
}

function opCounterToNumber(counter: string | number | null | undefined): number | null {
  if (counter === null || counter === undefined) return null;
  if (typeof counter === 'number') return counter;
  const t = counter.trim();
  if (!t || t === '-' || t === 'N/A') return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

async function syncOnePiece(
  db: SQLite.SQLiteDatabase,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const apiCards: OnePieceApiCard[] = await fetchAllOnePieceCards((c, t) => {
    onProgress?.(c, t);
  });
  const total = apiCards.length;
  console.log(`[Sync:OP] Received ${total} cards`);

  await db.execAsync('DELETE FROM subtypes;');
  await db.execAsync('DELETE FROM abilities;');
  await db.execAsync('DELETE FROM images;');

  const setsMap = new Map<string, string>();
  for (const c of apiCards) {
    const code = opSetCodeFromId(c.code ?? c.id);
    if (code && c.set?.name) setsMap.set(code, c.set.name);
  }
  for (const [setCode, name] of setsMap) {
    await db.runAsync(
      `INSERT INTO sets (set_code, name) VALUES (?, ?)
       ON CONFLICT(set_code) DO UPDATE SET name = excluded.name`,
      [setCode, name]
    );
  }

  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < apiCards.length; i += BATCH_SIZE) {
    const batch = apiCards.slice(i, i + BATCH_SIZE);

    await withSyncTransaction(db, async (txn) => {
      for (const c of batch) {
        const uniqueId = c.id ?? c.code ?? null;
        const setCode = opSetCodeFromId(c.code ?? c.id);
        const counter = opCounterToNumber(c.counter);
        const life = typeof c.life === 'number' ? c.life : null;

        await txn.runAsync(
          `INSERT INTO cards (name, version, cost, ink_color, type, rarity, set_code, card_number,
            body_text, flavor_text, strength, willpower, lore, move_cost, inkable, unique_id,
            classifications, franchise, date_added, date_modified, market_price, inventory_price, game_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(unique_id) DO UPDATE SET
             name = excluded.name, cost = excluded.cost, ink_color = excluded.ink_color,
             type = excluded.type, rarity = excluded.rarity, set_code = excluded.set_code,
             card_number = excluded.card_number, body_text = excluded.body_text,
             flavor_text = excluded.flavor_text, strength = excluded.strength,
             willpower = excluded.willpower, lore = excluded.lore, classifications = excluded.classifications,
             franchise = excluded.franchise, market_price = excluded.market_price,
             inventory_price = excluded.inventory_price, game_data = excluded.game_data`,
          [
            c.name ?? '',
            null,
            c.cost ?? null,
            c.color ?? null,
            c.type ?? null,
            c.rarity ?? null,
            setCode,
            c.code ?? null,
            c.ability ?? null,
            c.trigger ?? null,
            c.power ?? null,
            counter,
            life,
            null,
            0,
            uniqueId,
            c.family ?? null,
            c.attribute?.name ?? null,
            null,
            null,
            c.marketPrice ?? null,
            c.inventoryPrice ?? null,
            JSON.stringify({
              card_type: c.type ?? null,
              color: c.color ?? null,
              cost: c.cost ?? null,
              power: c.power ?? null,
              counter: counter,
              life,
              attribute: c.attribute?.name ?? null,
              traits: c.family ?? null,
              effect: c.ability ?? null,
              trigger: c.trigger ?? null,
              card_number: c.code ?? null,
              rarity: c.rarity ?? null,
              set_name: c.set?.name ?? null,
            }),
          ]
        );

        const cardId = await getCardIdByUniqueId(txn, uniqueId);
        const imageUrl = c.images?.large ?? c.images?.small ?? null;
        const thumb = c.images?.small ?? c.images?.large ?? null;
        if (cardId && imageUrl) {
          await txn.runAsync(
            `INSERT INTO images (card_id, image_url, thumbnail_url) VALUES (?, ?, ?)
             ON CONFLICT(card_id) DO UPDATE SET image_url = excluded.image_url, thumbnail_url = excluded.thumbnail_url`,
            [cardId, imageUrl, thumb]
          );
        }

        if (cardId && c.family) {
          const subs = c.family.split('/').map(s => s.trim()).filter(Boolean);
          for (const sub of subs) {
            await txn.runAsync('INSERT INTO subtypes (card_id, subtype) VALUES (?, ?)', [cardId, sub]);
          }
        }

        inserted++;
      }
    });

    onProgress?.(Math.min(inserted, total), total);
  }

  await db.runAsync(
    "INSERT INTO import_log (imported_at, source, notes) VALUES (datetime('now'), 'optcgapi.com', ?)",
    [`Synced ${inserted} cards from API`]
  );
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES ('last_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [new Date().toISOString()]
  );
  return inserted;
}


function yugiohBaseType(card: YugiohApiCard): string {
  if (card.type === 'Spell Card') return 'Spell';
  if (card.type === 'Trap Card') return 'Trap';
  return 'Monster';
}

function yugiohSetPrefix(setCode: string | null | undefined): string | null {
  if (!setCode) return null;
  const match = setCode.toUpperCase().match(/^([A-Z0-9]+)/);
  return match?.[1] ?? setCode;
}

function priceNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

async function syncYugioh(
  db: SQLite.SQLiteDatabase,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const apiCards = await fetchAllYugiohCards();
  const total = apiCards.length;
  console.log(`[Sync:YGO] Received ${total} cards`);

  // Yu-Gi-Oh is a large catalog. On web, thousands of tiny transactions are
  // dramatically slower than the download itself, so keep the import lean:
  // one base-card row + one primary image row. Printings/artworks stay in game_data.
  await db.execAsync('DELETE FROM subtypes; DELETE FROM abilities; DELETE FROM images;');

  const sets = new Map<string, string>();
  for (const card of apiCards) {
    for (const printing of card.card_sets ?? []) {
      const setCode = yugiohSetPrefix(printing.set_code);
      if (setCode && !sets.has(setCode)) sets.set(setCode, printing.set_name);
    }
  }

  await withSyncTransaction(db, async (txn) => {
    for (const [setCode, name] of sets) {
      await txn.runAsync(
        `INSERT INTO sets (set_code, name, release_date) VALUES (?, ?, NULL)
         ON CONFLICT(set_code) DO UPDATE SET name = excluded.name`,
        [setCode, name]
      );
    }
  });

  const BATCH_SIZE = Platform.OS === 'web' ? 500 : 100;
  let inserted = 0;

  for (let i = 0; i < apiCards.length; i += BATCH_SIZE) {
    const batch = apiCards.slice(i, i + BATCH_SIZE);
    await withSyncTransaction(db, async (txn) => {
      for (const card of batch) {
        const primarySet = card.card_sets?.[0] ?? null;
        const setCode = yugiohSetPrefix(primarySet?.set_code);
        const uniqueId = `ygo-${card.id}`;
        const prices = card.card_prices?.[0];
        const baseType = yugiohBaseType(card);
        const image = card.card_images?.[0] ?? null;

        await txn.runAsync(
          `INSERT INTO cards (name, version, cost, ink_color, type, rarity, set_code, card_number,
            body_text, flavor_text, strength, willpower, lore, move_cost, inkable, unique_id,
            classifications, franchise, date_added, date_modified, market_price, inventory_price, game_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(unique_id) DO UPDATE SET
             name = excluded.name, version = excluded.version, ink_color = excluded.ink_color,
             type = excluded.type, rarity = excluded.rarity, set_code = excluded.set_code,
             card_number = excluded.card_number, body_text = excluded.body_text,
             strength = excluded.strength, willpower = excluded.willpower,
             classifications = excluded.classifications, franchise = excluded.franchise,
             date_added = excluded.date_added, market_price = excluded.market_price,
             inventory_price = excluded.inventory_price, game_data = excluded.game_data`,
          [
            card.name, card.frameType ?? null, null, card.attribute ?? null, baseType,
            primarySet?.set_rarity ?? null, setCode, String(card.id), card.desc ?? null, null,
            card.atk ?? null, card.def ?? null, null, null, 0, uniqueId,
            card.race ?? null, card.archetype ?? null, card.tcg_date ?? null, null,
            priceNumber(prices?.cardmarket_price), priceNumber(prices?.tcgplayer_price),
            JSON.stringify({
              passcode: card.id,
              card_type: baseType,
              monster_type: baseType === 'Monster' ? card.type : null,
              frame_type: card.frameType ?? null,
              description: card.desc ?? null,
              archetype: card.archetype ?? null,
              attribute: card.attribute ?? null,
              race: card.race ?? null,
              level: card.frameType?.includes('xyz') ? null : (card.level ?? null),
              rank: card.frameType?.includes('xyz') ? (card.level ?? null) : null,
              link_rating: card.linkval ?? null,
              link_arrows: card.linkmarkers ?? [],
              atk: card.atk ?? null,
              def: card.def ?? null,
              pendulum_scale: card.scale ?? null,
              spell_type: baseType === 'Spell' ? card.race ?? null : null,
              trap_type: baseType === 'Trap' ? card.race ?? null : null,
              ban_tcg: card.banlist_info?.ban_tcg ?? null,
              printings: (card.card_sets ?? []).map(p => ({
                set_name: p.set_name, set_code: p.set_code, rarity: p.set_rarity,
                rarity_code: p.set_rarity_code ?? null, price: p.set_price ?? null,
              })),
              artworks: (card.card_images ?? []).map(img => ({
                id: img.id, image_url: img.image_url, thumbnail_url: img.image_url_small,
              })),
              prices: prices ?? null,
            }),
          ]
        );

        // Resolve the inserted/upserted row without an extra helper round-trip.
        if (image) {
          await txn.runAsync(
            `INSERT INTO images (card_id, image_url, thumbnail_url)
             SELECT id, ?, ? FROM cards WHERE unique_id = ?
             ON CONFLICT(card_id) DO UPDATE SET
               image_url = excluded.image_url, thumbnail_url = excluded.thumbnail_url`,
            [image.image_url, image.image_url_small, uniqueId]
          );
        }
        inserted++;
      }
    });

    onProgress?.(inserted, total);
    if (inserted % 1000 === 0 || inserted === total) {
      console.log(`[Sync:YGO] Stored ${inserted}/${total}`);
    }
  }

  await db.runAsync(
    "INSERT INTO import_log (imported_at, source, notes) VALUES (datetime('now'), 'YGOPRODeck API v7', ?)",
    [`Synced ${inserted} TCG cards`]
  );
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES ('last_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [new Date().toISOString()]
  );
  console.log(`[Sync:YGO] Complete: ${inserted} cards stored`);
  return inserted;
}

export async function syncCardsFromApi(
  db: SQLite.SQLiteDatabase,
  onProgress?: (current: number, total: number) => void,
  tcg: TCGId = 'lorcana'
): Promise<number> {
  console.log(`[Sync] Starting API sync for TCG=${tcg}...`);
  if (tcg === 'onepiece') return syncOnePiece(db, onProgress);
  if (tcg === 'yugioh') return syncYugioh(db, onProgress);
  if (tcg === 'lorcana') return syncLorcana(db, onProgress);
  throw new Error(`Catalog sync for ${tcg} is not connected yet. The game workspace is available, but it will not use Lorcana data as a fallback.`);
}

export async function safeQuery<T>(
  db: SQLite.SQLiteDatabase,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    return await db.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams);
  } catch (error) {
    console.log('[DB] Query error:', (error as Error).message, '\nSQL:', sql.substring(0, 100));
    return [];
  }
}

export async function safeQueryFirst<T>(
  db: SQLite.SQLiteDatabase,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  try {
    return await db.getFirstAsync<T>(sql, params as SQLite.SQLiteBindParams);
  } catch (error) {
    console.log('[DB] Query error:', (error as Error).message);
    return null;
  }
}

export async function safeRun(
  db: SQLite.SQLiteDatabase,
  sql: string,
  params: unknown[] = []
): Promise<SQLite.SQLiteRunResult | null> {
  try {
    return await db.runAsync(sql, params as SQLite.SQLiteBindParams);
  } catch (error) {
    console.log('[DB] Run error:', (error as Error).message);
    throw error;
  }
}
