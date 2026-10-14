import { type CollisionGrid, isSolid } from "./collision";
import type { Vec2 } from "./movement";

const TIE = 1e-9;

function firstCrossing(position: number, step: number, cell: number, delta: number, tileSize: number): number {
  if (step > 0) return ((cell + 1) * tileSize - position) / delta;
  if (step < 0) return (cell * tileSize - position) / delta;
  return Number.POSITIVE_INFINITY;
}

// Percorre, em ordem, os tiles que o segmento from→to cruza (algoritmo de Amanatides & Woo).
// Passando exatamente pela quina entre tiles, conta como bloqueado se qualquer um dos dois vizinhos for parede:
// é a mesma regra do pathfinding, que não deixa cortar quina.
export function hasLineOfSight(grid: CollisionGrid, from: Vec2, to: Vec2): boolean {
  const ts = grid.tileSize;
  let col = Math.floor(from.x / ts);
  let row = Math.floor(from.y / ts);
  const endCol = Math.floor(to.x / ts);
  const endRow = Math.floor(to.y / ts);
  if (isSolid(grid, col, row)) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = stepX !== 0 ? ts / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const tDeltaY = stepY !== 0 ? ts / Math.abs(dy) : Number.POSITIVE_INFINITY;
  let tMaxX = firstCrossing(from.x, stepX, col, dx, ts);
  let tMaxY = firstCrossing(from.y, stepY, row, dy, ts);

  // Cada passo avança pelo menos um tile em direção ao fim; o limite só protege contra erro de arredondamento.
  const maxSteps = Math.abs(endCol - col) + Math.abs(endRow - row);
  for (let steps = 0; steps < maxSteps && (col !== endCol || row !== endRow); steps++) {
    if (Math.abs(tMaxX - tMaxY) < TIE) {
      if (isSolid(grid, col + stepX, row) || isSolid(grid, col, row + stepY)) return false;
      col += stepX;
      row += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      col += stepX;
      tMaxX += tDeltaX;
    } else {
      row += stepY;
      tMaxY += tDeltaY;
    }
    if (isSolid(grid, col, row)) return false;
  }
  return true;
}
