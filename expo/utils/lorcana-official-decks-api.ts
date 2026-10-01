/**
 * Official Lorcana decks via lorcanajson.org.
 *
 * Source: https://lorcanajson.org/files/current/en/decks/deckdata.{deckId}.json
 *
 * Each deck references cards by lorcanajson's *global* card id (integer).
 * To render those cards from our local SQLite catalog (which is keyed by
 * `set_code` + `card_number`), we fetch `allCards.json` once per session
 * and build an `id -> { setCode, cardNumber }` map.
 */

const BASE_URL = 'https://lorcanajson.org/files/current/en';

export type OfficialDeckType = 'Starter Deck' | 'Gateway' | 'Quest';

export interface OfficialDeckCardRef {
  id: number;
  amount: number;
  isFoil?: boolean;
}

export interface OfficialDeckDetail {
  deckId: string; // e.g. "S1-1"
  name: string;
  type: OfficialDeckType;
  deckGroup: string; // "S1" | "G1" | "Q1" | ...
  colors: string[];
  cards: OfficialDeckCardRef[];
  foilIds?: number[];
}

/**
 * Set number (string in lorcanajson, e.g. "1", "11", "Q1") -> set_code used
 * by lorcana-api.com (our local catalog).
 */
export const LORCANAJSON_SET_TO_LOCAL_CODE: Record<string, string> = {
  '1': 'TFC',
  '2': 'ROF',
  '3': 'INK',
  '4': 'URS',
  '5': 'SSK',
  '6': 'AZS',
  '7': 'ARI',
  '8': 'ROJ',
  '9': 'FAB',
  '10': 'WHI',
  '11': 'WIN',
  Q1: 'QU1',
};

async function getJson<T>(url: string): Promise<T> {
  console.log(`[lorcanajson] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`lorcanajson ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface RawDeckData {
  name: string;
  type: string;
  deckGroup?: string;
  colors?: string[];
  foilIds?: number[];
  cards: { id: number; amount: number; isFoil?: boolean }[];
}

export async function fetchOfficialDeck(deckId: string): Promise<OfficialDeckDetail> {
  const data = await getJson<RawDeckData>(`${BASE_URL}/decks/deckdata.${encodeURIComponent(deckId)}.json`);
  const type: OfficialDeckType =
    data.type === 'Gateway' ? 'Gateway'
    : data.type === 'Quest' ? 'Quest'
    : 'Starter Deck';
  return {
    deckId,
    name: data.name,
    type,
    deckGroup: data.deckGroup ?? deckId.split('-')[0],
    colors: data.colors ?? [],
    cards: data.cards ?? [],
    foilIds: data.foilIds,
  };
}

export interface AllCardsLookupEntry {
  setCode: string; // local set_code, e.g. "TFC"
  cardNumber: string; // e.g. "12"
  name?: string;
  rarity?: string;
}

interface RawAllCards {
  cards: { id: number; number: number; setCode: string; fullName?: string; rarity?: string }[];
}

let cachedLookup: Map<number, AllCardsLookupEntry> | null = null;
let cachedLookupAt = 0;
const LOOKUP_TTL_MS = 1000 * 60 * 60 * 12;

/**
 * Fetches the lorcanajson `allCards.json` (~8 MB) and builds a map from
 * global card id to local-catalog identifiers. Cached in-process for 12h.
 */
export async function getOfficialCardLookup(): Promise<Map<number, AllCardsLookupEntry>> {
  if (cachedLookup && Date.now() - cachedLookupAt < LOOKUP_TTL_MS) {
    return cachedLookup;
  }
  const raw = await getJson<RawAllCards>(`${BASE_URL}/allCards.json`);
  const map = new Map<number, AllCardsLookupEntry>();
  for (const c of raw.cards ?? []) {
    const setCode = LORCANAJSON_SET_TO_LOCAL_CODE[c.setCode];
    if (!setCode) continue;
    map.set(c.id, {
      setCode,
      cardNumber: String(c.number),
      name: c.fullName,
      rarity: c.rarity,
    });
  }
  cachedLookup = map;
  cachedLookupAt = Date.now();
  return map;
}
