import { describe, expect, it } from "vitest";
import { BASE_STATS, ITEMS, MAX_REDUCTION_PERCENT, PLAYER_ATTACK_COOLDOWN_MS, REGEN_DELAY_MS, UNARMED_ATTACK } from "./balance";
import { attackCooldownMs } from "./combat";
import { damageTaken, hitDamage, lifesteal, playerStats, regenerate, statsFrom, type PlayerStats } from "./stats";

// Status de teste: a base, com o que o caso pede por cima (sem depender de item que tenha esse bônus).
const withStats = (changes: Partial<PlayerStats>): PlayerStats => ({ ...playerStats([]), ...changes });

describe("playerStats", () => {
  it("sem essências nem equipamento: a base, com o soco", () => {
    expect(playerStats([])).toEqual({
      ...BASE_STATS,
      physicalDamage: UNARMED_ATTACK.damage,
      attack: UNARMED_ATTACK,
    });
  });

  it("os 12 status existem (e os das essências dos monstros)", () => {
    const keys = Object.keys(playerStats([])).filter((key) => key !== "attack");
    expect(keys.sort()).toEqual(
      [
        "maxHp",
        "maxMana",
        "physicalDamage",
        "magicDamage",
        "defensePercent",
        "magicResistPercent",
        "attackSpeedPercent",
        "speed",
        "lightRadius",
        "manaRegenPerSecond",
        "lifestealPercent",
        "woundedDamagePercent",
        "stealthPercent",
        "vigorPercent",
        "regenPerSecond",
      ].sort(),
    );
  });

  it("com a espada: o golpe e o dano físico dela", () => {
    const sword = ITEMS.espada_ferro.equip.weapon;
    expect(playerStats([], { weapon: "espada_ferro" })).toMatchObject({ physicalDamage: sword.damage, attack: sword });
  });

  it("cada essência aplica o seu efeito", () => {
    expect(playerStats(["essencia_rato"]).speed).toBeCloseTo(BASE_STATS.speed * (1 + ITEMS.essencia_rato.essence.speedPercent / 100));
    expect(playerStats(["essencia_lobo"]).physicalDamage).toBe(UNARMED_ATTACK.damage + ITEMS.essencia_lobo.essence.physicalDamage);
    expect(playerStats(["essencia_goblin_rara"]).maxHp).toBe(BASE_STATS.maxHp + ITEMS.essencia_goblin_rara.essence.maxHp);
  });

  it("o dano físico das essências soma ao da arma", () => {
    const stats = playerStats(["essencia_lobo"], { weapon: "espada_ferro" });
    expect(stats.physicalDamage).toBe(ITEMS.espada_ferro.equip.weapon.damage + ITEMS.essencia_lobo.essence.physicalDamage);
  });

  it("essências iguais se somam (porcentagens somam, não multiplicam)", () => {
    const pct = ITEMS.essencia_rato.essence.speedPercent;
    expect(playerStats(["essencia_rato", "essencia_rato"]).speed).toBeCloseTo(BASE_STATS.speed * (1 + (2 * pct) / 100));
  });

  it("essências diferentes não interferem entre si", () => {
    const stats = playerStats(["essencia_rato", "essencia_lobo"]);
    expect(stats.maxHp).toBe(BASE_STATS.maxHp);
    expect(stats.physicalDamage).toBe(UNARMED_ATTACK.damage + ITEMS.essencia_lobo.essence.physicalDamage);
  });
});

describe("damageTaken", () => {
  it("Defesa reduz o dano físico em %; Resistência Mágica, o mágico", () => {
    const stats = withStats({ defensePercent: 25, magicResistPercent: 50 });
    expect(damageTaken(20, "physical", stats)).toBe(15);
    expect(damageTaken(20, "magic", stats)).toBe(10);
  });

  it("dano verdadeiro (fome) não passa pela redução", () => {
    expect(damageTaken(20, "true", withStats({ defensePercent: 50, magicResistPercent: 50 }))).toBe(20);
  });

  it("sem Defesa, o dano passa inteiro", () => {
    expect(damageTaken(12, "physical", playerStats([]))).toBe(12);
  });
});

