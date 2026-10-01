import fs from 'node:fs';
import path from 'node:path';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray.js';
import { chain } from 'stream-chain';
import { db, getMeta, setMeta } from './db.js';
import { config } from './config.js';
import { downloadBulkFile, getDefaultCardsBulkMeta } from './scryfall.js';

type ScryfallCard = Record<string, any>;

let running = false;

function imageUris(card: ScryfallCard): { normal: string | null; small: string | null } {
  const uris = card.image_uris ?? card.card_faces?.find((face: ScryfallCard) => face.image_uris)?.image_uris;
  return {
    normal: uris?.normal ?? uris?.large ?? uris?.png ?? null,
    small: uris?.small ?? uris?.normal ?? uris?.large ?? null,
  };
}

function firstFaceValue(card: ScryfallCard, key: string): string | null {
  const direct = card[key];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  for (const face of card.card_faces ?? []) {
    const value = face?.[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function oracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) return card.oracle_text;
  const values = (card.card_faces ?? []).map((f: ScryfallCard) => f.oracle_text).filter(Boolean);
  return values.length ? values.join('\n//\n') : null;
}

function manaCost(card: ScryfallCard): string | null {
  if (card.mana_cost) return card.mana_cost;
  const values = (card.card_faces ?? []).map((f: ScryfallCard) => f.mana_cost).filter(Boolean);
  return values.length ? values.join(' // ') : null;
}

const upsertCard = db.prepare(`
  INSERT INTO mtg_cards (
    oracle_id, name, layout, mana_cost, mana_value, colors_json, color_identity_json,
    type_line, oracle_text, power, toughness, loyalty, defense, keywords_json,
    legalities_json, reserved, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(oracle_id) DO UPDATE SET
    name=excluded.name, layout=excluded.layout, mana_cost=excluded.mana_cost,
    mana_value=excluded.mana_value, colors_json=excluded.colors_json,
    color_identity_json=excluded.color_identity_json, type_line=excluded.type_line,
    oracle_text=excluded.oracle_text, power=excluded.power, toughness=excluded.toughness,
    loyalty=excluded.loyalty, defense=excluded.defense, keywords_json=excluded.keywords_json,
    legalities_json=excluded.legalities_json, reserved=excluded.reserved,
    updated_at=excluded.updated_at
`);

const upsertSet = db.prepare(`
  INSERT INTO mtg_sets (set_code, set_name, release_date) VALUES (?, ?, ?)
  ON CONFLICT(set_code) DO UPDATE SET
    set_name=excluded.set_name,
    release_date=CASE
      WHEN excluded.release_date > COALESCE(mtg_sets.release_date, '') THEN excluded.release_date
      ELSE mtg_sets.release_date
    END
`);

const upsertPrinting = db.prepare(`
  INSERT INTO mtg_printings (
    scryfall_id, oracle_id, set_code, set_name, collector_number, rarity,
    released_at, artist, finishes_json, promo, reprint, prices_json,
    source_image_url, source_thumbnail_url, local_image_url, local_thumbnail_url,
    scryfall_uri
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE((SELECT local_image_url FROM mtg_printings WHERE scryfall_id=?), NULL),
            COALESCE((SELECT local_thumbnail_url FROM mtg_printings WHERE scryfall_id=?), NULL), ?)
  ON CONFLICT(scryfall_id) DO UPDATE SET
    oracle_id=excluded.oracle_id, set_code=excluded.set_code, set_name=excluded.set_name,
    collector_number=excluded.collector_number, rarity=excluded.rarity,
    released_at=excluded.released_at, artist=excluded.artist,
    finishes_json=excluded.finishes_json, promo=excluded.promo, reprint=excluded.reprint,
    prices_json=excluded.prices_json, source_image_url=excluded.source_image_url,
    source_thumbnail_url=excluded.source_thumbnail_url, scryfall_uri=excluded.scryfall_uri
`);

async function importBulk(filePath: string, updatedAt: string): Promise<number> {
  db.exec('DELETE FROM mtg_sets;');
  let count = 0;
  let batch: ScryfallCard[] = [];

  const flush = db.transaction((cards: ScryfallCard[]) => {
    for (const card of cards) {
      if (!card || card.digital || !card.oracle_id || !card.set || !card.id) continue;

      const images = imageUris(card);
      upsertCard.run(
        card.oracle_id,
        card.name ?? '',
        card.layout ?? null,
        manaCost(card),
        card.cmc ?? null,
        JSON.stringify(card.colors ?? []),
        JSON.stringify(card.color_identity ?? []),
        card.type_line ?? null,
        oracleText(card),
        firstFaceValue(card, 'power'),
        firstFaceValue(card, 'toughness'),
        firstFaceValue(card, 'loyalty'),
        firstFaceValue(card, 'defense'),
        JSON.stringify(card.keywords ?? []),
        JSON.stringify(card.legalities ?? {}),
        card.reserved ? 1 : 0,
        updatedAt
      );

      upsertSet.run(card.set, card.set_name ?? card.set, card.released_at ?? null);

      upsertPrinting.run(
        card.id,
        card.oracle_id,
        card.set,
        card.set_name ?? card.set,
        card.collector_number ?? '',
        card.rarity ?? null,
        card.released_at ?? null,
        card.artist ?? null,
        JSON.stringify(card.finishes ?? []),
        card.promo ? 1 : 0,
        card.reprint ? 1 : 0,
        JSON.stringify(card.prices ?? {}),
        images.normal,
        images.small,
        card.id,
        card.id,
        card.scryfall_uri ?? null
      );
    }
  });

  const stream = chain([
    fs.createReadStream(filePath),
    parser(),
    streamArray(),
  ]);

  for await (const item of stream) {
    batch.push(item.value as ScryfallCard);
    if (batch.length >= 1000) {
      flush(batch);
      count += batch.length;
      batch = [];
      if (count % 10000 === 0) console.log(`[MTG Server] Imported ${count} printings`);
    }
  }

  if (batch.length) {
    flush(batch);
    count += batch.length;
  }

  db.prepare(`
    DELETE FROM mtg_printings
    WHERE oracle_id NOT IN (SELECT oracle_id FROM mtg_cards)
  `).run();

  return count;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Image HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = `${dest}.part`;
  const file = fs.createWriteStream(temp);
  await new Promise<void>((resolve, reject) => {
    const reader = response.body!.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          file.write(Buffer.from(value));
        }
        file.end(resolve);
      } catch (error) {
        file.destroy();
        reject(error);
      }
    };
    void pump();
  });
  fs.renameSync(temp, dest);
}

