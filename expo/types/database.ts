export interface Card {
  id: number;
  name: string;
  version: string | null;
  cost: number | null;
  inkwell: number | null;
  ink_color: string | null;
  type: string | null;
  rarity: string | null;
  set_code: string | null;
  card_number: string | null;
  body_text: string | null;
  flavor_text: string | null;
  strength: number | null;
  willpower: number | null;
  lore: number | null;
  move_cost: number | null;
  inkable: number | null;
  unique_id: string | null;
  classifications: string | null;
  franchise: string | null;
  date_added: string | null;
  date_modified: string | null;
}

export interface CardImage {
  card_id: number;
  image_url: string | null;
  thumbnail_url: string | null;
}

export interface CardSet {
  set_code: string;
  name: string;
  release_date: string | null;
}

export interface CardAbility {
  card_id: number;
  ability_name: string | null;
  ability_text: string | null;
  ability_type: string | null;
}

export interface CardSubtype {
  card_id: number;
  subtype: string;
}

export interface UserCollection {
  card_id: number;
  qty: number;
  qty_foil: number;
  qty_enchanted: number;
  qty_epic: number;
  qty_promo: number;
  qty_iconic: number;
  qty_play: number;
  condition: string | null;
  language: string | null;
  note: string | null;
  updated_at: string;
}

export interface Deck {
  id: number;
  name: string;
  format: string | null;
  ink_profile: string | null;
  note: string | null;
  is_locked: number;
  created_at: string;
  updated_at: string;
}

export interface DeckCard {
  deck_id: number;
  card_id: number;
  qty: number;
  is_sideboard: number;
}

export interface WishlistItem {
  card_id: number;
  target_qty: number;
  priority: number;
  note: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface CardTag {
  card_id: number;
  tag_id: number;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface ImportLog {
  id: number;
  imported_at: string;
  source: string | null;
  notes: string | null;
}

export interface CardWithDetails extends Card {
  qty: number;
  qty_foil: number;
  qty_enchanted: number;
  qty_epic: number;
  qty_promo: number;
  qty_iconic: number;
  qty_play: number;
  image_url: string | null;
  thumbnail_url: string | null;
  set_name: string | null;
  release_date: string | null;
  total_owned: number;
  condition?: string | null;
  language?: string | null;
  note?: string | null;
}

export interface DeckWithStats extends Deck {
  total_cards: number;
  games_played: number;
  games_won: number;
  games_lost: number;
}

export interface WishlistWithCard extends WishlistItem {
  name: string;
  ink_color: string | null;
  cost: number | null;
  rarity: string | null;
  set_code: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  qty: number;
  qty_foil: number;
  qty_enchanted: number;
}

export interface DeckCardWithDetails extends DeckCard {
  name: string;
  ink_color: string | null;
  cost: number | null;
  rarity: string | null;
  type: string | null;
  set_code: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

export interface InkStats {
  ink_color: string;
  count: number;
}

export interface SetProgress {
  set_code: string;
  set_name: string;
  owned: number;
  total: number;
}

export interface CostCurveItem {
  cost: number;
  count: number;
}

export interface GameHistory {
  id: number;
  deck_id: number | null;
  result: 'win' | 'loss';
  player_name: string | null;
  opponent_name: string | null;
  opponent_deck: string | null;
  notes: string | null;
  played_at: string;
}

export interface GameHistoryWithDeck extends GameHistory {
  deck_name: string | null;
  deck_ink_profile: string | null;
}

export interface GameStats {
  total_games: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface PurchasedStarterDeck {
  id: string;
  set_name: string;
  deck_name: string;
  ink_profile: string;
  purchased_at: string;
}

export interface CollectionFilters {
  search: string;
  inkColors: string[];
  cardTypes: string[];
  rarities: string[];
  setCodes: string[];
  variantTypes: string[];
  onlyOwned: boolean;
  onlyMissing: boolean;
  /** One Piece: filter by Attack (strength column). */
  strengths: number[];
  /** One Piece: filter by Counter (willpower column). */
  counters: number[];
  /** One Piece: filter by Life (lore column). */
  lives: number[];
}