describe("tetos das reduções", () => {
  it("nenhuma redução passa de MAX_REDUCTION_PERCENT: ninguém fica imune, invisível ou sem fome", () => {
    const stats = statsFrom([{ defensePercent: 60 }, { defensePercent: 60, magicResistPercent: 500, stealthPercent: 200, vigorPercent: 150 }], UNARMED_ATTACK);
    expect(stats.defensePercent).toBe(MAX_REDUCTION_PERCENT);
    expect(stats.magicResistPercent).toBe(MAX_REDUCTION_PERCENT);
    expect(stats.stealthPercent).toBe(MAX_REDUCTION_PERCENT);
    expect(stats.vigorPercent).toBe(MAX_REDUCTION_PERCENT);
    expect(damageTaken(10, "physical", stats)).toBeGreaterThan(0);
  });

  it("bônus de equipamento e de essência se somam; Percepção soma px ao raio de luz", () => {
    const stats = statsFrom([{ perception: 40, regenPerSecond: 1 }, { perception: 20, maxMana: 30 }], UNARMED_ATTACK);
    expect(stats.lightRadius).toBe(BASE_STATS.lightRadius + 60);
    expect(stats.maxMana).toBe(BASE_STATS.maxMana + 30);
    expect(stats.regenPerSecond).toBe(1);
  });
});

describe("attackCooldownMs", () => {
  it("sem Velocidade de Ataque, a recarga base; com +100%, a metade", () => {
    expect(attackCooldownMs(playerStats([]))).toBe(PLAYER_ATTACK_COOLDOWN_MS);
    expect(attackCooldownMs(withStats({ attackSpeedPercent: 100 }))).toBe(PLAYER_ATTACK_COOLDOWN_MS / 2);
  });
});

describe("regenerate", () => {
  const healer = withStats({ regenPerSecond: 2, maxHp: 100 });

  it("recupera vida por segundo, fora de combate", () => {
    expect(regenerate(50, healer, 1000, REGEN_DELAY_MS)).toBe(52);
  });

  it("não recupera logo depois de levar dano", () => {
    expect(regenerate(50, healer, 1000, REGEN_DELAY_MS - 1)).toBe(50);
  });

  it("nunca passa da vida máxima, e morto não volta", () => {
    expect(regenerate(99.5, healer, 1000, REGEN_DELAY_MS)).toBe(100);
    expect(regenerate(0, healer, 1000, REGEN_DELAY_MS)).toBe(0);
  });

  it("sem Regeneração, nada muda", () => {
    expect(regenerate(50, playerStats([]), 1000, REGEN_DELAY_MS)).toBe(50);
  });
});

describe("essências dos monstros (status novos)", () => {
  it("goblin: velocidade, velocidade de ataque e raio de luz em %", () => {
    const s = playerStats(["essencia_goblin"]);
    expect(s.speed).toBeCloseTo(BASE_STATS.speed * 1.12);
    expect(s.attackSpeedPercent).toBe(15);
    expect(s.lightRadius).toBeCloseTo(BASE_STATS.lightRadius * 1.2);
  });

  it("slime: vida, regeneração e defesa", () => {
    const s = playerStats(["essencia_slime"]);
    expect(s).toMatchObject({ maxHp: BASE_STATS.maxHp + 45, regenPerSecond: 3, defensePercent: 5 });
  });

  it("lobo: dano em alvo ferido e roubo de vida", () => {
    const s = playerStats(["essencia_lobo"]);
    expect(hitDamage(20, s, 40, 100)).toBeCloseTo(23);
    expect(hitDamage(20, s, 60, 100)).toBe(20);
    expect(lifesteal(20, s)).toBeCloseTo(1.6);
    expect(lifesteal(20, playerStats([]))).toBe(0);
  });

  it("gnomo: mana, regeneração de mana e Dano Mágico em %", () => {
    const s = playerStats(["essencia_gnomo"], { weapon: "cajado_arcano" });
    expect(s.maxMana).toBe(BASE_STATS.maxMana + 50 + 25);
    expect(s.manaRegenPerSecond).toBeCloseTo(BASE_STATS.manaRegenPerSecond + 2.5);
    expect(s.magicDamage).toBeCloseTo(14 * 1.18);
  });
});
