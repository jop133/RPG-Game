import { describe, expect, it } from "vitest";
import type { CollisionGrid } from "./collision";
import { hasLineOfSight } from "./lineOfSight";

const TILE = 32;

function gridFrom(rows: string[]): CollisionGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

const center = (col: number, row: number) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });

describe("hasLineOfSight", () => {
  it("campo aberto: vê", () => {
    const grid = gridFrom([".....", ".....", "....."]);
    expect(hasLineOfSight(grid, center(0, 0), center(4, 2))).toBe(true);
  });

  it("parede no meio: não vê", () => {
    const grid = gridFrom(["..#.."]);
    expect(hasLineOfSight(grid, center(0, 0), center(4, 0))).toBe(false);
  });

  it("vale nos dois sentidos", () => {
    const grid = gridFrom(["..#.."]);
    expect(hasLineOfSight(grid, center(4, 0), center(0, 0))).toBe(false);
  });

  it("vertical, com e sem parede", () => {
    expect(hasLineOfSight(gridFrom([".", ".", "."]), center(0, 0), center(0, 2))).toBe(true);
    expect(hasLineOfSight(gridFrom([".", "#", "."]), center(0, 0), center(0, 2))).toBe(false);
  });

  it("mesmo tile: vê", () => {
    expect(hasLineOfSight(gridFrom(["."]), { x: 2, y: 2 }, { x: 30, y: 30 })).toBe(true);
  });

  it("linha passando perto da parede sem tocar: vê", () => {
    // De (0,0) a (3,1): a linha cruza (1,0), (2,1)… e nunca o tile de parede (3,0).
    const grid = gridFrom(["...#", "...."]);
    expect(hasLineOfSight(grid, center(0, 0), center(3, 1))).toBe(true);
  });

  it("diagonal raspando a quina de uma parede: não vê (mesma regra do pathfinding)", () => {
    // De (0,0) a (1,1) passa exatamente pelo canto comum; o vizinho (1,0) é parede.
    const grid = gridFrom([".#", ".."]);
    expect(hasLineOfSight(grid, center(0, 0), center(1, 1))).toBe(false);
  });

  it("diagonal pela quina com os dois vizinhos livres: vê", () => {
    const grid = gridFrom(["..", ".."]);
    expect(hasLineOfSight(grid, center(0, 0), center(1, 1))).toBe(true);
  });

  it("através da porta: vê de um lado ao outro alinhado com ela, não de fora do alinhamento", () => {
    const grid = gridFrom([
      "....#....",
      ".........",
      "....#....",
    ]);
    expect(hasLineOfSight(grid, center(0, 1), center(8, 1))).toBe(true);
    expect(hasLineOfSight(grid, center(0, 0), center(8, 0))).toBe(false);
  });
});
