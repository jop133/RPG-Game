import { ITEMS, type ItemId, PLAYER_MAX_HP, PLAYER_SPEED } from "./balance";
import { type Equipment, type WeaponStats, weaponStats } from "./equipment";
import type { ItemStats } from "./inventory";

export interface EssenceEffect {
  speedPercent?: number;
  damage?: number;
  maxHp?: number;
}

// Status do personagem com as essências absorvidas e o equipamento. Efeitos iguais se somam. O golpe (alcance e arco)
// é o da arma equipada, ou o soco; o dano é o dela mais o das essências.
export interface PlayerStats {
  speed: number;
  damage: number;
  maxHp: number;
  attack: WeaponStats;
}

export function playerStats(essences: readonly ItemId[], equipment: Equipment = {}): PlayerStats {
  let speedPercent = 0;
  let damage = 0;
  let maxHp = 0;
  for (const item of essences) {
    const effect = (ITEMS[item] as ItemStats).essence;
    speedPercent += effect?.speedPercent ?? 0;
    damage += effect?.damage ?? 0;
    maxHp += effect?.maxHp ?? 0;
  }
  const attack = weaponStats(equipment);
  return {
    speed: PLAYER_SPEED * (1 + speedPercent / 100),
    damage: attack.damage + damage,
    maxHp: PLAYER_MAX_HP + maxHp,
    attack,
  };
}
