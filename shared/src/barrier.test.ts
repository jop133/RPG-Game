import { describe, expect, it } from "vitest";
import { ICE_BARRIER } from "./balance";
import { cellOf, placeBarrier, withBlockedCells } from "./barrier";
import { isSolid, type CollisionGrid } from "./collision";

const TS = 32;
function openGrid(width = 20, height = 20): CollisionGrid {
  return { width, height, tileSize: TS, solid: Array.from({ length: width * height }, () => false) };
}
const caster = { x: 10 * TS + 16, y: 10 * TS + 16 };

describe("Barreira de Gelo: onde fica", () => {
  it("mirando para a direita: ICE_BARRIER.cells tiles numa coluna, à frente", () => {
    const grid = openGrid();
    const placed = placeBarrier(caster, 0.1, grid);
    expect(placed?.angle).toBe(0);
    const cols = new Set(placed?.cells.map((c) => c % grid.width));
    const rows = placed?.cells.map((c) => Math.floor(c / grid.width)).sort((a, b) => a - b);
    expect([...cols]).toEqual([Math.floor((caster.x + ICE_BARRIER.distance) / TS)]);
    expect(rows).toEqual([9, 10, 11]);
  });

  it("na diagonal, a parede não tem fresta de quina (tiles vizinhos pelos lados)", () => {
    const grid = openGrid();
    const placed = placeBarrier(caster, Math.PI / 4, grid);
    const cells = new Set(placed?.cells);
    for (const cell of cells) {
      const neighbours = [cell + 1, cell - 1, cell + grid.width, cell - grid.width].filter((n) => cells.has(n));
      expect(neighbours.length).toBeGreaterThan(0);
    }
  });

  it("não cai em parede, e tile com mob dentro fica de fora", () => {
    const grid = openGrid();
    const ahead = cellOf(grid, { x: caster.x + ICE_BARRIER.distance, y: caster.y });
    expect(placeBarrier(caster, 0, withBlockedCells(grid, [ahead]))).toBeUndefined();
    const placed = placeBarrier(caster, 0, grid, (cell) => cell === ahead);
    expect(placed?.cells).not.toContain(ahead);
    expect(placed?.cells.length).toBe(ICE_BARRIER.cells - 1);
  });

  it("withBlockedCells vira parede só na cópia", () => {
    const grid = openGrid();
    const blocked = withBlockedCells(grid, [5]);
    expect(isSolid(blocked, 5, 0)).toBe(true);
    expect(isSolid(grid, 5, 0)).toBe(false);
  });
});
