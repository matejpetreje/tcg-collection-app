import * as SQLite from 'expo-sqlite';
import { safeQueryFirst, safeRun } from './database';
import { getSetNumber } from '@/constants/sets';
import type { TCGId } from '@/constants/tcgs';

const DOTGG_API_BASE = 'https://api.dotgg.gg/cgfw';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

/** Map our internal TCG id to the dotgg.gg `game` query param. */
function dotggGameParam(tcg: TCGId | null | undefined): 'lorcana' | 'onepiece' | null {
  if (tcg === 'lorcana') return 'lorcana';
  if (tcg === 'onepiece') return 'onepiece';
  return null;
}

export interface DotggPriceData {
  dotggCardId: string;
  normalPrice: number | null;
  foilPrice: number | null;
  coldFoilPrice: number | null;
  cmNormalPrice: number | null;
  cmFoilPrice: number | null;
  priceDate: string | null;
}

interface DotggPriceHistoryLine {
  date: string;
  lowPrice: string | null;
  highPrice: string | null;
  openPrice: string | null;
  closePrice: string | null;
  Normal: string | null;
  Foil: string | null;
  Holofoil: string | null;
  ColdFoil: string | null;
}

interface DotggPriceResponse {
  cardid: string;
  fromdate: number;
  todate: number;
  fromdate_ymd: string;
  todate_ymd: string;
  lines: DotggPriceHistoryLine[];
  lines_cm: DotggPriceHistoryLine[];
  error?: boolean;
  error_text?: string;
}

interface CachedDotggRow {
  card_id: number;
  dotgg_card_id: string;
  normal_price: number | null;
  foil_price: number | null;
  cold_foil_price: number | null;
  cm_normal_price: number | null;
  cm_foil_price: number | null;
  price_date: string | null;
  fetched_at: string;
}

export const DOTGG_PRICES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS dotgg_prices (
  card_id INTEGER PRIMARY KEY,
  dotgg_card_id TEXT NOT NULL,
  normal_price REAL,
  foil_price REAL,
  cold_foil_price REAL,
  cm_normal_price REAL,
  cm_foil_price REAL,
  price_date TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
`;

export function buildDotggCardId(
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
  tcg: TCGId | null | undefined = 'lorcana',
): string | null {
  if (tcg === 'onepiece') {
    // One Piece dotgg uses the printed code directly (e.g. "OP01-001", "ST01-001", "EB01-001").
    // Strip parallel-art suffixes like "_p1" so the base printing is queried.
    if (!cardNumber) return null;
    const base = cardNumber.split('_')[0].trim().toUpperCase();
    if (!/^[A-Z]+\d+-\d+/.test(base)) return null;
    return base;
  }

  if (tcg !== 'lorcana') return null;

  // Lorcana: dotgg uses `SSS-NNN` (zero-padded set number + card number).
  const setNum = getSetNumber(setName);
  if (setNum === null || !cardNumber) return null;

  const paddedSet = String(setNum).padStart(3, '0');
  const numOnly = cardNumber.replace(/\D/g, '');
  if (!numOnly) return null;
  const paddedCard = numOnly.padStart(3, '0');

  return `${paddedSet}-${paddedCard}`;
}

function parsePrice(val: string | null | undefined): number | null {
  if (val === null || val === undefined || val === '' || val === '0' || val === '0.000000') return null;
  const num = parseFloat(val);
  return isNaN(num) || num === 0 ? null : num;
}

async function fetchDotggPrices(dotggCardId: string, tcg: TCGId | null | undefined): Promise<DotggPriceData | null> {
  try {
    const game = dotggGameParam(tcg);
    if (!game) return null;
    const url = `${DOTGG_API_BASE}/getcardprices?game=${game}&cardid=${encodeURIComponent(dotggCardId)}`;
    console.log(`[DotGG] Fetching prices for: ${dotggCardId} (game=${game})`);

    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[DotGG] HTTP error: ${response.status}`);
      return null;
    }

    const data: DotggPriceResponse = await response.json();
    if (data.error) {
      console.log(`[DotGG] API error: ${data.error_text}`);
      return null;
    }

    let normalPrice: number | null = null;
    let foilPrice: number | null = null;
    let coldFoilPrice: number | null = null;
    let priceDate: string | null = null;

    if (data.lines && data.lines.length > 0) {
      const latest = data.lines[data.lines.length - 1];
      normalPrice = parsePrice(latest.Normal);
      foilPrice = parsePrice(latest.Foil);
      coldFoilPrice = parsePrice(latest.ColdFoil);
      const ts = parseInt(latest.date, 10);
      if (!isNaN(ts)) {
        priceDate = new Date(ts * 1000).toISOString().split('T')[0];
      }
    }

    let cmNormalPrice: number | null = null;
    let cmFoilPrice: number | null = null;

    if (data.lines_cm && data.lines_cm.length > 0) {
      const latestCm = data.lines_cm[data.lines_cm.length - 1];
      cmNormalPrice = parsePrice(latestCm.Normal);
      cmFoilPrice = parsePrice(latestCm.Foil);
    }

    console.log(`[DotGG] Prices for ${dotggCardId}: Normal=$${normalPrice}, Foil=$${foilPrice}, ColdFoil=$${coldFoilPrice}, CM_Normal=€${cmNormalPrice}, CM_Foil=€${cmFoilPrice}`);

    return {
      dotggCardId,
      normalPrice,
      foilPrice,
      coldFoilPrice,
      cmNormalPrice,
      cmFoilPrice,
      priceDate,
    };
  } catch (error) {
    console.log('[DotGG] Fetch error:', (error as Error).message);
    return null;
  }
}

