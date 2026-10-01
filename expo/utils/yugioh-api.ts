/**
 * Yu-Gi-Oh! catalog client using the public YGOPRODeck API v7.
 * We request TCG cards with misc metadata once during catalog sync and persist them locally.
 */
const CARDINFO_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg&misc=yes';

export interface YugiohCardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code?: string;
  set_price?: string;
}

export interface YugiohCardImage {
  id: number;
  image_url: string;
  image_url_small: string;
  image_url_cropped?: string;
}

export interface YugiohCardPrice {
  cardmarket_price?: string;
  tcgplayer_price?: string;
  ebay_price?: string;
  amazon_price?: string;
  coolstuffinc_price?: string;
}

export interface YugiohApiCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race?: string;
  attribute?: string;
  archetype?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  card_sets?: YugiohCardSet[];
  card_images?: YugiohCardImage[];
  card_prices?: YugiohCardPrice[];
  banlist_info?: {
    ban_tcg?: string;
    ban_ocg?: string;
    ban_goat?: string;
  };
  formats?: string[];
  treated_as?: string;
  tcg_date?: string;
  ocg_date?: string;
  konami_id?: number;
  has_effect?: number;
}

interface YugiohResponse {
  data?: YugiohApiCard[];
}

export async function fetchAllYugiohCards(
  onProgress?: (current: number, total: number) => void
): Promise<YugiohApiCard[]> {
  console.log('[YGO API] Fetching TCG catalog from YGOPRODeck v7...');
  const response = await fetch(CARDINFO_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`YGOPRODeck API ${response.status}: ${body.substring(0, 200)}`);
  }

  const json = await response.json() as YugiohResponse;
  const cards = Array.isArray(json.data) ? json.data : [];
  onProgress?.(cards.length, cards.length);
  console.log(`[YGO API] Received ${cards.length} TCG cards`);
  return cards;
}
