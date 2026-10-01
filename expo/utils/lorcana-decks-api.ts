/**
 * Lorcana community decks API client.
 * Source: https://api-lorcana.com (open data, no auth required).
 *
 * Cards are referenced by "dreamborn" IDs in the format `SSS-NNN`
 * (set number 1-based, card number, both zero-padded to 3 digits).
 * We map them onto the local `cards` table via (set_code, card_number).
 */

const BASE_URL = 'https://api-lorcana.com';

export interface LorcanaDeckSummary {
  uuid: string;
  name: string;
  creator: string;
  creator_name?: string;
  cardsCount: number;
  views?: number;
  likes?: number;
  updated_at?: string;
  youtube?: string;
}

export interface LorcanaDeckCardRef {
  /** Dreamborn ID, e.g. "006-049" (set 6, card 49). */
  dreamborn: string;
  count: number;
}

export interface LorcanaDeckDetail extends LorcanaDeckSummary {
  cards: LorcanaDeckCardRef[];
}

/** Set_Num (1-based) -> Set_ID used by lorcana-api.com (matches our cards.set_code). */
export const LORCANA_SET_NUM_TO_CODE: Record<number, string> = {
  1: 'TFC',
  2: 'ROF',
  3: 'INK',
  4: 'URS',
  5: 'SSK',
  6: 'AZS',
  7: 'ARI',
  8: 'ROJ',
  9: 'FAB',
  10: 'WHI',
};

/** Parses "006-049" -> { setCode: "AZS", cardNum: "49" }. Returns null if malformed/unknown set. */
export function parseDreambornId(dreamborn: string): { setCode: string; cardNum: string } | null {
  const m = /^(\d{1,3})-(\d{1,3})$/.exec(dreamborn.trim());
  if (!m) return null;
  const setNum = parseInt(m[1], 10);
  const cardNum = parseInt(m[2], 10);
  const setCode = LORCANA_SET_NUM_TO_CODE[setNum];
  if (!setCode || !Number.isFinite(cardNum)) return null;
  return { setCode, cardNum: cardNum.toString() };
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log(`[lorcana-decks] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Lorcana decks API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchTrendingDecks(): Promise<LorcanaDeckSummary[]> {
  const data = await getJson<LorcanaDeckSummary[]>('/decks/trending');
  return Array.isArray(data) ? data : [];
}

/**
 * Fetches the full deck catalog from api-lorcana.com (~11 MB).
 * Use sparingly — React Query caching is essential.
 * Each entry includes the full card list, so we strip it to keep memory low.
 */
export async function fetchAllDecks(): Promise<LorcanaDeckSummary[]> {
  const data = await getJson<(LorcanaDeckSummary & { cards?: unknown })[]>('/decks');
  if (!Array.isArray(data)) return [];
  return data.map(({ cards: _cards, ...rest }) => rest);
}

/** Same as fetchAllDecks but keeps the card list per deck. Heavier — only use when needed. */
export async function fetchAllDecksWithCards(): Promise<LorcanaDeckDetail[]> {
  const data = await getJson<LorcanaDeckDetail[]>('/decks');
  if (!Array.isArray(data)) return [];
  return data.filter(d => Array.isArray(d.cards));
}

/** Extracts unique set codes from a deck's card refs. Used to derive deck colors lazily. */
export function dreambornSetCodes(cards: LorcanaDeckCardRef[]): string[] {
  const codes = new Set<string>();
  for (const c of cards) {
    const p = parseDreambornId(c.dreamborn);
    if (p) codes.add(p.setCode);
  }
  return [...codes];
}

export async function fetchDeckById(uuid: string): Promise<LorcanaDeckDetail> {
  return getJson<LorcanaDeckDetail>(`/deck/${encodeURIComponent(uuid)}`);
}
