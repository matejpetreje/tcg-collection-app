import type { Request, Response } from 'express';
import { db, getMeta } from './db.js';
import { config } from './config.js';

function absoluteImage(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${config.publicBaseUrl}${url}`;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function mtgVersion(_req: Request, res: Response): void {
  const cardCount = (db.prepare('SELECT COUNT(*) as count FROM mtg_cards').get() as { count: number }).count;
  const printingCount = (db.prepare('SELECT COUNT(*) as count FROM mtg_printings').get() as { count: number }).count;
  res.json({
    game: 'mtg',
    version: getMeta('mtg_bulk_updated_at'),
    last_sync: getMeta('mtg_last_sync'),
    cards: cardCount,
    printings: printingCount,
  });
}

export function mtgCards(req: Request, res: Response): void {
  const requested = Number(req.query.limit ?? 250);
  const limit = Math.min(500, Math.max(1, Number.isFinite(requested) ? requested : 250));
  const cursor = Math.max(0, Number(req.query.cursor ?? 0) || 0);

  const cards = db.prepare(`
    SELECT * FROM mtg_cards
    ORDER BY name COLLATE NOCASE, oracle_id
    LIMIT ? OFFSET ?
  `).all(limit, cursor) as Array<Record<string, any>>;

  if (!cards.length) {
    res.json({ data: [], next_cursor: null });
    return;
  }

  const ids = cards.map(c => c.oracle_id);
  const placeholders = ids.map(() => '?').join(',');
  const printings = db.prepare(`
    SELECT * FROM mtg_printings
    WHERE oracle_id IN (${placeholders})
    ORDER BY released_at DESC, set_code, collector_number
  `).all(...ids) as Array<Record<string, any>>;

  const byOracle = new Map<string, Array<Record<string, any>>>();
  for (const p of printings) {
    const list = byOracle.get(p.oracle_id) ?? [];
    list.push(p);
    byOracle.set(p.oracle_id, list);
  }

  const data = cards.map(card => {
    const cardPrintings = byOracle.get(card.oracle_id) ?? [];
    const representative = cardPrintings[0] ?? null;
    return {
      oracle_id: card.oracle_id,
      name: card.name,
      layout: card.layout,
      mana_cost: card.mana_cost,
      mana_value: card.mana_value,
      colors: parseJson<string[]>(card.colors_json, []),
      color_identity: parseJson<string[]>(card.color_identity_json, []),
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      power: card.power,
      toughness: card.toughness,
      loyalty: card.loyalty,
      defense: card.defense,
      keywords: parseJson<string[]>(card.keywords_json, []),
      legalities: parseJson<Record<string, string>>(card.legalities_json, {}),
      reserved: !!card.reserved,
      set_code: representative?.set_code ?? null,
      set_name: representative?.set_name ?? null,
      rarity: representative?.rarity ?? null,
      released_at: representative?.released_at ?? null,
      artist: representative?.artist ?? null,
      market_price: representative ? Number(parseJson<Record<string, string | null>>(representative.prices_json, {}).usd ?? 0) || null : null,
      foil_price: representative ? Number(parseJson<Record<string, string | null>>(representative.prices_json, {}).usd_foil ?? 0) || null : null,
      image_url: representative ? absoluteImage(representative.local_image_url ?? representative.local_thumbnail_url ?? representative.source_image_url) : null,
      thumbnail_url: representative ? absoluteImage(representative.local_thumbnail_url ?? representative.source_thumbnail_url) : null,
      printings: cardPrintings.map(p => ({
        scryfall_id: p.scryfall_id,
        set_code: p.set_code,
        set_name: p.set_name,
        collector_number: p.collector_number,
        rarity: p.rarity,
        released_at: p.released_at,
        artist: p.artist,
        finishes: parseJson<string[]>(p.finishes_json, []),
        promo: !!p.promo,
        reprint: !!p.reprint,
        prices: parseJson<Record<string, string | null>>(p.prices_json, {}),
        image_url: absoluteImage(p.local_image_url ?? p.local_thumbnail_url ?? p.source_image_url),
        thumbnail_url: absoluteImage(p.local_thumbnail_url ?? p.source_thumbnail_url),
        scryfall_uri: p.scryfall_uri,
      })),
    };
  });

  const total = (db.prepare('SELECT COUNT(*) as count FROM mtg_cards').get() as { count: number }).count;
  const next = cursor + data.length < total ? cursor + data.length : null;
  res.json({ data, next_cursor: next, total });
}
