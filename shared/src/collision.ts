import type { Vec2 } from "./movement";

export interface CollisionGrid {
  width: number;
  height: number;
  tileSize: number;
  solid: readonly boolean[];
}

// Evita que uma borda exatamente na divisa entre dois tiles conte como dentro do tile seguinte.
const EPSILON = 1e-6;

// Fora do mapa conta como parede: ninguém sai dos limites.
export function isSolid(grid: CollisionGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return true;
  return grid.solid[row * grid.width + col] === true;
}

// Primeira e última célula que uma caixa (centro ± half) ocupa num eixo.
function cellSpan(center: number, half: number, tileSize: number): [number, number] {
  return [Math.floor((center - half) / tileSize), Math.floor((center + half - EPSILON) / tileSize)];
}

// Avança o centro ao longo de um eixo até a borda da frente encostar na primeira célula bloqueada.
function sweep(
  center: number,
  delta: number,
  half: number,
  tileSize: number,
  blocked: (cell: number) => boolean,
): number {
  if (delta > 0) {
    const edge = center + half;
    const last = Math.floor((edge + delta - EPSILON) / tileSize);
    for (let cell = Math.floor((edge - EPSILON) / tileSize) + 1; cell <= last; cell++) {
      if (blocked(cell)) return cell * tileSize - half;
    }
  }
  if (delta < 0) {
    const edge = center - half;
    const last = Math.floor((edge + delta) / tileSize);
    for (let cell = Math.floor(edge / tileSize) - 1; cell >= last; cell--) {
      if (blocked(cell)) return (cell + 1) * tileSize + half;
    }
  }
  return center + delta;
}

function anySolidInColumn(grid: CollisionGrid, col: number, rows: [number, number]): boolean {
  for (let row = rows[0]; row <= rows[1]; row++) if (isSolid(grid, col, row)) return true;
  return false;
}

function anySolidInRow(grid: CollisionGrid, row: number, cols: [number, number]): boolean {
  for (let col = cols[0]; col <= cols[1]; col++) if (isSolid(grid, col, row)) return true;
  return false;
}

// Move um eixo por vez (X, depois Y). Bater numa parede trava só aquele eixo, então o jogador desliza.
export function moveWithCollision(grid: CollisionGrid, position: Vec2, delta: Vec2, half: number): Vec2 {
  const ts = grid.tileSize;
  const rows = cellSpan(position.y, half, ts);
  const x = sweep(position.x, delta.x, half, ts, (col) => anySolidInColumn(grid, col, rows));
  const cols = cellSpan(x, half, ts);
  const y = sweep(position.y, delta.y, half, ts, (row) => anySolidInRow(grid, row, cols));
  return { x, y };
}