async function getCachedDotggPrice(
  db: SQLite.SQLiteDatabase,
  cardId: number,
): Promise<DotggPriceData | null> {
  const cached = await safeQueryFirst<CachedDotggRow>(
    db,
    'SELECT * FROM dotgg_prices WHERE card_id = ?',
    [cardId],
  );

  if (!cached) return null;

  const fetchedAt = new Date(cached.fetched_at + 'Z').getTime();
  if (Date.now() - fetchedAt > CACHE_DURATION_MS) {
    console.log(`[DotGG] Cache expired for card ${cardId}`);
    return null;
  }

  return {
    dotggCardId: cached.dotgg_card_id,
    normalPrice: cached.normal_price,
    foilPrice: cached.foil_price,
    coldFoilPrice: cached.cold_foil_price,
    cmNormalPrice: cached.cm_normal_price,
    cmFoilPrice: cached.cm_foil_price,
    priceDate: cached.price_date,
  };
}

async function cacheDotggPrice(
  db: SQLite.SQLiteDatabase,
  cardId: number,
  data: DotggPriceData,
): Promise<void> {
  await safeRun(
    db,
    `INSERT INTO dotgg_prices (card_id, dotgg_card_id, normal_price, foil_price, cold_foil_price, cm_normal_price, cm_foil_price, price_date, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(card_id) DO UPDATE SET
       dotgg_card_id = excluded.dotgg_card_id,
       normal_price = excluded.normal_price,
       foil_price = excluded.foil_price,
       cold_foil_price = excluded.cold_foil_price,
       cm_normal_price = excluded.cm_normal_price,
       cm_foil_price = excluded.cm_foil_price,
       price_date = excluded.price_date,
       fetched_at = datetime('now')`,
    [cardId, data.dotggCardId, data.normalPrice, data.foilPrice, data.coldFoilPrice, data.cmNormalPrice, data.cmFoilPrice, data.priceDate],
  );
}

export async function ensureDotggTable(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(DOTGG_PRICES_TABLE_SQL);
}

export async function fetchAndCacheDotggPrice(
  db: SQLite.SQLiteDatabase,
  cardId: number,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
  tcg: TCGId | null | undefined = 'lorcana',
): Promise<DotggPriceData | null> {
  if (!dotggGameParam(tcg)) {
    return null;
  }

  await ensureDotggTable(db);

  const cached = await getCachedDotggPrice(db, cardId);
  if (cached) {
    console.log(`[DotGG] Using cached price for card ${cardId}`);
    return cached;
  }

  const dotggId = buildDotggCardId(setName, cardNumber, tcg);
  if (!dotggId) {
    console.log(`[DotGG] Cannot build card ID for card ${cardId} (tcg: ${tcg}, set: ${setName}, num: ${cardNumber})`);
    return null;
  }

  const priceData = await fetchDotggPrices(dotggId, tcg);
  if (priceData) {
    await cacheDotggPrice(db, cardId, priceData);
    return priceData;
  }

  return null;
}
