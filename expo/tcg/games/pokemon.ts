import type { TCGDefinition } from '@/tcg/types';

export const pokemon: TCGDefinition = {
  id: 'pokemon',
  name: 'Pokémon TCG',
  shortName: 'Pokémon',
  tagline: 'Collection foundation ready',
  available: true,
  color: '#F2C94C',
  gradient: ['#3B5BA5', '#1E2F66'],
  databaseFile: 'pokemon_cards.db',
  catalogSource: 'pending',
  features: {
    dashboard: true, collection: true, decks: true, wishlist: true,
    scanner: false, playTool: null, prices: null,
  },
};
