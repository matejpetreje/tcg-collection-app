export interface MtgPrintingPrice {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

export interface MtgCatalogPrinting {
  scryfall_id: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string | null;
  released_at: string | null;
  artist: string | null;
  finishes: string[];
  promo: boolean;
  reprint: boolean;
  prices: MtgPrintingPrice;
  image_url: string | null;
  thumbnail_url: string | null;
  scryfall_uri: string | null;
}

export interface MtgCatalogCard {
  oracle_id: string;
  name: string;
  layout: string | null;
  mana_cost: string | null;
  mana_value: number | null;
  colors: string[];
  color_identity: string[];
  type_line: string | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  keywords: string[];
  legalities: Record<string, string>;
  reserved: boolean;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  released_at: string | null;
  artist: string | null;
  market_price: number | null;
  foil_price: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  printings: MtgCatalogPrinting[];
}

interface MtgCatalogPage {
  data: MtgCatalogCard[];
  next_cursor: number | null;
  total: number;
}

function catalogBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_CATALOG_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window !== 'undefined') return 'http://localhost:8787';

  throw new Error(
    'EXPO_PUBLIC_CATALOG_API_URL is not configured. Point it to the TCG catalog server.'
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Catalog server HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchAllMtgCards(
  onProgress?: (current: number, total: number) => void
): Promise<MtgCatalogCard[]> {
  const base = catalogBaseUrl();
  console.log(`[MTG API] Fetching normalized catalog from ${base}...`);

  const cards: MtgCatalogCard[] = [];
  let cursor: number | null = 0;
  let total = 0;

  while (cursor !== null) {
    const page: MtgCatalogPage = await fetchJson<MtgCatalogPage>(
      `${base}/catalog/mtg/cards?cursor=${cursor}&limit=500`
    );

    total = page.total;
    cards.push(...page.data);
    onProgress?.(cards.length, total);

    cursor = page.next_cursor;
  }

  console.log(`[MTG API] Received ${cards.length} oracle cards from catalog server`);
  return cards;
}
