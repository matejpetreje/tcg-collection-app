export type TCGId = 'lorcana' | 'mtg' | 'pokemon' | 'onepiece' | 'yugioh';

export interface TCGDefinition {
  id: TCGId;
  name: string;
  shortName: string;
  tagline: string;
  available: boolean;
  color: string;
  gradient: [string, string];
  databaseFile: string;
  catalogSource: 'lorcana-api' | 'optcgapi' | 'ygoprodeck' | 'scryfall' | 'pending';
  features: {
    dashboard: boolean;
    collection: boolean;
    decks: boolean;
    wishlist: boolean;
    scanner: boolean;
    playTool: 'lore' | 'duel' | null;
    prices: 'dotgg' | 'api' | null;
  };
}
