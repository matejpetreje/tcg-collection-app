import type * as SQLite from 'expo-sqlite';

export type LogiaImportMode = 'replace' | 'merge';

export interface LogiaImportResult {
  totalRows: number;
  matchedRows: number;
  importedCards: number;
  importedCopies: number;
  skippedRows: number;
  ambiguousRows: number;
  skippedPreview: string[];
}

interface LogiaRow {
  cardNumber: string;
  setCode: string;
  setName: string;
  cardName: string;
  rarity: string;
  artworkRarity: string;
  quantity: number;
  locale: string;
}

interface CatalogCard {
  id: number;
  unique_id: string | null;
  card_number: string | null;
  name: string;
  rarity: string | null;
  set_code: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCardNumber(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === ',' && !quoted) {
      cells.push(value);
      value = '';
      continue;
    }

    value += ch;
  }

  cells.push(value);
  return cells;
}

function splitCsvRecords(csv: string): string[] {
  const records: string[] = [];
  let record = '';
  let quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (ch === '"') {
      record += ch;
      if (quoted && csv[i + 1] === '"') {
        record += csv[i + 1];
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (record.trim()) records.push(record);
      record = '';
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      continue;
    }

    record += ch;
  }

  if (record.trim()) records.push(record);
  return records;
}

