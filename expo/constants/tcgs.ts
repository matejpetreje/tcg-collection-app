import Colors from './colors';

export type TCGId = 'lorcana' | 'mtg' | 'pokemon' | 'onepiece' | 'yugioh';

export interface TCGInfo {
  id: TCGId;
  name: string;
  shortName: string;
  tagline: string;
  available: boolean;
  color: string;
  gradient: [string, string];
}

export const TCGS: TCGInfo[] = [
  {
    id: 'lorcana',
    name: 'Disney Lorcana',
    shortName: 'Lorcana',
    tagline: 'Collection, decks & lore counter',
    available: true,
    color: Colors.primary,
    gradient: ['#C9975B', '#A67B3D'],
  },
  {
    id: 'mtg',
    name: 'Magic: The Gathering',
    shortName: 'MTG',
    tagline: 'Coming soon',
    available: false,
    color: '#D9A24A',
    gradient: ['#7A4A2B', '#3C2316'],
  },
  {
    id: 'pokemon',
    name: 'Pokémon TCG',
    shortName: 'Pokémon',
    tagline: 'Coming soon',
    available: false,
    color: '#F2C94C',
    gradient: ['#3B5BA5', '#1E2F66'],
  },
  {
    id: 'onepiece',
    name: 'One Piece Card Game',
    shortName: 'One Piece',
    tagline: 'Collection & decks',
    available: true,
    color: '#E74C3C',
    gradient: ['#B53A2E', '#5C1A16'],
  },
  {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    shortName: 'Yu-Gi-Oh!',
    tagline: 'Coming soon',
    available: false,
    color: '#9B59B6',
    gradient: ['#6B3F8A', '#2E1B4A'],
  },
];

export const TCG_STORAGE_KEY = 'selected_tcg';
