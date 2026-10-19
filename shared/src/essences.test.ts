import { describe, expect, it } from "vitest";
import { ITEMS, PLAYER_MAX_HP, PLAYER_SPEED, UNARMED_ATTACK } from "./balance";
import { playerStats } from "./essences";

describe("playerStats", () => {
  it("sem essências nem arma: os valores base e o soco", () => {
    expect(playerStats([])).toEqual({ speed: PLAYER_SPEED, damage: UNARMED_ATTACK.damage, maxHp: PLAYER_MAX_HP, attack: UNARMED_ATTACK });
  });

  it("com a espada: o golpe e o dano dela", () => {
    const sword = ITEMS.espada_ferro.equip.weapon;
    expect(playerStats([], { weapon: "espada_ferro" })).toMatchObject({ damage: sword.damage, attack: sword });
  });

  it("o dano das essências soma ao da arma", () => {
    const stats = playerStats(["essencia_goblin"], { weapon: "espada_ferro" });
    expect(stats.damage).toBe(ITEMS.espada_ferro.equip.weapon.damage + ITEMS.essencia_goblin.essence.damage);
  });

  it("cada essência aplica o seu efeito", () => {
    expect(playerStats(["essencia_rato"]).speed).toBeCloseTo(PLAYER_SPEED * (1 + ITEMS.essencia_rato.essence.speedPercent / 100));
    expect(playerStats(["essencia_goblin"]).damage).toBe(UNARMED_ATTACK.damage + ITEMS.essencia_goblin.essence.damage);
    expect(playerStats(["essencia_goblin_rara"]).maxHp).toBe(PLAYER_MAX_HP + ITEMS.essencia_goblin_rara.essence.maxHp);
  });

  it("essências iguais se somam (porcentagens somam, não multiplicam)", () => {
    const pct = ITEMS.essencia_rato.essence.speedPercent;
    expect(playerStats(["essencia_rato", "essencia_rato"]).speed).toBeCloseTo(PLAYER_SPEED * (1 + (2 * pct) / 100));
  });

  it("essências diferentes não interferem entre si", () => {
    const stats = playerStats(["essencia_rato", "essencia_goblin"]);
    expect(stats.maxHp).toBe(PLAYER_MAX_HP);
    expect(stats.damage).toBe(UNARMED_ATTACK.damage + ITEMS.essencia_goblin.essence.damage);
  });
});
