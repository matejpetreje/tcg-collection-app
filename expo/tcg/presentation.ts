import type { TCGId } from '@/tcg/types';

export type CollectionQtyField =
  | 'qty'
  | 'qty_foil'
  | 'qty_enchanted'
  | 'qty_epic'
  | 'qty_promo'
  | 'qty_iconic'
  | 'qty_play';

export interface CollectionVariant {
  field: CollectionQtyField;
  label: string;
}

export interface TCGPresentation {
  colorLabel: string | null;
  deckColorLabel: string | null;
  deckColors: string[];
  deckColorLimit: number | null;
  filterColors: string[];
  cardTypes: string[];
  showInkability: boolean;
  variants: CollectionVariant[];
  showStarterDecks: boolean;
  showCommunityDecks: boolean;
  showScanner: boolean;
  showCardmarket: boolean;
  showDotgg: boolean;
}

const STANDARD_ONLY: CollectionVariant[] = [{ field: 'qty', label: 'Owned' }];

export const TCG_PRESENTATION: Record<TCGId, TCGPresentation> = {
  lorcana: {
    colorLabel: 'Ink',
    deckColorLabel: 'Ink Colors',
    deckColors: ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'],
    deckColorLimit: 2,
    filterColors: ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'],
    cardTypes: ['Character', 'Action', 'Item', 'Song', 'Location'],
    showInkability: true,
    variants: [
      { field: 'qty', label: 'Classic' },
      { field: 'qty_foil', label: 'Foil' },
      { field: 'qty_epic', label: 'Epic' },
      { field: 'qty_enchanted', label: 'Enchanted' },
      { field: 'qty_promo', label: 'Promo' },
      { field: 'qty_iconic', label: 'Iconic' },
      { field: 'qty_play', label: 'Play' },
    ],
    showStarterDecks: true,
    showCommunityDecks: true,
    showScanner: true,
    showCardmarket: true,
    showDotgg: true,
  },
  onepiece: {
    colorLabel: 'Color',
    deckColorLabel: 'Colors',
    deckColors: ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'],
    deckColorLimit: null,
    filterColors: ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'],
    cardTypes: ['Leader', 'Character', 'Event', 'Stage', 'DON!!'],
    showInkability: false,
    variants: STANDARD_ONLY,
    showStarterDecks: true,
    showCommunityDecks: false,
    showScanner: false,
    showCardmarket: false,
    showDotgg: false,
  },
  yugioh: {
    colorLabel: 'Attribute',
    deckColorLabel: null,
    deckColors: [],
    deckColorLimit: null,
    filterColors: ['DARK', 'DIVINE', 'EARTH', 'FIRE', 'LIGHT', 'WATER', 'WIND'],
    cardTypes: ['Monster', 'Spell', 'Trap'],
    showInkability: false,
    variants: STANDARD_ONLY,
    showStarterDecks: false,
    showCommunityDecks: false,
    showScanner: false,
    showCardmarket: false,
    showDotgg: false,
  },
  mtg: {
    colorLabel: 'Color',
    deckColorLabel: 'Colors',
    deckColors: ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless'],
    deckColorLimit: null,
    filterColors: ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless'],
    cardTypes: ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery'],
    showInkability: false,
    variants: STANDARD_ONLY,
    showStarterDecks: false,
    showCommunityDecks: false,
    showScanner: false,
    showCardmarket: false,
    showDotgg: false,
  },
  pokemon: {
    colorLabel: 'Type',
    deckColorLabel: 'Types',
    deckColors: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless'],
    deckColorLimit: null,
    filterColors: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless'],
    cardTypes: ['Pokémon', 'Trainer', 'Energy'],
    showInkability: false,
    variants: STANDARD_ONLY,
    showStarterDecks: false,
    showCommunityDecks: false,
    showScanner: false,
    showCardmarket: false,
    showDotgg: false,
  },
};

export function getTCGPresentation(tcg: TCGId): TCGPresentation {
  return TCG_PRESENTATION[tcg];
}
