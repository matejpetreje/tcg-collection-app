import type { TCGId } from './tcgs';

export type LorcanaDeckType = 'Starter Deck' | 'Gateway' | 'Quest';

export interface StarterDeck {
  id: string;
  set: string;
  setNumber: number;
  name: string;
  inkProfile: string;
  colors: string[];
  /** When present, taps to the deck can show the cards in that set code (e.g. ST01). */
  setCode?: string;
  /** Official lorcanajson.org deck id, e.g. "S1-1", "G1-1", "Q2-3". */
  officialDeckId?: string;
  /** Lorcana deck classification. Defaults to Starter Deck. */
  deckType?: LorcanaDeckType;
}

/**
 * Official Lorcana decks sourced from lorcanajson.org.
 * Includes Starter Decks (S), Gateway Decks (G), and Illumineer's Quest decks (Q).
 */
export const LORCANA_STARTER_DECKS: StarterDeck[] = [
  // --- Starter Decks ---
  // Set 1 — The First Chapter
  { id: 'S1-1', officialDeckId: 'S1-1', deckType: 'Starter Deck', set: 'The First Chapter', setNumber: 1, name: 'The Heart of Magic', inkProfile: 'Amber, Amethyst', colors: ['Amber', 'Amethyst'] },
  { id: 'S1-2', officialDeckId: 'S1-2', deckType: 'Starter Deck', set: 'The First Chapter', setNumber: 1, name: 'Daring and Deception', inkProfile: 'Emerald, Ruby', colors: ['Emerald', 'Ruby'] },
  { id: 'S1-3', officialDeckId: 'S1-3', deckType: 'Starter Deck', set: 'The First Chapter', setNumber: 1, name: 'A Steadfast Strategy', inkProfile: 'Sapphire, Steel', colors: ['Sapphire', 'Steel'] },

  // Set 2 — Rise of the Floodborn
  { id: 'S2-1', officialDeckId: 'S2-1', deckType: 'Starter Deck', set: 'Rise of the Floodborn', setNumber: 2, name: 'Tactical Teamwork', inkProfile: 'Amber, Sapphire', colors: ['Amber', 'Sapphire'] },
  { id: 'S2-2', officialDeckId: 'S2-2', deckType: 'Starter Deck', set: 'Rise of the Floodborn', setNumber: 2, name: 'Might and Magic', inkProfile: 'Amethyst, Steel', colors: ['Amethyst', 'Steel'] },

  // Set 3 — Into the Inklands
  { id: 'S3-1', officialDeckId: 'S3-1', deckType: 'Starter Deck', set: 'Into the Inklands', setNumber: 3, name: 'Dogged and Dynamic', inkProfile: 'Amber, Emerald', colors: ['Amber', 'Emerald'] },
  { id: 'S3-2', officialDeckId: 'S3-2', deckType: 'Starter Deck', set: 'Into the Inklands', setNumber: 3, name: 'Plenty of Pluck', inkProfile: 'Ruby, Sapphire', colors: ['Ruby', 'Sapphire'] },

  // Set 4 — Ursula's Return
  { id: 'S4-1', officialDeckId: 'S4-1', deckType: 'Starter Deck', set: "Ursula's Return", setNumber: 4, name: 'Madrigal Magic', inkProfile: 'Amber, Amethyst', colors: ['Amber', 'Amethyst'] },
  { id: 'S4-2', officialDeckId: 'S4-2', deckType: 'Starter Deck', set: "Ursula's Return", setNumber: 4, name: 'Stand Together', inkProfile: 'Sapphire, Steel', colors: ['Sapphire', 'Steel'] },

  // Set 5 — Shimmering Skies
  { id: 'S5-1', officialDeckId: 'S5-1', deckType: 'Starter Deck', set: 'Shimmering Skies', setNumber: 5, name: 'Ready to Let Loose', inkProfile: 'Amethyst, Ruby', colors: ['Amethyst', 'Ruby'] },
  { id: 'S5-2', officialDeckId: 'S5-2', deckType: 'Starter Deck', set: 'Shimmering Skies', setNumber: 5, name: 'A Roaring Guest List', inkProfile: 'Emerald, Steel', colors: ['Emerald', 'Steel'] },

  // Set 6 — Azurite Sea
  { id: 'S6-1', officialDeckId: 'S6-1', deckType: 'Starter Deck', set: 'Azurite Sea', setNumber: 6, name: 'A Seaworthy Crew', inkProfile: 'Amber, Ruby', colors: ['Amber', 'Ruby'] },
  { id: 'S6-2', officialDeckId: 'S6-2', deckType: 'Starter Deck', set: 'Azurite Sea', setNumber: 6, name: 'Genius Reinvented', inkProfile: 'Emerald, Sapphire', colors: ['Emerald', 'Sapphire'] },

  // Set 7 — Archazia's Island
  { id: 'S7-1', officialDeckId: 'S7-1', deckType: 'Starter Deck', set: "Archazia's Island", setNumber: 7, name: 'Feathered and Feared', inkProfile: 'Amethyst, Steel', colors: ['Amethyst', 'Steel'] },
  { id: 'S7-2', officialDeckId: 'S7-2', deckType: 'Starter Deck', set: "Archazia's Island", setNumber: 7, name: 'An Inventive Pair', inkProfile: 'Ruby, Sapphire', colors: ['Ruby', 'Sapphire'] },

  // Set 8 — The Reign of Jafar
  { id: 'S8-1', officialDeckId: 'S8-1', deckType: 'Starter Deck', set: 'The Reign of Jafar', setNumber: 8, name: 'A Harmonious Team', inkProfile: 'Amber, Amethyst', colors: ['Amber', 'Amethyst'] },
  { id: 'S8-2', officialDeckId: 'S8-2', deckType: 'Starter Deck', set: 'The Reign of Jafar', setNumber: 8, name: 'Brave and Brazen', inkProfile: 'Ruby, Steel', colors: ['Ruby', 'Steel'] },

  // Set 9 — Fabled
  { id: 'S9-1', officialDeckId: 'S9-1', deckType: 'Starter Deck', set: 'Fabled', setNumber: 9, name: 'Princess Power', inkProfile: 'Amber, Sapphire', colors: ['Amber', 'Sapphire'] },
  { id: 'S9-2', officialDeckId: 'S9-2', deckType: 'Starter Deck', set: 'Fabled', setNumber: 9, name: 'Standout Headliners', inkProfile: 'Emerald, Ruby', colors: ['Emerald', 'Ruby'] },

  // Set 10 — Whispers in the Well
  { id: 'S10-1', officialDeckId: 'S10-1', deckType: 'Starter Deck', set: 'Whispers in the Well', setNumber: 10, name: 'Spectacular Specters', inkProfile: 'Amber, Emerald', colors: ['Amber', 'Emerald'] },
  { id: 'S10-2', officialDeckId: 'S10-2', deckType: 'Starter Deck', set: 'Whispers in the Well', setNumber: 10, name: 'On the Case', inkProfile: 'Sapphire, Steel', colors: ['Sapphire', 'Steel'] },

  // Set 12 — Wilds Unknown
  { id: 'S12-1', officialDeckId: 'S12-1', deckType: 'Starter Deck', set: 'Wilds Unknown', setNumber: 12, name: 'Playful Teamwork', inkProfile: 'Amber, Emerald', colors: ['Amber', 'Emerald'] },
  { id: 'S12-2', officialDeckId: 'S12-2', deckType: 'Starter Deck', set: 'Wilds Unknown', setNumber: 12, name: 'Daring Heroics', inkProfile: 'Amethyst, Ruby', colors: ['Amethyst', 'Ruby'] },

  // --- Gateway ---
  { id: 'G1-1', officialDeckId: 'G1-1', deckType: 'Gateway', set: 'Gateway', setNumber: 0, name: 'Stitch & Maleficent Starter Deck', inkProfile: 'Amber, Amethyst', colors: ['Amber', 'Amethyst'] },
  { id: 'G1-2', officialDeckId: 'G1-2', deckType: 'Gateway', set: 'Gateway', setNumber: 0, name: 'Elsa & Mickey Mouse Starter Deck', inkProfile: 'Ruby, Sapphire', colors: ['Ruby', 'Sapphire'] },
  { id: 'G1-3', officialDeckId: 'G1-3', deckType: 'Gateway', set: 'Gateway', setNumber: 0, name: 'Reward Pack 1', inkProfile: 'Amber, Amethyst, Ruby, Sapphire', colors: ['Amber', 'Amethyst', 'Ruby', 'Sapphire'] },
  { id: 'G1-4', officialDeckId: 'G1-4', deckType: 'Gateway', set: 'Gateway', setNumber: 0, name: 'Reward Pack 2', inkProfile: 'Amber, Amethyst, Ruby, Sapphire', colors: ['Amber', 'Amethyst', 'Ruby', 'Sapphire'] },
  { id: 'G1-5', officialDeckId: 'G1-5', deckType: 'Gateway', set: 'Gateway', setNumber: 0, name: 'Reward Pack 3', inkProfile: 'Amber, Amethyst, Ruby, Sapphire', colors: ['Amber', 'Amethyst', 'Ruby', 'Sapphire'] },
  { id: 'G1-6', officialDeckId: 'G1-6', deckType: 'Gateway', set: 'Gateway', setNumber: 0, name: 'Reward Pack 4', inkProfile: 'Amber, Amethyst, Ruby, Sapphire', colors: ['Amber', 'Amethyst', 'Ruby', 'Sapphire'] },

  // --- Illumineer's Quest ---
  { id: 'Q1-1', officialDeckId: 'Q1-1', deckType: 'Quest', set: "Illumineer's Quest: Deep Trouble", setNumber: 0, name: 'Ursula Scenario Deck', inkProfile: 'Mixed', colors: [] },
  { id: 'Q1-2', officialDeckId: 'Q1-2', deckType: 'Quest', set: "Illumineer's Quest: Deep Trouble", setNumber: 0, name: 'Prebuilt Mulan Deck', inkProfile: 'Amber, Ruby', colors: ['Amber', 'Ruby'] },
  { id: 'Q1-3', officialDeckId: 'Q1-3', deckType: 'Quest', set: "Illumineer's Quest: Deep Trouble", setNumber: 0, name: 'Prebuilt Yen Sid Deck', inkProfile: 'Sapphire, Steel', colors: ['Sapphire', 'Steel'] },
  { id: 'Q2-1', officialDeckId: 'Q2-1', deckType: 'Quest', set: "Illumineer's Quest: Palace Heist", setNumber: 0, name: 'Jafar Scenario Deck', inkProfile: 'Mixed', colors: [] },
  { id: 'Q2-2', officialDeckId: 'Q2-2', deckType: 'Quest', set: "Illumineer's Quest: Palace Heist", setNumber: 0, name: 'Prebuilt Bolt/Goofy Deck', inkProfile: 'Amber, Steel', colors: ['Amber', 'Steel'] },
  { id: 'Q2-3', officialDeckId: 'Q2-3', deckType: 'Quest', set: "Illumineer's Quest: Palace Heist", setNumber: 0, name: 'Prebuilt Elsa/Pinocchio Deck', inkProfile: 'Amethyst, Sapphire', colors: ['Amethyst', 'Sapphire'] },
];

