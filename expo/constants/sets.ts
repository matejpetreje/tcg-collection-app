export interface SetInfo {
  number: number;
  name: string;
}

const SET_NUMBER_BY_NAME: Record<string, number> = {
  'The First Chapter': 1,
  'Rise of the Floodborn': 2,
  'Into the Inklands': 3,
  "Ursula's Return": 4,
  'Shimmering Skies': 5,
  'Azurite Sea': 6,
  "Archazia's Island": 7,
  'Reign of Jafar': 8,
  'Fabled': 9,
  'Whispers in the Well': 10,
  'Winterspell': 11,
};

export function getSetNumber(setName: string | null | undefined): number | null {
  if (!setName) return null;
  return SET_NUMBER_BY_NAME[setName] ?? null;
}

export function getSetDisplayLabel(setName: string | null | undefined, setCode: string | null | undefined): string {
  const num = getSetNumber(setName);
  if (num !== null && setName) {
    return `S${num} · ${setCode ?? setName}`;
  }
  return setName ?? setCode ?? '';
}

export function getSetSortOrder(setName: string | null | undefined): number {
  const num = getSetNumber(setName);
  return num ?? 999;
}
