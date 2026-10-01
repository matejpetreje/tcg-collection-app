export const CATALOG_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version TEXT,
  cost INTEGER,
  inkwell INTEGER,
  ink_color TEXT,
  type TEXT,
  rarity TEXT,
  set_code TEXT,
  card_number TEXT,
  body_text TEXT,
  flavor_text TEXT,
  strength INTEGER,
  willpower INTEGER,
  lore INTEGER,
  move_cost INTEGER,
  inkable INTEGER,
  unique_id TEXT UNIQUE,
  classifications TEXT,
  franchise TEXT,
  date_added TEXT,
  date_modified TEXT,
  market_price REAL,
  inventory_price REAL
);

CREATE TABLE IF NOT EXISTS sets (
  set_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  release_date TEXT
);

CREATE TABLE IF NOT EXISTS images (
  card_id INTEGER PRIMARY KEY,
  image_url TEXT,
  thumbnail_url TEXT,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  ability_name TEXT,
  ability_text TEXT,
  ability_type TEXT,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS subtypes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  subtype TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_set_code ON cards(set_code);
CREATE INDEX IF NOT EXISTS idx_cards_ink_color ON cards(ink_color);
CREATE INDEX IF NOT EXISTS idx_cards_unique_id ON cards(unique_id);
CREATE INDEX IF NOT EXISTS idx_images_card_id ON images(card_id);
CREATE INDEX IF NOT EXISTS idx_subtypes_card_id ON subtypes(card_id);
CREATE INDEX IF NOT EXISTS idx_abilities_card_id ON abilities(card_id);
`;

export const USER_TABLES_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_collection (
  card_id INTEGER PRIMARY KEY,
  qty INTEGER NOT NULL DEFAULT 0,
  qty_foil INTEGER NOT NULL DEFAULT 0,
  qty_enchanted INTEGER NOT NULL DEFAULT 0,
  qty_epic INTEGER NOT NULL DEFAULT 0,
  qty_promo INTEGER NOT NULL DEFAULT 0,
  qty_iconic INTEGER NOT NULL DEFAULT 0,
  qty_play INTEGER NOT NULL DEFAULT 0,
  condition TEXT,
  language TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  format TEXT,
  ink_profile TEXT,
  note TEXT,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  is_sideboard INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deck_id, card_id, is_sideboard),
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  card_id INTEGER PRIMARY KEY,
  target_qty INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 2,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (card_id, tag_id),
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS game_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER,
  result TEXT NOT NULL DEFAULT 'win',
  opponent_name TEXT,
  opponent_deck TEXT,
  notes TEXT,
  played_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchased_starter_decks (
  id TEXT PRIMARY KEY,
  set_name TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  ink_profile TEXT NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cardmarket_prices (
  card_id INTEGER PRIMARY KEY,
  cm_product_id INTEGER,
  avg_price REAL,
  sell_price REAL,
  trend_price REAL,
  low_price REAL,
  website_url TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
`;

export const USER_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_collection_qty ON user_collection(qty, qty_foil, qty_enchanted);
CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_cards_card ON deck_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_game_history_deck ON game_history(deck_id);
CREATE INDEX IF NOT EXISTS idx_game_history_date ON game_history(played_at);
`;

export const VIEWS_SQL = `
CREATE VIEW IF NOT EXISTS v_card_detail AS
SELECT c.*, i.image_url, i.thumbnail_url, s.name as set_name, s.release_date
FROM cards c
LEFT JOIN images i ON i.card_id = c.id
LEFT JOIN sets s ON s.set_code = c.set_code;

CREATE VIEW IF NOT EXISTS v_owned_cards AS
SELECT c.*, uc.qty, uc.qty_foil, uc.qty_enchanted,
  uc.qty_epic, uc.qty_promo, uc.qty_iconic, uc.qty_play,
  (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) as total_owned,
  i.image_url, i.thumbnail_url, s.name as set_name, s.release_date
FROM cards c
JOIN user_collection uc ON uc.card_id = c.id
LEFT JOIN images i ON i.card_id = c.id
LEFT JOIN sets s ON s.set_code = c.set_code
WHERE (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0;
`;

export const RESET_USER_DATA_SQL = `
DELETE FROM card_tags;
DELETE FROM tags;
DELETE FROM game_history;
DELETE FROM deck_cards;
DELETE FROM decks;
DELETE FROM wishlist;
DELETE FROM user_collection;
DELETE FROM import_log;
DELETE FROM app_settings;
`;

export const RESET_CATALOG_SQL = `
DELETE FROM subtypes;
DELETE FROM abilities;
DELETE FROM images;
DELETE FROM cardmarket_prices;
DELETE FROM cards;
DELETE FROM sets;
DELETE FROM purchased_starter_decks;
DELETE FROM sqlite_sequence WHERE name IN ('cards','abilities','subtypes');
`;
