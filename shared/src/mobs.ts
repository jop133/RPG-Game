import { type Area, rectContains } from "./areas";
import type { MobKind } from "./balance";
import { type CollisionGrid, isSolid } from "./collision";
import type { Vec2 } from "./movement";

export interface MobStats {
  size: number;
  speed: number;
}

export interface MobSpawn {
  kind: MobKind;
  position: Vec2;
}

// Centros dos tiles de chão cujo centro está dentro da área. Um mob nunca é maior que um tile,
// então qualquer um cabe centrado num tile de chão.
export function areaFloorCells(area: Area, grid: CollisionGrid): Vec2[] {
  const cells: Vec2[] = [];
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      if (isSolid(grid, col, row)) continue;
      const center = { x: (col + 0.5) * grid.tileSize, y: (row + 0.5) * grid.tileSize };
      if (area.rects.some((rect) => rectContains(rect, center))) cells.push(center);
    }
  }
  return cells;
}

// Um tile diferente para cada mob, sorteado. `random` devolve [0, 1); vem de fora para ser testável.
export function planMobSpawns(
  cells: readonly Vec2[],
  counts: Partial<Record<MobKind, number>>,
  random: () => number,
): MobSpawn[] {
  const kinds = Object.entries(counts).flatMap(([kind, n]) => Array<MobKind>(n ?? 0).fill(kind as MobKind));
  if (kinds.length > cells.length) {
    throw new Error(`${kinds.length} mobs não cabem em ${cells.length} tiles de chão.`);
  }
  const pool = [...cells];
  return kinds.map((kind) => {
    const index = Math.floor(random() * pool.length);
    const [position] = pool.splice(index, 1);
    return { kind, position: position as Vec2 };
  });
}