async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

async function mirrorImages(): Promise<void> {
  if (config.mtgImageMirror === 'none') return;

  const imageDir = path.join(config.dataDir, 'images', 'mtg');
  let mirrored = 0;

  while (true) {
    const rows = db.prepare(`
      SELECT scryfall_id, source_thumbnail_url, source_image_url, local_thumbnail_url, local_image_url
      FROM mtg_printings
      WHERE source_thumbnail_url IS NOT NULL
        AND (local_thumbnail_url IS NULL OR (? = 'full' AND local_image_url IS NULL))
      LIMIT 250
    `).all(config.mtgImageMirror) as Array<{
      scryfall_id: string;
      source_thumbnail_url: string | null;
      source_image_url: string | null;
      local_thumbnail_url: string | null;
      local_image_url: string | null;
    }>;

    if (!rows.length) break;

    await runPool(rows, config.mtgImageConcurrency, async row => {
      try {
        let thumb = row.local_thumbnail_url;
        let normal = row.local_image_url;

        if (!thumb && row.source_thumbnail_url) {
          const file = `${row.scryfall_id}-small.jpg`;
          await downloadFile(row.source_thumbnail_url, path.join(imageDir, file));
          thumb = `/images/mtg/${file}`;
        }

        if (config.mtgImageMirror === 'full' && !normal && row.source_image_url) {
          const file = `${row.scryfall_id}-normal.jpg`;
          await downloadFile(row.source_image_url, path.join(imageDir, file));
          normal = `/images/mtg/${file}`;
        }

        db.prepare(`
          UPDATE mtg_printings
          SET local_thumbnail_url=?, local_image_url=?
          WHERE scryfall_id=?
        `).run(thumb, normal, row.scryfall_id);

        mirrored++;
        if (mirrored % 1000 === 0) console.log(`[MTG Server] Mirrored ${mirrored} images`);
      } catch (error) {
        console.log(`[MTG Server] Image mirror failed for ${row.scryfall_id}:`, (error as Error).message);
        db.prepare('UPDATE mtg_printings SET local_thumbnail_url = source_thumbnail_url WHERE scryfall_id=?')
          .run(row.scryfall_id);
      }
    });
  }

  console.log(`[MTG Server] Image mirror complete: ${mirrored} updated`);
}

export async function syncMtgCatalog(force = false): Promise<{ changed: boolean; printings: number }> {
  if (running) throw new Error('MTG sync is already running');
  running = true;

  try {
    const meta = await getDefaultCardsBulkMeta();
    const currentVersion = getMeta('mtg_bulk_updated_at');

    if (!force && currentVersion === meta.updated_at) {
      console.log('[MTG Server] Catalog already current');
      return { changed: false, printings: Number(getMeta('mtg_printing_count') ?? 0) };
    }

    console.log(`[MTG Server] New Scryfall bulk: ${meta.updated_at}`);
    const file = await downloadBulkFile(meta);
    const printings = await importBulk(file, meta.updated_at);

    setMeta('mtg_bulk_updated_at', meta.updated_at);
    setMeta('mtg_printing_count', String(printings));
    setMeta('mtg_last_sync', new Date().toISOString());

    await mirrorImages();

    return { changed: true, printings };
  } finally {
    running = false;
  }
}

export function isMtgSyncRunning(): boolean {
  return running;
}
