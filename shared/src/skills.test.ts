import { describe, expect, it } from "vitest";
import { CLASS_SKILLS, SKILL_SLOTS, equipSkill, parseSkillCast, parseSkillEquip, restoreSkills, startingSkills } from "./skills";

describe("startingSkills e restoreSkills", () => {
  it("o mago entra com a Bola de Fogo no Q e o Raio no R; as outras classes, com os slots vazios", () => {
    expect(startingSkills("mago")).toEqual(["fireball", "lightning"]);
    expect(startingSkills("barbaro")).toEqual([null, null]);
    expect(startingSkills(undefined)).toEqual([null, null]);
  });

  it("nada gravado = o inicial; gravado = o gravado", () => {
    expect(restoreSkills(null, "mago")).toEqual(["fireball", "lightning"]);
    expect(restoreSkills(["swamp", null], "mago")).toEqual(["swamp", null]);
  });

  it("descarta skill de outra classe, desconhecida ou repetida, e completa os slots", () => {
    expect(restoreSkills(["swamp", "swamp"], "mago")).toEqual(["swamp", null]);
    expect(restoreSkills(["fireball", "golpe"], "mago")).toEqual(["fireball", null]);
    expect(restoreSkills(["fireball", "lightning"], "elfo")).toEqual([null, null]);
    expect(restoreSkills("lixo", "mago")).toEqual([null, null]);
    expect(restoreSkills([], "mago")).toHaveLength(SKILL_SLOTS);
  });

  it("as habilidades de cada classe (o bárbaro ainda não tem)", () => {
    expect(CLASS_SKILLS.mago).toEqual(["fireball", "lightning", "swamp", "ice_barrier"]);
    expect(CLASS_SKILLS.elfo).toEqual(["spirit_water", "spirit_fire", "spirit_earth", "spirit_wind"]);
    expect(CLASS_SKILLS.homem_fera).toEqual(["bear_transform"]);
    expect(CLASS_SKILLS.barbaro).toEqual([]);
  });
});

describe("equipSkill", () => {
  const start = ["fireball", "lightning"] as const;

  it("põe a skill no slot", () => {
    expect(equipSkill(start, 1, "swamp", "mago")).toEqual(["fireball", "swamp"]);
  });

  it("skill que já está no outro slot troca de lugar", () => {
    expect(equipSkill(start, 0, "lightning", "mago")).toEqual(["lightning", "fireball"]);
    expect(equipSkill(["swamp", null], 1, "swamp", "mago")).toEqual([null, "swamp"]);
  });

  it("null esvazia o slot", () => {
    expect(equipSkill(start, 0, null, "mago")).toEqual([null, "lightning"]);
  });

  it("recusa skill de outra classe, slot inválido e pedido que não muda nada", () => {
    expect(equipSkill([null, null], 0, "fireball", "barbaro")).toBeUndefined();
    expect(equipSkill(start, 2, "swamp", "mago")).toBeUndefined();
    expect(equipSkill(start, 0, "fireball", "mago")).toBeUndefined();
    expect(equipSkill([null, null], 0, null, "mago")).toBeUndefined();
  });
});

describe("mensagens do cliente", () => {
  it("parseSkillEquip: slot válido e skill conhecida ou null", () => {
    expect(parseSkillEquip({ slot: 1, skill: "swamp" })).toEqual({ slot: 1, skill: "swamp" });
    expect(parseSkillEquip({ slot: 0, skill: null })).toEqual({ slot: 0, skill: null });
    for (const raw of [null, {}, { slot: 2, skill: "swamp" }, { slot: 0.5, skill: "swamp" }, { slot: 0, skill: "golpe" }, { slot: 0 }]) {
      expect(parseSkillEquip(raw)).toBeUndefined();
    }
  });

  it("parseSkillCast: slot válido e ponto finito", () => {
    expect(parseSkillCast({ slot: 0, x: 5, y: 6 })).toEqual({ slot: 0, target: { x: 5, y: 6 } });
    for (const raw of [null, { slot: 3, x: 1, y: 1 }, { slot: 0, x: "1", y: 1 }, { slot: 1, x: Infinity, y: 1 }]) {
      expect(parseSkillCast(raw)).toBeUndefined();
    }
  });
});
