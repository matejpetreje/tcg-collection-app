import { lorcana } from '@/tcg/games/lorcana';
import { onepiece } from '@/tcg/games/onepiece';
import { yugioh } from '@/tcg/games/yugioh';
import { mtg } from '@/tcg/games/mtg';
import { pokemon } from '@/tcg/games/pokemon';
import type { TCGDefinition, TCGId } from '@/tcg/types';

export const TCG_REGISTRY: Record<TCGId, TCGDefinition> = {
  lorcana,
  onepiece,
  yugioh,
  mtg,
  pokemon,
};

export const TCGS: TCGDefinition[] = [
  lorcana,
  mtg,
  pokemon,
  onepiece,
  yugioh,
];

export function getTCG(id: TCGId): TCGDefinition {
  return TCG_REGISTRY[id];
}

export function getTCGDatabaseFile(id: TCGId): string {
  return TCG_REGISTRY[id].databaseFile;
}
