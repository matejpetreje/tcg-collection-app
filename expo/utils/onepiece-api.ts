/**
 * One Piece Card Game API client — uses the free, open optcgapi.com endpoints.
 * No API key required. Combines booster set cards, starter deck cards, and promos.
 */
const BASE_URL = 'https://optcgapi.com/api';

interface RawCard {
  inventory_price?: number | null;
  market_price?: number | null;
  card_name?: string | null;
  set_name?: string | null;
  card_text?: string | null;
  set_id?: string | null;
  rarity?: string | null;
  card_set_id?: string | null;
  card_color?: string | null;
  card_type?: string | null;
  life?: string | number | null;
  card_cost?: string | number | null;
  card_power?: string | number | null;
  sub_types?: string | null;
  counter_amount?: string | number | null;
  attribute?: string | null;
  date_scraped?: string | null;
  card_image_id?: string | null;
  card_image?: string | null;
}

export interface OnePieceApiCard {
  id: string;
  code: string;
  rarity: string;
  type: string;
  name: string;
  images: { small?: string; large?: string };
  cost?: number | null;
  attribute?: { name?: string; image?: string } | null;
  power?: number | null;
  counter?: string | number | null;
  color?: string | null;
  family?: string | null;
  ability?: string | null;
  trigger?: string | null;
  set?: { name?: string } | null;
  life?: number | null;
  marketPrice?: number | null;
  inventoryPrice?: number | null;
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = v.trim();
  if (!t || t === '-' || t.toUpperCase() === 'N/A') return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function normalize(raw: RawCard): OnePieceApiCard | null {
  const code = raw.card_set_id ?? null;
  const name = raw.card_name ?? null;
  if (!code || !name) return null;

  // Use card_image_id when available (distinguishes parallel arts: OP01-001 vs OP01-001_p1),
  // otherwise fall back to a deterministic key based on code + name.
  const id = raw.card_image_id && raw.card_image_id.length > 0
    ? raw.card_image_id
    : `${code}__${name}`;

  return {
    id,
    code,
    name,
    rarity: raw.rarity ?? '',
    type: raw.card_type ?? '',
    color: raw.card_color ?? null,
    cost: toNumber(raw.card_cost),
    power: toNumber(raw.card_power),
    counter: toNumber(raw.counter_amount),
    life: toNumber(raw.life),
    family: raw.sub_types ?? null,
    ability: raw.card_text ?? null,
    trigger: null,
    attribute: raw.attribute ? { name: raw.attribute } : null,
    set: raw.set_name ? { name: raw.set_name } : null,
    images: raw.card_image
      ? { small: raw.card_image, large: raw.card_image }
      : {},
    marketPrice: raw.market_price ?? null,
    inventoryPrice: raw.inventory_price ?? null,
  };
}

async function fetchJson(path: string): Promise<RawCard[]> {
  const url = `${BASE_URL}/${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`optcgapi ${res.status} (${path}): ${text.substring(0, 200)}`);
  }
  return (await res.json()) as RawCard[];
}

export async function fetchAllOnePieceCards(
  onProgress?: (current: number, total: number) => void
): Promise<OnePieceApiCard[]> {
  console.log('[OP API] Fetching all One Piece cards from optcgapi.com...');

  // Pull the three buckets in parallel: booster sets, starter decks, promos.
  const [setCards, stCards, promos] = await Promise.all([
    fetchJson('allSetCards/').catch((e) => {
      console.warn('[OP API] allSetCards failed:', (e as Error).message);
      return [] as RawCard[];
    }),
    fetchJson('allSTCards/').catch((e) => {
      console.warn('[OP API] allSTCards failed:', (e as Error).message);
      return [] as RawCard[];
    }),
    fetchJson('allPromos/').catch((e) => {
      console.warn('[OP API] allPromos failed:', (e as Error).message);
      return [] as RawCard[];
    }),
  ]);

  const combined = [...setCards, ...stCards, ...promos];
  const total = combined.length;
  onProgress?.(0, total);

  // Deduplicate by normalized id while preserving first occurrence.
  const seen = new Map<string, OnePieceApiCard>();
  for (const raw of combined) {
    const card = normalize(raw);
    if (!card) continue;
    if (!seen.has(card.id)) seen.set(card.id, card);
  }

  const all = Array.from(seen.values());
  onProgress?.(all.length, all.length);
  console.log(`[OP API] Total ${all.length} unique cards (sets:${setCards.length} st:${stCards.length} promos:${promos.length})`);
  return all;
}
