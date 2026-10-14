import { ITEMS, type ItemId, PLAYER_ATTACK, PLAYER_MAX_HP, PLAYER_SPEED } from "./balance";
import type { ItemStats } from "./inventory";

export interface EssenceEffect {
  speedPercent?: number;
  damage?: number;
  maxHp?: number;
}

// Status do personagem com as essências equipadas. Efeitos iguais se somam.
export interface PlayerStats {
  speed: number;
  damage: number;
  maxHp: number;
}

export function playerStats(essences: readonly ItemId[]): PlayerStats {
  let speedPercent = 0;
  let damage = 0;
  let maxHp = 0;
  for (const item of essences) {
    const effect = (ITEMS[item] as ItemStats).essence;
    speedPercent += effect?.speedPercent ?? 0;
    damage += effect?.damage ?? 0;
    maxHp += effect?.maxHp ?? 0;
  }
  return {
    speed: PLAYER_SPEED * (1 + speedPercent / 100),
    damage: PLAYER_ATTACK.damage + damage,
    maxHp: PLAYER_MAX_HP + maxHp,
  };
}
