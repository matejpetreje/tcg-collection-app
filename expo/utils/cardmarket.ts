import CryptoJS from 'crypto-js';
import * as SQLite from 'expo-sqlite';
import { safeQueryFirst, safeRun } from './database';

const CM_API_BASE = 'https://api.cardmarket.com/ws/v2.0/output.json';
const LORCANA_GAME_ID = 9;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

export interface CardmarketPriceData {
  idProduct: number;
  avgPrice: number | null;
  sellPrice: number | null;
  trendPrice: number | null;
  lowPrice: number | null;
  websiteUrl: string | null;
}

interface CachedPriceRow {
  card_id: number;
  cm_product_id: number | null;
  avg_price: number | null;
  sell_price: number | null;
  trend_price: number | null;
  low_price: number | null;
  website_url: string | null;
  fetched_at: string;
}

function generateNonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function buildOAuthHeader(method: string, fullUrl: string): string {
  const appToken = process.env.EXPO_PUBLIC_CM_APP_TOKEN ?? '';
  const appSecret = process.env.EXPO_PUBLIC_CM_APP_SECRET ?? '';
  const accessToken = process.env.EXPO_PUBLIC_CM_ACCESS_TOKEN ?? '';
  const accessSecret = process.env.EXPO_PUBLIC_CM_ACCESS_SECRET ?? '';

  const [baseUrl, queryString] = fullUrl.split('?');

  const queryParams: Record<string, string> = {};
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > -1) {
        queryParams[decodeURIComponent(pair.substring(0, eqIdx))] = decodeURIComponent(pair.substring(eqIdx + 1));
      }
    });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: appToken,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParams: Record<string, string> = { ...oauthParams, ...queryParams };

  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(baseUrl),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = `${encodeURIComponent(appSecret)}&${encodeURIComponent(accessSecret)}`;
  const signature = CryptoJS.HmacSHA1(baseString, signingKey).toString(CryptoJS.enc.Base64);

  oauthParams['oauth_signature'] = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(k => `${k}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return `OAuth realm="${encodeURIComponent(baseUrl)}", ${headerParts}`;
}

async function cmFetch<T = unknown>(endpoint: string): Promise<T> {
  const url = `${CM_API_BASE}${endpoint}`;
  const authHeader = buildOAuthHeader('GET', url);

  console.log(`[Cardmarket] Fetching: ${endpoint}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.log(`[Cardmarket] Error ${response.status}: ${text.substring(0, 300)}`);
    throw new Error(`Cardmarket API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

interface CMProductSearchResult {
  product?: Array<{
    idProduct: number;
    enName?: string;
    website?: string;
    expansion?: { enName?: string };
    priceGuide?: {
      AVG?: number;
      SELL?: number;
      TREND?: number;
      LOW?: number;
    };
  }>;
}

interface CMProductDetailResult {
  product?: {
    idProduct: number;
    website?: string;
    priceGuide?: {
      AVG?: number;
      SELL?: number;
      TREND?: number;
      LOW?: number;
    };
  };
}

export async function searchCardmarketProduct(
  cardName: string,
  setName?: string | null,
): Promise<{ idProduct: number; websiteUrl: string | null; priceGuide: { AVG?: number; SELL?: number; TREND?: number; LOW?: number } | null } | null> {
  try {
    const searchQuery = encodeURIComponent(cardName);
    const data = await cmFetch<CMProductSearchResult>(
      `/products/find?search=${searchQuery}&idGame=${LORCANA_GAME_ID}&maxResults=10`
    );

    const products = data?.product ?? [];
    if (products.length === 0) {
      console.log(`[Cardmarket] No products found for "${cardName}"`);
      return null;
    }

    let match = products[0];
    if (setName && products.length > 1) {
      const setLower = setName.toLowerCase();
      const setMatch = products.find(p =>
        p.expansion?.enName?.toLowerCase().includes(setLower)
      );
      if (setMatch) match = setMatch;
    }

    console.log(`[Cardmarket] Found product: ${match.idProduct} - ${match.enName ?? cardName}`);

    return {
      idProduct: match.idProduct,
      websiteUrl: match.website ? `https://www.cardmarket.com${match.website}` : null,
      priceGuide: match.priceGuide ?? null,
    };
  } catch (error) {
    console.log('[Cardmarket] Search error:', (error as Error).message);
    return null;
  }
}