export function parseLogiaCsv(csv: string): LogiaRow[] {
  const cleaned = csv.replace(/^\uFEFF/, '');
  const records = splitCsvRecords(cleaned);
  if (records.length < 2) throw new Error('The CSV file is empty.');

  const header = parseCsvLine(records[0]).map(v => v.trim().toLowerCase());
  const required = ['card_number', 'set_code', 'set_name', 'card_name', 'rarity', 'artwork_rarity', 'quantity', 'locale'];

  for (const column of required) {
    if (!header.includes(column)) {
      throw new Error(`This does not look like a Logia collection export. Missing column: ${column}`);
    }
  }

  const index = (name: string) => header.indexOf(name);
  const rows: LogiaRow[] = [];

  for (let i = 1; i < records.length; i++) {
    const cells = parseCsvLine(records[i]);
    const quantityRaw = cells[index('quantity')]?.trim() ?? '';
    const quantity = Number.parseInt(quantityRaw, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    rows.push({
      cardNumber: cells[index('card_number')]?.trim() ?? '',
      setCode: cells[index('set_code')]?.trim() ?? '',
      setName: cells[index('set_name')]?.trim() ?? '',
      cardName: cells[index('card_name')]?.trim() ?? '',
      rarity: cells[index('rarity')]?.trim() ?? '',
      artworkRarity: cells[index('artwork_rarity')]?.trim() ?? '',
      quantity,
      locale: cells[index('locale')]?.trim() ?? '',
    });
  }

  if (!rows.length) throw new Error('The Logia CSV contains no cards with quantity greater than zero.');
  return rows;
}

function isParallel(card: CatalogCard): boolean {
  return /_p\d*$/i.test(card.unique_id ?? '') || /_p/i.test(card.unique_id ?? '');
}

function chooseCandidate(row: LogiaRow, input: CatalogCard[]): { card: CatalogCard | null; ambiguous: boolean } {
  if (!input.length) return { card: null, ambiguous: false };

  let candidates = input;
  const targetName = normalizeText(row.cardName);
  const nameMatches = candidates.filter(c => normalizeText(c.name) === targetName);
  if (nameMatches.length) candidates = nameMatches;

  const wantsAlternate = /alternate|parallel/i.test(row.artworkRarity);
  const artMatches = candidates.filter(c => isParallel(c) === wantsAlternate);
  if (artMatches.length) candidates = artMatches;

  const targetRarity = normalizeText(row.rarity);
  if (targetRarity) {
    const rarityMatches = candidates.filter(c => normalizeText(c.rarity) === targetRarity);
    if (rarityMatches.length) candidates = rarityMatches;
  }

  candidates = [...candidates].sort((a, b) => {
    const aId = a.unique_id ?? '';
    const bId = b.unique_id ?? '';
    return aId.localeCompare(bId);
  });

  return {
    card: candidates[0] ?? null,
    ambiguous: candidates.length > 1,
  };
}

export async function importLogiaOnePieceCollection(
  db: SQLite.SQLiteDatabase,
  csv: string,
  mode: LogiaImportMode
): Promise<LogiaImportResult> {
  const rows = parseLogiaCsv(csv);
  const catalog = await db.getAllAsync<CatalogCard>(
    `SELECT id, unique_id, card_number, name, rarity, set_code
     FROM cards`
  );

  if (!catalog.length) {
    throw new Error('The One Piece catalog is empty. Sync the card database first.');
  }

  const byNumber = new Map<string, CatalogCard[]>();
  const byName = new Map<string, CatalogCard[]>();

  for (const card of catalog) {
    const number = normalizeCardNumber(card.card_number);
    if (number) {
      const list = byNumber.get(number) ?? [];
      list.push(card);
      byNumber.set(number, list);
    }

    const name = normalizeText(card.name);
    if (name) {
      const list = byName.get(name) ?? [];
      list.push(card);
      byName.set(name, list);
    }
  }

  const quantities = new Map<number, { qty: number; language: string | null }>();
  const skippedPreview: string[] = [];
  let matchedRows = 0;
  let importedCopies = 0;
  let ambiguousRows = 0;

  for (const row of rows) {
    const number = normalizeCardNumber(row.cardNumber);
    let candidates = number ? (byNumber.get(number) ?? []) : [];

    if (!candidates.length && row.cardName) {
      candidates = byName.get(normalizeText(row.cardName)) ?? [];
    }

    const { card, ambiguous } = chooseCandidate(row, candidates);
    if (!card) {
      if (skippedPreview.length < 8) {
        skippedPreview.push(
          row.cardNumber
            ? `${row.cardNumber} — ${row.cardName}`
            : `${row.cardName} (${row.setName || 'unknown set'})`
        );
      }
      continue;
    }

    if (ambiguous) ambiguousRows++;
    matchedRows++;
    importedCopies += row.quantity;

    const current = quantities.get(card.id) ?? { qty: 0, language: null };
    current.qty += row.quantity;
    if (!current.language && row.locale) current.language = row.locale;
    quantities.set(card.id, current);
  }

  if (mode === 'replace') {
    await db.runAsync('DELETE FROM user_collection');
    await db.runAsync('DELETE FROM card_printing_collection');
  }

  for (const [cardId, item] of quantities) {
    if (mode === 'merge') {
      await db.runAsync(
        `INSERT INTO user_collection
          (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, condition, language, note, updated_at)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, NULL, ?, 'Imported from Logia CSV', datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET
           qty = user_collection.qty + excluded.qty,
           language = COALESCE(user_collection.language, excluded.language),
           updated_at = datetime('now')`,
        [cardId, item.qty, item.language]
      );
    } else {
      await db.runAsync(
        `INSERT INTO user_collection
          (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, condition, language, note, updated_at)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, NULL, ?, 'Imported from Logia CSV', datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET
           qty = excluded.qty,
           qty_foil = 0,
           qty_enchanted = 0,
           qty_epic = 0,
           qty_promo = 0,
           qty_iconic = 0,
           qty_play = 0,
           language = excluded.language,
           note = excluded.note,
           updated_at = datetime('now')`,
        [cardId, item.qty, item.language]
      );
    }
  }

  const skippedRows = rows.length - matchedRows;
  await db.runAsync(
    `INSERT INTO import_log (imported_at, source, notes)
     VALUES (datetime('now'), 'Logia CSV', ?)`,
    [
      `Mode: ${mode}. Rows: ${rows.length}. Matched: ${matchedRows}. Skipped: ${skippedRows}. Cards: ${quantities.size}. Copies: ${importedCopies}. Ambiguous: ${ambiguousRows}.`,
    ]
  );

  return {
    totalRows: rows.length,
    matchedRows,
    importedCards: quantities.size,
    importedCopies,
    skippedRows,
    ambiguousRows,
    skippedPreview,
  };
}
