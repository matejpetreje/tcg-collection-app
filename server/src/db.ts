import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'catalog.sqlite'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS mtg_cards (
  oracle_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layout TEXT,
  mana_cost TEXT,
  mana_value REAL,
  colors_json TEXT NOT NULL DEFAULT '[]',
  color_identity_json TEXT NOT NULL DEFAULT '[]',
  type_line TEXT,
  oracle_text TEXT,
  power TEXT,
  toughness TEXT,
  loyalty TEXT,
  defense TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  legalities_json TEXT NOT NULL DEFAULT '{}',
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mtg_sets (
  set_code TEXT PRIMARY KEY,
  set_name TEXT NOT NULL,
  release_date TEXT
);

CREATE TABLE IF NOT EXISTS mtg_printings (
  scryfall_id TEXT PRIMARY KEY,
  oracle_id TEXT NOT NULL,
  set_code TEXT NOT NULL,
  set_name TEXT NOT NULL,
  collector_number TEXT NOT NULL,
  rarity TEXT,
  released_at TEXT,
  artist TEXT,
  finishes_json TEXT NOT NULL DEFAULT '[]',
  promo INTEGER NOT NULL DEFAULT 0,
  reprint INTEGER NOT NULL DEFAULT 0,
  prices_json TEXT NOT NULL DEFAULT '{}',
  source_image_url TEXT,
  source_thumbnail_url TEXT,
  local_image_url TEXT,
  local_thumbnail_url TEXT,
  scryfall_uri TEXT,
  updated_at TEXT,
  FOREIGN KEY (oracle_id) REFERENCES mtg_cards(oracle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mtg_cards_name ON mtg_cards(name);
CREATE INDEX IF NOT EXISTS idx_mtg_printings_oracle ON mtg_printings(oracle_id);
CREATE INDEX IF NOT EXISTS idx_mtg_printings_set ON mtg_printings(set_code);
CREATE INDEX IF NOT EXISTS idx_mtg_printings_release ON mtg_printings(released_at);
`);

try {
  db.exec('ALTER TABLE mtg_printings ADD COLUMN updated_at TEXT;');
} catch {
  // Column already exists.
}

export function withTransaction<T>(task: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = task();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserve the original error.
    }
    throw error;
  }
}

export function setMeta(key: string, value: string): void {
  db.prepare(`
    INSERT INTO catalog_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM catalog_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
