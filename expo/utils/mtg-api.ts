export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface ScryfallCardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  image_uris?: ScryfallImageUris;
}

export interface ScryfallPrices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang?: string;
  released_at?: string;
  layout?: string;
  highres_image?: boolean;
  image_status?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  legalities?: Record<string, string>;
  games?: string[];
  reserved?: boolean;
  foil?: boolean;
  nonfoil?: boolean;
  finishes?: string[];
  oversized?: boolean;
  promo?: boolean;
  reprint?: boolean;
  variation?: boolean;
  set_id?: string;
  set: string;
  set_name: string;
  set_type?: string;
  collector_number: string;
  digital?: boolean;
  rarity: string;
  artist?: string;
  illustration_id?: string;
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  full_art?: boolean;
  textless?: boolean;
  booster?: boolean;
  story_spotlight?: boolean;
  edhrec_rank?: number;
  penny_rank?: number;
  prices?: ScryfallPrices;
  related_uris?: Record<string, string>;
  purchase_uris?: Record<string, string>;
  scryfall_uri?: string;
}

interface ScryfallList<T> {
  object: 'list';
  total_cards?: number;
  has_more: boolean;
  next_page?: string | null;
  data: T[];
}

const SEARCH_URL =
  'https://api.scryfall.com/cards/search?q=game%3Apaper&unique=prints&order=name&dir=asc';

const REQUEST_DELAY_MS = 125;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Scryfall HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchAllMtgPrintings(
  onProgress?: (current: number, total: number) => void
): Promise<ScryfallCard[]> {
  console.log('[MTG API] Fetching paper printings from Scryfall...');

  const cards: ScryfallCard[] = [];
  let nextUrl: string | null = SEARCH_URL;
  let total = 0;
  let page = 0;

  while (nextUrl) {
    const result: ScryfallList<ScryfallCard> = await fetchJson<ScryfallList<ScryfallCard>>(nextUrl);
    page += 1;

    if (page === 1) {
      total = result.total_cards ?? 0;
      console.log(`[MTG API] Scryfall reports ${total || 'unknown'} paper printings`);
    }

    cards.push(...result.data);
    onProgress?.(cards.length, total || cards.length);

    nextUrl = result.has_more && result.next_page ? result.next_page : null;
    if (nextUrl) await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[MTG API] Received ${cards.length} paper printings`);
  return cards;
}
