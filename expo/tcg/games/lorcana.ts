import Colors from '@/constants/colors';
import type { TCGDefinition } from '@/tcg/types';

export const lorcana: TCGDefinition = {
  id: 'lorcana',
  name: 'Disney Lorcana',
  shortName: 'Lorcana',
  tagline: 'Collection, decks & lore counter',
  available: true,
  color: Colors.primary,
  gradient: ['#C9975B', '#A67B3D'],
  databaseFile: 'lorcana_cards.db',
  catalogSource: 'lorcana-api',
  features: {
    dashboard: true, collection: true, decks: true, wishlist: true,
    scanner: true, playTool: 'lore', prices: 'dotgg',
  },
};