/**
 * One Piece official starter / ultra decks. Set codes (ST01..ST29) match
 * `cards.set_code` so the deck contents screen can query them directly.
 */
export const ONEPIECE_STARTER_DECKS: StarterDeck[] = [
  { id: 'ST01', setCode: 'ST01', set: 'Starter Decks', setNumber: 1, name: 'Straw Hat Crew', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST02', setCode: 'ST02', set: 'Starter Decks', setNumber: 2, name: 'Worst Generation', inkProfile: 'Red, Green', colors: ['Red', 'Green'] },
  { id: 'ST03', setCode: 'ST03', set: 'Starter Decks', setNumber: 3, name: 'The Seven Warlords of the Sea', inkProfile: 'Various', colors: ['Purple', 'Black'] },
  { id: 'ST04', setCode: 'ST04', set: 'Starter Decks', setNumber: 4, name: 'Animal Kingdom Pirates', inkProfile: 'Purple', colors: ['Purple'] },
  { id: 'ST05', setCode: 'ST05', set: 'Starter Decks', setNumber: 5, name: 'Film Edition', inkProfile: 'Various', colors: ['Red', 'Blue'] },
  { id: 'ST06', setCode: 'ST06', set: 'Starter Decks', setNumber: 6, name: 'Absolute Justice', inkProfile: 'Black', colors: ['Black'] },
  { id: 'ST07', setCode: 'ST07', set: 'Starter Decks', setNumber: 7, name: 'Big Mom Pirates', inkProfile: 'Yellow', colors: ['Yellow'] },
  { id: 'ST08', setCode: 'ST08', set: 'Starter Decks', setNumber: 8, name: 'Monkey.D.Luffy', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST09', setCode: 'ST09', set: 'Starter Decks', setNumber: 9, name: 'Yamato', inkProfile: 'Yellow, Green', colors: ['Yellow', 'Green'] },
  { id: 'ST10', setCode: 'ST10', set: 'Ultra Decks', setNumber: 10, name: 'The Three Captains', inkProfile: 'Various', colors: ['Red', 'Blue', 'Green'] },
  { id: 'ST11', setCode: 'ST11', set: 'Starter Decks', setNumber: 11, name: 'Uta', inkProfile: 'Purple', colors: ['Purple'] },
  { id: 'ST12', setCode: 'ST12', set: 'Starter Decks', setNumber: 12, name: 'Zoro and Sanji', inkProfile: 'Green, Blue', colors: ['Green', 'Blue'] },
  { id: 'ST13', setCode: 'ST13', set: 'Ultra Decks', setNumber: 13, name: 'The Three Brothers', inkProfile: 'Various', colors: ['Red', 'Blue', 'Black'] },
  { id: 'ST14', setCode: 'ST14', set: 'Starter Decks', setNumber: 14, name: '3D2Y', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST15', setCode: 'ST15', set: 'Starter Decks', setNumber: 15, name: 'RED Edward.Newgate', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST16', setCode: 'ST16', set: 'Starter Decks', setNumber: 16, name: 'GREEN Uta', inkProfile: 'Green', colors: ['Green'] },
  { id: 'ST17', setCode: 'ST17', set: 'Starter Decks', setNumber: 17, name: 'BLUE Donquixote Doflamingo', inkProfile: 'Blue', colors: ['Blue'] },
  { id: 'ST18', setCode: 'ST18', set: 'Starter Decks', setNumber: 18, name: 'PURPLE Monkey.D.Luffy', inkProfile: 'Purple', colors: ['Purple'] },
  { id: 'ST19', setCode: 'ST19', set: 'Starter Decks', setNumber: 19, name: 'BLACK Smoker', inkProfile: 'Black', colors: ['Black'] },
  { id: 'ST20', setCode: 'ST20', set: 'Starter Decks', setNumber: 20, name: 'YELLOW Charlotte Katakuri', inkProfile: 'Yellow', colors: ['Yellow'] },
  { id: 'ST21', setCode: 'ST21', set: 'Starter Decks', setNumber: 21, name: 'EX: Gear 5', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST22', setCode: 'ST22', set: 'Starter Decks', setNumber: 22, name: 'Ace & Newgate', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST23', setCode: 'ST23', set: 'Starter Decks', setNumber: 23, name: 'RED Shanks', inkProfile: 'Red', colors: ['Red'] },
  { id: 'ST24', setCode: 'ST24', set: 'Starter Decks', setNumber: 24, name: 'GREEN Jewelry Bonney', inkProfile: 'Green', colors: ['Green'] },
  { id: 'ST25', setCode: 'ST25', set: 'Starter Decks', setNumber: 25, name: 'BLUE Buggy', inkProfile: 'Blue', colors: ['Blue'] },
  { id: 'ST26', setCode: 'ST26', set: 'Starter Decks', setNumber: 26, name: 'PURPLE/BLACK Monkey.D.Luffy', inkProfile: 'Purple, Black', colors: ['Purple', 'Black'] },
  { id: 'ST27', setCode: 'ST27', set: 'Starter Decks', setNumber: 27, name: 'BLACK Marshall.D.Teach', inkProfile: 'Black', colors: ['Black'] },
  { id: 'ST28', setCode: 'ST28', set: 'Starter Decks', setNumber: 28, name: 'GREEN/YELLOW Yamato', inkProfile: 'Green, Yellow', colors: ['Green', 'Yellow'] },
  { id: 'ST29', setCode: 'ST29', set: 'Starter Decks', setNumber: 29, name: 'Egghead', inkProfile: 'Various', colors: ['Blue', 'Yellow'] },
];

/** Returns the starter deck catalog for the active TCG. */
export function getStarterDecks(tcg: TCGId | null): StarterDeck[] {
  if (tcg === 'lorcana') return LORCANA_STARTER_DECKS;
  if (tcg === 'onepiece') return ONEPIECE_STARTER_DECKS;
  return [];
}

/** Distinct release sets (used to group the picker by release). */
export function getStarterDeckSets(tcg: TCGId | null): string[] {
  return [...new Set(getStarterDecks(tcg).map(d => d.set))];
}

/** @deprecated use getStarterDecks(tcg) — kept for backwards compatibility. */
export const STARTER_DECKS = LORCANA_STARTER_DECKS;
/** @deprecated use getStarterDeckSets(tcg) — kept for backwards compatibility. */
export const STARTER_DECK_SETS = [...new Set(LORCANA_STARTER_DECKS.map(d => d.set))];
