import type { TCGDefinition } from '@/tcg/types';

export const mtg: TCGDefinition = {
  id: 'mtg',
  name: 'Magic: The Gathering',
  shortName: 'MTG',
  tagline: 'Collection, printings & decks',
  available: true,
  color: '#D9A24A',
  gradient: ['#7A4A2B', '#3C2316'],
  databaseFile: 'mtg_cards.db',
  catalogSource: 'scryfall',
  features: {
    dashboard: true, collection: true, decks: true, wishlist: true,
    scanner: false, playTool: null, prices: 'api',
  },
};
