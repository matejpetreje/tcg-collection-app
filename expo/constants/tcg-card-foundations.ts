import type { TCGId } from '@/constants/tcgs';
import type { CardWithDetails } from '@/types/database';

export type GameCardData = Record<string, string | number | boolean | null | string[]>;

export interface DisplayStat {
  key: string;
  label: string;
  value: string | number;
}

export interface TCGCardFoundation {
  id: TCGId;
  cardTypes: string[];
  colors: string[];
  coreFields: string[];
  typeSpecificFields: Record<string, string[]>;
  getDisplayStats: (card: CardWithDetails) => DisplayStat[];
}

function extra(card: CardWithDetails): GameCardData {
  if (!card.game_data) return {};
  try { return JSON.parse(card.game_data) as GameCardData; } catch { return {}; }
}

function value(data: GameCardData, key: string): string | number | null {
  const v = data[key];
  return typeof v === 'string' || typeof v === 'number' ? v : null;
}

export const TCG_CARD_FOUNDATIONS: Record<TCGId, TCGCardFoundation> = {
  lorcana: {
    id: 'lorcana',
    cardTypes: ['Character', 'Action', 'Item', 'Song', 'Location'],
    colors: ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'],
    coreFields: ['cost', 'strength', 'willpower', 'lore', 'inkable'],
    typeSpecificFields: {},
    getDisplayStats: card => [
      ...(card.cost != null ? [{ key: 'cost', label: 'Cost', value: card.cost }] : []),
      ...(card.strength != null ? [{ key: 'strength', label: 'Str', value: card.strength }] : []),
      ...(card.willpower != null ? [{ key: 'willpower', label: 'Wil', value: card.willpower }] : []),
      ...(card.lore != null ? [{ key: 'lore', label: 'Lore', value: card.lore }] : []),
    ],
  },
  onepiece: {
    id: 'onepiece',
    cardTypes: ['Leader', 'Character', 'Event', 'Stage', 'DON!!'],
    colors: ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'],
    coreFields: ['color', 'card_type', 'effect', 'trigger', 'card_number', 'rarity', 'block'],
    typeSpecificFields: {
      Leader: ['power', 'life', 'attribute', 'traits'],
      Character: ['cost', 'power', 'counter', 'attribute', 'traits'],
      Event: ['cost', 'trigger'],
      Stage: ['cost', 'trigger'],
      'DON!!': [],
    },
    getDisplayStats: card => {
      const type = (card.type ?? '').toLowerCase();
      return [
        ...(!type.includes('leader') && !type.includes('don') && card.cost != null ? [{ key: 'cost', label: 'Cost', value: card.cost }] : []),
        ...((type.includes('leader') || type.includes('character')) && card.strength != null ? [{ key: 'power', label: 'Power', value: card.strength }] : []),
        ...(type.includes('character') && card.willpower != null ? [{ key: 'counter', label: 'Counter', value: card.willpower }] : []),
        ...(type.includes('leader') && card.lore != null ? [{ key: 'life', label: 'Life', value: card.lore }] : []),
      ];
    },
  },
  pokemon: {
    id: 'pokemon',
    cardTypes: ['Pokémon', 'Trainer', 'Energy'],
    colors: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless'],
    coreFields: ['supertype', 'subtypes', 'rules', 'regulation_mark', 'rarity', 'collector_number'],
    typeSpecificFields: {
      'Pokémon': ['hp', 'types', 'stage', 'evolves_from', 'abilities', 'attacks', 'weaknesses', 'resistances', 'retreat_cost'],
      Trainer: ['trainer_type', 'rules'],
      Energy: ['energy_type', 'rules'],
    },
    getDisplayStats: card => {
      const d = extra(card);
      return [
        ...(value(d, 'hp') != null ? [{ key: 'hp', label: 'HP', value: value(d, 'hp')! }] : []),
        ...(value(d, 'stage') != null ? [{ key: 'stage', label: 'Stage', value: value(d, 'stage')! }] : []),
        ...(value(d, 'retreat_cost') != null ? [{ key: 'retreat', label: 'Retreat', value: value(d, 'retreat_cost')! }] : []),
      ];
    },
  },
  mtg: {
    id: 'mtg',
    cardTypes: ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery'],
    colors: ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless'],
    coreFields: ['mana_cost', 'mana_value', 'colors', 'color_identity', 'type_line', 'oracle_text', 'collector_number', 'rarity'],
    typeSpecificFields: {
      Creature: ['power', 'toughness'],
      Planeswalker: ['loyalty'],
      Battle: ['defense'],
      Land: [],
      Instant: [],
      Sorcery: [],
      Artifact: [],
      Enchantment: [],
    },
    getDisplayStats: card => {
      const d = extra(card);
      return [
        ...(value(d, 'mana_value') != null ? [{ key: 'mv', label: 'Mana', value: value(d, 'mana_value')! }] : []),
        ...(value(d, 'power') != null && value(d, 'toughness') != null ? [{ key: 'pt', label: 'P/T', value: `${value(d, 'power')}/${value(d, 'toughness')}` }] : []),
        ...(value(d, 'loyalty') != null ? [{ key: 'loyalty', label: 'Loyalty', value: value(d, 'loyalty')! }] : []),
        ...(value(d, 'defense') != null ? [{ key: 'defense', label: 'Defense', value: value(d, 'defense')! }] : []),
      ];
    },
  },
  yugioh: {
    id: 'yugioh',
    cardTypes: ['Monster', 'Spell', 'Trap'],
    colors: [],
    coreFields: ['card_type', 'description', 'archetype', 'attribute', 'race'],
    typeSpecificFields: {
      Monster: ['monster_type', 'attribute', 'level', 'rank', 'link_rating', 'link_arrows', 'atk', 'def', 'pendulum_scale'],
      Spell: ['spell_type'],
      Trap: ['trap_type'],
    },
    getDisplayStats: card => {
      const d = extra(card);
      return [
        ...(value(d, 'level') != null ? [{ key: 'level', label: 'Level', value: value(d, 'level')! }] : []),
        ...(value(d, 'rank') != null ? [{ key: 'rank', label: 'Rank', value: value(d, 'rank')! }] : []),
        ...(value(d, 'link_rating') != null ? [{ key: 'link', label: 'Link', value: value(d, 'link_rating')! }] : []),
        ...(value(d, 'atk') != null ? [{ key: 'atk', label: 'ATK', value: value(d, 'atk')! }] : []),
        ...(value(d, 'def') != null ? [{ key: 'def', label: 'DEF', value: value(d, 'def')! }] : []),
      ];
    },
  },
};

export function getCardFoundation(tcg: TCGId): TCGCardFoundation {
  return TCG_CARD_FOUNDATIONS[tcg];
}

export function getGameCardData(card: CardWithDetails): GameCardData {
  return extra(card);
}