export async function getProductPrices(idProduct: number): Promise<CardmarketPriceData | null> {
  try {
    const data = await cmFetch<CMProductDetailResult>(`/products/${idProduct}`);
    const product = data?.product;
    if (!product) return null;

    const pg = product.priceGuide;
    return {
      idProduct: product.idProduct,
      avgPrice: pg?.AVG ?? null,
      sellPrice: pg?.SELL ?? null,
      trendPrice: pg?.TREND ?? null,
      lowPrice: pg?.LOW ?? null,
      websiteUrl: product.website ? `https://www.cardmarket.com${product.website}` : null,
    };
  } catch (error) {
    console.log('[Cardmarket] Product price error:', (error as Error).message);
    return null;
  }
}

export async function getCachedPrice(
  db: SQLite.SQLiteDatabase,
  cardId: number,
): Promise<CardmarketPriceData | null> {
  const cached = await safeQueryFirst<CachedPriceRow>(
    db,
    'SELECT * FROM cardmarket_prices WHERE card_id = ?',
    [cardId],
  );

  if (!cached || !cached.cm_product_id) return null;

  const fetchedAt = new Date(cached.fetched_at + 'Z').getTime();
  const now = Date.now();
  if (now - fetchedAt > CACHE_DURATION_MS) {
    console.log(`[Cardmarket] Cache expired for card ${cardId}`);
    return null;
  }

  return {
    idProduct: cached.cm_product_id,
    avgPrice: cached.avg_price,
    sellPrice: cached.sell_price,
    trendPrice: cached.trend_price,
    lowPrice: cached.low_price,
    websiteUrl: cached.website_url,
  };
}

async function cachePrice(
  db: SQLite.SQLiteDatabase,
  cardId: number,
  data: CardmarketPriceData,
): Promise<void> {
  await safeRun(
    db,
    `INSERT INTO cardmarket_prices (card_id, cm_product_id, avg_price, sell_price, trend_price, low_price, website_url, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(card_id) DO UPDATE SET
       cm_product_id = excluded.cm_product_id,
       avg_price = excluded.avg_price,
       sell_price = excluded.sell_price,
       trend_price = excluded.trend_price,
       low_price = excluded.low_price,
       website_url = excluded.website_url,
       fetched_at = datetime('now')`,
    [cardId, data.idProduct, data.avgPrice, data.sellPrice, data.trendPrice, data.lowPrice, data.websiteUrl],
  );
}

export async function fetchAndCacheCardmarketPrice(
  db: SQLite.SQLiteDatabase,
  cardId: number,
  cardName: string,
  setName?: string | null,
): Promise<CardmarketPriceData | null> {
  const cached = await getCachedPrice(db, cardId);
  if (cached) {
    console.log(`[Cardmarket] Using cached price for card ${cardId}`);
    return cached;
  }

  const existingRow = await safeQueryFirst<{ cm_product_id: number | null }>(
    db,
    'SELECT cm_product_id FROM cardmarket_prices WHERE card_id = ?',
    [cardId],
  );

  let priceData: CardmarketPriceData | null = null;

  if (existingRow?.cm_product_id) {
    priceData = await getProductPrices(existingRow.cm_product_id);
  } else {
    const searchResult = await searchCardmarketProduct(cardName, setName);
    if (searchResult) {
      if (searchResult.priceGuide) {
        priceData = {
          idProduct: searchResult.idProduct,
          avgPrice: searchResult.priceGuide.AVG ?? null,
          sellPrice: searchResult.priceGuide.SELL ?? null,
          trendPrice: searchResult.priceGuide.TREND ?? null,
          lowPrice: searchResult.priceGuide.LOW ?? null,
          websiteUrl: searchResult.websiteUrl,
        };
      } else {
        priceData = await getProductPrices(searchResult.idProduct);
      }
    }
  }

  if (priceData) {
    await cachePrice(db, cardId, priceData);
    console.log(`[Cardmarket] Cached price for card ${cardId}: AVG=${priceData.avgPrice}`);
  }

  return priceData;
}

export function hasCardmarketCredentials(): boolean {
  return !!(
    process.env.EXPO_PUBLIC_CM_APP_TOKEN &&
    process.env.EXPO_PUBLIC_CM_APP_SECRET
  );
}
