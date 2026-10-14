import { describe, expect, it } from "vitest";
import { type CollisionGrid, isSolid } from "./collision";
import type { Vec2 } from "./movement";
import { findPath } from "./pathfinding";

const TILE = 32;

function gridFrom(rows: string[]): CollisionGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

const center = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
const tile = (p: Vec2) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;

// Confere as regras que valem para qualquer caminho e devolve o custo total (1 reto, √2 diagonal).
function checkPath(grid: CollisionGrid, from: Vec2, path: Vec2[]): number {
  let [col, row] = tile(from);
  let cost = 0;
  for (const step of path) {
    const [c, r] = tile(step);
    const dc = c - col;
    const dr = r - row;
    expect(Math.abs(dc) <= 1 && Math.abs(dr) <= 1 && (dc !== 0 || dr !== 0)).toBe(true);
    expect(isSolid(grid, c, r)).toBe(false);
    if (dc !== 0 && dr !== 0) {
      expect(isSolid(grid, col + dc, row) || isSolid(grid, col, row + dr)).toBe(false);
      cost += Math.SQRT2;
    } else {
      cost += 1;
    }
    expect(step).toEqual(center(c, r));
    [col, row] = [c, r];
  }
  return cost;
}

describe("findPath", () => {
  it("em linha reta, passa pelos centros dos tiles", () => {
    const grid = gridFrom(["....."]);
    expect(findPath(grid, center(0, 0), center(3, 0))).toEqual([center(1, 0), center(2, 0), center(3, 0)]);
  });

  it("usa diagonal quando está livre", () => {
    const grid = gridFrom(["...", "...", "..."]);
    expect(findPath(grid, center(0, 0), center(2, 2))).toEqual([center(1, 1), center(2, 2)]);
  });

  it("não corta quina: com parede ao lado, a diagonal vira dois passos retos", () => {
    const grid = gridFrom([".#", ".."]);
    expect(findPath(grid, center(0, 0), center(1, 1))).toEqual([center(0, 1), center(1, 1)]);
  });

  it("já no destino (mesmo tile), caminho vazio", () => {
    const grid = gridFrom(["..."]);
    expect(findPath(grid, { x: 5, y: 5 }, { x: 25, y: 20 })).toEqual([]);
  });

  it("contorna parede pelo caminho mais curto", () => {
    const grid = gridFrom([
      ".......",
      "...#...",
      "...#...",
      "...#...",
      ".......",
    ]);
    const from = center(1, 2);
    const path = findPath(grid, from, center(5, 2));
    expect(path).toBeDefined();
    // Mínimo possível sem cortar quina: chegar ao lado da ponta da parede (1 + √2), passar por ela andando reto
    // (2 passos: as diagonais ali cortariam a quina) e descer do outro lado (1 + √2) = 4 + 2√2.
    expect(checkPath(grid, from, path as Vec2[])).toBeCloseTo(4 + 2 * Math.SQRT2);
    expect(path?.at(-1)).toEqual(center(5, 2));
  });

  it("de uma sala para outra pela porta de 1 tile", () => {
    const grid = gridFrom([
      "#########",
      "#...#...#",
      "#.......#",
      "#...#...#",
      "#########",
    ]);
    const from = center(1, 1);
    const path = findPath(grid, from, center(7, 3));
    expect(path).toBeDefined();
    checkPath(grid, from, path as Vec2[]);
    expect(path).toContainEqual(center(4, 2));
  });

  it("sala fechada: sem caminho", () => {
    const grid = gridFrom(["..#..", "..#..", "..#.."]);
    expect(findPath(grid, center(0, 1), center(4, 1))).toBeUndefined();
  });

  it("destino dentro de parede: sem caminho", () => {
    const grid = gridFrom(["..#"]);
    expect(findPath(grid, center(0, 0), center(2, 0))).toBeUndefined();
  });

  it("no mapa de teste inteiro (40×30), cruza salas e respeita todas as regras", () => {
    const rows = Array.from({ length: 30 }, (_, r) =>
      Array.from({ length: 40 }, (_, c) => {
        const border = r === 0 || r === 29 || c === 0 || c === 39;
        const middle = r === 14 && c !== 6 && c !== 30 && c !== 31;
        const top = c === 20 && r < 14 && r !== 5 && r !== 6;
        const bottom = c === 26 && r > 14 && r !== 22;
        return border || middle || top || bottom ? "#" : ".";
      }).join(""),
    );
    const grid = gridFrom(rows);
    const from = center(2, 2);
    const path = findPath(grid, from, center(36, 26));
    expect(path).toBeDefined();
    checkPath(grid, from, path as Vec2[]);
  });
});
