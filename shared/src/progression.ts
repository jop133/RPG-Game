import { LEVEL_XP, type MobKind } from "./balance";

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
