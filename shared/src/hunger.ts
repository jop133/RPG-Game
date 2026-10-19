import { HUNGER_DECAY_PER_SECOND, STARVATION_DAMAGE_PER_SECOND } from "./balance";

// vigorPercent: o Vigor do personagem, quanto mais devagar a fome cai (em %).
export function tickHunger(hunger: number, dtMs: number, vigorPercent = 0): number {
  return Math.max(0, hunger - (HUNGER_DECAY_PER_SECOND * (1 - vigorPercent / 100) * dtMs) / 1000);
}

// Vida a perder neste tick por fome. Só quando a fome já está zerada.
export function starvationDamage(hunger: number, dtMs: number): number {
  return hunger > 0 ? 0 : (STARVATION_DAMAGE_PER_SECOND * dtMs) / 1000;
}
