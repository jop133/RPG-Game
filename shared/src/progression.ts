import { ADVENTURER_RANKS, LEVEL_XP, MOB_KINDS, type MobKind } from "./balance";

// Mensagem "firstKill": primeira morte deste tipo pelo personagem. O servidor diz se subiu de nível.
export interface FirstKillMessage {
  mob: MobKind;
  xp: number;
  level: number;
  leveledUp: boolean;
}

// Nível 1 com 0 XP; sobe um nível a cada limite de LEVEL_XP alcançado.
export function levelForXp(xp: number): number {
  return 1 + LEVEL_XP.filter((needed) => xp >= needed).length;
}

// XP total para o próximo nível, ou undefined se já está no máximo da tabela.
export function xpForNextLevel(level: number): number | undefined {
  return LEVEL_XP[level - 1];
}

// Progresso dentro do nível atual (anel de XP do HUD): de xpStart (o XP que deu este nível; 0 no 1) a xpNext (o do
// próximo). progress vai de 0 a 1; no nível máximo da tabela, 1 e xpNext undefined.
export interface LevelProgress {
  xpStart: number;
  xpNext?: number;
  progress: number;
}

export function levelProgress(level: number, xp: number): LevelProgress {
  const xpStart = level > 1 ? (LEVEL_XP[level - 2] ?? 0) : 0;
  const xpNext = xpForNextLevel(level);
  if (xpNext === undefined) return { xpStart, progress: 1 };
  const span = xpNext - xpStart;
  const progress = span > 0 ? Math.min(1, Math.max(0, (xp - xpStart) / span)) : 1;
  return { xpStart, xpNext, progress };
}

// Um degrau do Rank de Aventureiro: `bestiary` = tipos de mob no bestiário para chegar a ele (ADVENTURER_RANKS).
export interface AdventurerRank {
  rank: string;
  title: string;
  bestiary: number;
}

// Rank da linhagem pelo bestiário. Só contam tipos que existem em MOB_KINDS: o banco guarda tipos que saíram do jogo
// (o rato). `next` = o próximo degrau, ou undefined no último.
export function adventurerRank(bestiary: readonly string[]): { known: number; current: AdventurerRank; next?: AdventurerRank } {
  const known = new Set(bestiary.filter((kind) => Object.hasOwn(MOB_KINDS, kind))).size;
  const reached = ADVENTURER_RANKS.filter((step) => known >= step.bestiary);
  const current = reached.at(-1) ?? (ADVENTURER_RANKS[0] as AdventurerRank);
  return { known, current, next: ADVENTURER_RANKS[reached.length] };
}

// Tipos de mob que valem no bestiário (os do jogo agora), na ordem de MOB_KINDS.
export const BESTIARY_KINDS = Object.keys(MOB_KINDS) as MobKind[];
