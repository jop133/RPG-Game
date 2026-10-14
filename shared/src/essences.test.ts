import { describe, expect, it } from "vitest";
import { ITEMS, PLAYER_ATTACK, PLAYER_MAX_HP, PLAYER_SPEED } from "./balance";
import { playerStats } from "./essences";

describe("playerStats", () => {
  it("sem essências: os valores base", () => {
    expect(playerStats([])).toEqual({ speed: PLAYER_SPEED, damage: PLAYER_ATTACK.damage, maxHp: PLAYER_MAX_HP });
  });

  it("cada essência aplica o seu efeito", () => {
    expect(playerStats(["essencia_rato"]).speed).toBeCloseTo(PLAYER_SPEED * (1 + ITEMS.essencia_rato.essence.speedPercent / 100));
    expect(playerStats(["essencia_goblin"]).damage).toBe(PLAYER_ATTACK.damage + ITEMS.essencia_goblin.essence.damage);
    expect(playerStats(["essencia_goblin_rara"]).maxHp).toBe(PLAYER_MAX_HP + ITEMS.essencia_goblin_rara.essence.maxHp);
  });

  it("essências iguais se somam (porcentagens somam, não multiplicam)", () => {
    const pct = ITEMS.essencia_rato.essence.speedPercent;
    expect(playerStats(["essencia_rato", "essencia_rato"]).speed).toBeCloseTo(PLAYER_SPEED * (1 + (2 * pct) / 100));
  });

  it("essências diferentes não interferem entre si", () => {
    const stats = playerStats(["essencia_rato", "essencia_goblin"]);
    expect(stats.maxHp).toBe(PLAYER_MAX_HP);
    expect(stats.damage).toBe(PLAYER_ATTACK.damage + ITEMS.essencia_goblin.essence.damage);
  });
});
