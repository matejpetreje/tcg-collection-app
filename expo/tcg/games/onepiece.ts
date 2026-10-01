import type { TCGDefinition } from '@/tcg/types';

export const onepiece: TCGDefinition = {
  id: 'onepiece',
  name: 'One Piece Card Game',
  shortName: 'One Piece',
  tagline: 'Collection & decks',
  available: true,
  color: '#E74C3C',
  gradient: ['#B53A2E', '#5C1A16'],
  databaseFile: 'onepiece_cards.db',
  catalogSource: 'optcgapi',
  features: {
    dashboard: true, collection: true, decks: true, wishlist: true,
    scanner: false, playTool: null, prices: 'api',
  },
};
