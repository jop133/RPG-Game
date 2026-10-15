import { describe, expect, it } from "vitest";
import { VIEW_HYSTERESIS } from "./balance";
import { isLit, lightRadius, staticLitMap } from "./light";

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
    expect(isLit({ x: 50, y: 50 }, lamp, [], 100, false)).toBe(true);
    expect(isLit({ x: 250, y: 250 }, lamp, [], 100, false)).toBe(false);
  });

  it("jogador ilumina até o raio dele", () => {
    const player = { x: 0, y: 0 };
    expect(isLit({ x: 100, y: 0 }, dark, [player], 100, false)).toBe(true);
    expect(isLit({ x: 101, y: 0 }, dark, [player], 100, false)).toBe(false);
  });

  it("qualquer jogador ilumina, não só quem está olhando", () => {
    expect(isLit({ x: 300, y: 300 }, dark, [{ x: 0, y: 0 }, { x: 290, y: 300 }], 100, false)).toBe(true);
  });

  it("quem já é visto só some depois da folga", () => {
    const p = { x: 100 + VIEW_HYSTERESIS, y: 0 };
    expect(isLit(p, dark, [{ x: 0, y: 0 }], 100, false)).toBe(false);
    expect(isLit(p, dark, [{ x: 0, y: 0 }], 100, true)).toBe(true);
  });

  it("fora do mapa não quebra: só a luz dos jogadores conta", () => {
    expect(isLit({ x: -50, y: -50 }, lamp, [], 100, false)).toBe(false);
  });
});

describe("lightRadius", () => {
  it("tipo conhecido tem raio; desconhecido não", () => {
    expect(lightRadius("tocha")).toBeGreaterThan(0);
    expect(lightRadius("lanterna-magica")).toBeUndefined();
    expect(lightRadius("toString")).toBeUndefined();
  });
});
