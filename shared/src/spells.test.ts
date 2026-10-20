import { describe, expect, it } from "vitest";
import { LIGHTNING_SPELL, SPELL_CAST_RANGE, SPELL_FLATTEN, SWAMP_SPELL } from "./balance";
import type { CollisionGrid } from "./collision";
import { feetInside, lightningArea, parseSpellCast, spellTarget, swampArea, swampSlow } from "./spells";

const TILE = 32;
// 30x30 tiles de chão, com uma parede no tile (10, 3).
const GRID: CollisionGrid = {
  width: 30,
  height: 30,
  tileSize: TILE,
  solid: Array.from({ length: 900 }, (_, i) => i === 3 * 30 + 10),
};

describe("parseSpellCast", () => {
  it("aceita magia conhecida e ponto finito", () => {
    expect(parseSpellCast({ spell: "lightning", x: 10, y: 20 })).toEqual({ spell: "lightning", target: { x: 10, y: 20 } });
    expect(parseSpellCast({ spell: "swamp", x: 0, y: 0 })?.spell).toBe("swamp");
  });

  it("recusa o resto", () => {
    for (const raw of [null, 3, {}, { spell: "fireball", x: 1, y: 1 }, { spell: "swamp", x: "1", y: 1 }, { spell: "swamp", x: NaN, y: 1 }]) {
      expect(parseSpellCast(raw)).toBeUndefined();
    }
  });
});

describe("spellTarget", () => {
  const caster = { x: 100, y: 400 };

  it("dentro do alcance: cai no ponto do mouse", () => {
    expect(spellTarget(caster, { x: 200, y: 400 }, GRID)).toEqual({ x: 200, y: 400 });
  });

  it("longe demais: é puxado até o alcance, na mesma direção", () => {
    const point = spellTarget(caster, { x: 900, y: 400 }, GRID);
    expect(point?.x).toBeCloseTo(caster.x + SPELL_CAST_RANGE);
    expect(point?.y).toBeCloseTo(400);
  });

  it("em parede não cai", () => {
    expect(spellTarget({ x: 300, y: 112 }, { x: 10 * TILE + 16, y: 3 * TILE + 16 }, GRID)).toBeUndefined();
  });
});

describe("áreas no chão", () => {
  it("o raio é um círculo achatado pela vista", () => {
    const area = lightningArea({ x: 0, y: 0 });
    expect(area.radiusY).toBeCloseTo(LIGHTNING_SPELL.radiusX * SPELL_FLATTEN);
  });

  it("pés dentro: conta o meio tamanho para baixo; a folga alarga a área", () => {
    const area = lightningArea({ x: 100, y: 100 });
    // Centro 12 px acima da área: os pés (centro + 12) estão no meio dela.
    expect(feetInside(area, { x: 100, y: 88 }, 12)).toBe(true);
    // Na horizontal, até radiusX + folga.
    expect(feetInside(area, { x: 100 + LIGHTNING_SPELL.radiusX + 10, y: 88 }, 12)).toBe(true);
    expect(feetInside(area, { x: 100 + LIGHTNING_SPELL.radiusX + 10, y: 88 }, 12, 0)).toBe(false);
    // Longe na vertical (a elipse é achatada).
    expect(feetInside(area, { x: 100, y: 88 + LIGHTNING_SPELL.radiusX }, 12)).toBe(false);
  });
});

describe("swampSlow", () => {
  const swamp = { ...swampArea({ x: 200, y: 200 }), owner: "mago" };

  it("quem pisa na poça de outro fica lento", () => {
    expect(swampSlow({ x: 200, y: 188 }, 12, "mob-1", [swamp])).toBe(SWAMP_SPELL.slow);
    expect(swampSlow({ x: 200, y: 188 }, 12, "aliado", [swamp])).toBe(SWAMP_SPELL.slow);
  });

  it("quem lançou não; fora da poça, ninguém", () => {
    expect(swampSlow({ x: 200, y: 188 }, 12, "mago", [swamp])).toBe(1);
    expect(swampSlow({ x: 200 + SWAMP_SPELL.radiusX + 5, y: 188 }, 12, "mob-1", [swamp])).toBe(1);
    expect(swampSlow({ x: 200, y: 188 }, 12, "mob-1", [])).toBe(1);
  });
});
