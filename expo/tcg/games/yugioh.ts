import type { TCGDefinition } from '@/tcg/types';

export const yugioh: TCGDefinition = {
  id: 'yugioh',
  name: 'Yu-Gi-Oh!',
  shortName: 'Yu-Gi-Oh!',
  tagline: 'Collection & decks',
  available: true,
  color: '#9B59B6',
  gradient: ['#6B3F8A', '#2E1B4A'],
  databaseFile: 'yugioh_cards.db',
  catalogSource: 'ygoprodeck',
  features: {
    dashboard: true, collection: true, decks: true, wishlist: true,
    scanner: false, playTool: 'duel', prices: 'api',
  },
};
