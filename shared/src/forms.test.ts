import { describe, expect, it } from "vitest";
import { BEAR_FORM, BUFF_BONUS } from "./balance";
import { equipSkill, restoreSkills, spiritOf } from "./skills";
import { playerStats } from "./stats";

describe("Espíritos do Elfo: um por vez", () => {
  it("equipar um segundo espírito tira o que já estava no outro slot", () => {
    const out = equipSkill(["spirit_water", null], 1, "spirit_fire", "elfo");
    expect(out).toEqual([null, "spirit_fire"]);
    expect(spiritOf(out ?? [])).toBe("fire");
  });

  it("trocar o espírito no mesmo slot só troca", () => {
    expect(equipSkill(["spirit_water", null], 0, "spirit_wind", "elfo")).toEqual(["spirit_wind", null]);
  });

  it("gravado com dois espíritos: o segundo cai", () => {
    expect(restoreSkills(["spirit_earth", "spirit_wind"], "elfo")).toEqual(["spirit_earth", null]);
  });

  it("outra classe não equipa espírito", () => {
    expect(equipSkill([null, null], 0, "spirit_water", "mago")).toBeUndefined();
  });
});

describe("Buffs nos status", () => {
  it("Forma de Urso: vida, defesa e o golpe de garra no lugar da arma", () => {
    const normal = playerStats([], { weapon: "espada_ferro" });
    const bear = playerStats([], { weapon: "espada_ferro" }, ["bear"]);
    expect(bear.maxHp).toBe(normal.maxHp + BUFF_BONUS.bear.maxHp);
    expect(bear.defensePercent).toBeGreaterThan(normal.defensePercent);
    expect(bear.attack).toEqual(BEAR_FORM.claws);
    expect(bear.physicalDamage).toBe(BEAR_FORM.claws.damage + BUFF_BONUS.bear.physicalDamage);
  });

  it("Rajada acelera", () => {
    expect(playerStats([], {}, ["haste"]).speed).toBeGreaterThan(playerStats([]).speed);
  });
});
