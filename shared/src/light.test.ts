import { describe, expect, it } from "vitest";
import { VIEW_HYSTERESIS } from "./balance";
import type { CollisionGrid } from "./collision";
import { isLit, lightRadius, lightReach, lightReaches, staticLitMap } from "./light";

describe("staticLitMap", () => {
  it("acende os tiles cujo centro está dentro do raio, e só eles", () => {
    // Luz no centro do tile (2, 2) com raio de 1 tile: acende ele e os 4 vizinhos diretos (centros a 32 px),
    // não os das diagonais (a 45 px).
    const lit = staticLitMap([{ x: 80, y: 80, radius: 32 }], 5, 5, 32);
    const on = lit.cells.flatMap((v, i) => (v ? [`${i % 5},${Math.floor(i / 5)}`] : []));
    expect(on.sort()).toEqual(["1,2", "2,1", "2,2", "2,3", "3,2"]);
  });

  it("luz perto da borda não sai do mapa", () => {
    const lit = staticLitMap([{ x: 0, y: 0, radius: 100 }], 2, 2, 32);
    expect(lit.cells).toEqual([true, true, true, true]);
  });
});

describe("isLit", () => {
  const dark = staticLitMap([], 10, 10, 32);
  const lamp = staticLitMap([{ x: 48, y: 48, radius: 40 }], 10, 10, 32);

  it("tile de luz fixa ilumina quem está nele", () => {
    expect(isLit({ x: 50, y: 50 }, lamp, [], false)).toBe(true);
    expect(isLit({ x: 250, y: 250 }, lamp, [], false)).toBe(false);
  });

  it("jogador ilumina até o raio dele", () => {
    const player = { x: 0, y: 0, radius: 100 };
    expect(isLit({ x: 100, y: 0 }, dark, [player], false)).toBe(true);
    expect(isLit({ x: 101, y: 0 }, dark, [player], false)).toBe(false);
  });

  it("qualquer jogador ilumina, não só quem está olhando", () => {
    expect(isLit({ x: 300, y: 300 }, dark, [{ x: 0, y: 0, radius: 100 }, { x: 290, y: 300, radius: 100 }], false)).toBe(true);
  });

  it("quem já é visto só some depois da folga", () => {
    const p = { x: 100 + VIEW_HYSTERESIS, y: 0 };
    expect(isLit(p, dark, [{ x: 0, y: 0, radius: 100 }], false)).toBe(false);
    expect(isLit(p, dark, [{ x: 0, y: 0, radius: 100 }], true)).toBe(true);
  });

  it("cada jogador ilumina até o raio dele (Percepção)", () => {
    const near = { x: 0, y: 0, radius: 100 };
    const far = { x: 0, y: 0, radius: 200 };
    expect(isLit({ x: 150, y: 0 }, dark, [near], false)).toBe(false);
    expect(isLit({ x: 150, y: 0 }, dark, [near, far], false)).toBe(true);
  });

  it("fora do mapa não quebra: só a luz dos jogadores conta", () => {
    expect(isLit({ x: -50, y: -50 }, lamp, [], false)).toBe(false);
  });
});

describe("lightRadius", () => {
  it("tipo conhecido tem raio; desconhecido não", () => {
    expect(lightRadius("tocha")).toBeGreaterThan(0);
    expect(lightRadius("lanterna-magica")).toBeUndefined();
    expect(lightRadius("toString")).toBeUndefined();
  });
});

// Grade de teste: "#" é parede, "." é chão; tiles de 32 px.
function gridOf(rows: string[]): CollisionGrid {
  return { width: rows[0]?.length ?? 0, height: rows.length, tileSize: 32, solid: rows.join("").split("").map((c) => c === "#") };
}

// Centro do tile (col, row).
const at = (col: number, row: number) => ({ x: col * 32 + 16, y: row * 32 + 16 });

describe("lightReach", () => {
  // Dois corredores paralelos separados por uma parede de 1 tile (a linha do meio).
  const corridors = gridOf(["......", "######", "......"]);

  it("sem parede no caminho, chega inteira", () => {
    expect(lightReach(corridors, at(0, 0), at(5, 0))).toBe(1);
    expect(lightReaches(corridors, at(0, 0), at(5, 0))).toBe(true);
  });

  it("para na borda da primeira parede: o corredor do outro lado fica escuro", () => {
    // De (2,0) para (2,2): entra na parede em y = 32, a 16 px dos 64 px do segmento.
    expect(lightReach(corridors, at(2, 0), at(2, 2))).toBeCloseTo(0.25);
    expect(lightReaches(corridors, at(2, 0), at(4, 2))).toBe(false);
  });

  it("o tile de onde a luz sai não a bloqueia (tocha dentro da parede)", () => {
    const torch = at(2, 1);
    expect(lightReaches(corridors, torch, at(2, 0))).toBe(true);
    expect(lightReaches(corridors, torch, at(2, 2))).toBe(true);
    // Mas a parede vizinha bloqueia: a tocha não ilumina através do resto do muro.
    const thick = gridOf(["......", "######", "######", "......"]);
    expect(lightReaches(thick, at(2, 1), at(2, 3))).toBe(false);
  });

  it("não passa espremida pela quina entre duas paredes", () => {
    // Na diagonal, exato pela quina entre (1,0) e (0,1), as duas paredes: não passa.
    expect(lightReaches(gridOf([".#", "#."]), at(0, 0), at(1, 1))).toBe(false);
    // Com só uma das duas, também não (a mesma regra do pathfinding).
    expect(lightReaches(gridOf([".#", ".."]), at(0, 0), at(1, 1))).toBe(false);
    expect(lightReaches(gridOf(["..", ".."]), at(0, 0), at(1, 1))).toBe(true);
  });
});

describe("luz cortada por parede", () => {
  const corridors = gridOf(["......", "######", "......"]);

  it("staticLitMap com a grade não acende o corredor atrás da parede", () => {
    const lit = staticLitMap([{ ...at(2, 0), radius: 100 }], 6, 3, 32, corridors);
    expect(lit.cells[0 * 6 + 2]).toBe(true);
    expect(lit.cells[2 * 6 + 2]).toBe(false);
    // Sem a grade, como antes: o círculo atravessa.
    expect(staticLitMap([{ ...at(2, 0), radius: 100 }], 6, 3, 32).cells[2 * 6 + 2]).toBe(true);
  });

  it("isLit com a grade: a luz do jogador não alcança quem está do outro lado", () => {
    const dark = staticLitMap([], 6, 3, 32);
    const player = { ...at(2, 0), radius: 120 };
    expect(isLit(at(3, 0), dark, [player], false, corridors)).toBe(true);
    expect(isLit(at(2, 2), dark, [player], false, corridors)).toBe(false);
    expect(isLit(at(2, 2), dark, [player], false)).toBe(true);
  });
});
