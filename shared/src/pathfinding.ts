import { type CollisionGrid, isSolid } from "./collision";
import type { Vec2 } from "./movement";

const DIAGONAL_COST = Math.SQRT2;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

// Fila de prioridade mínima (heap binário) de índices de tile, ordenada pelo custo estimado.
class MinHeap {
  private items: { index: number; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(index: number, priority: number) {
    this.items.push({ index, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.at(parent).priority <= this.at(i).priority) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.at(0).index;
    const last = this.items.pop() as { index: number; priority: number };
    if (this.items.length === 0) return top;
    this.items[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.items.length && this.at(left).priority < this.at(smallest).priority) smallest = left;
      if (right < this.items.length && this.at(right).priority < this.at(smallest).priority) smallest = right;
      if (smallest === i) return top;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private at(i: number) {
    return this.items[i] as { index: number; priority: number };
  }

  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.at(b), this.at(a)];
  }
}

// Distância "octil": a menor possível andando em 8 direções. Nunca superestima, então o A* acha o caminho mais curto.
function octile(dc: number, dr: number): number {
  const a = Math.abs(dc);
  const b = Math.abs(dr);
  return Math.max(a, b) + (DIAGONAL_COST - 1) * Math.min(a, b);
}

// Diagonal só se os dois vizinhos retos estiverem livres: não corta quina de parede.
function canStep(grid: CollisionGrid, col: number, row: number, dc: number, dr: number): boolean {
  if (isSolid(grid, col + dc, row + dr)) return false;
  if (dc === 0 || dr === 0) return true;
  return !isSolid(grid, col + dc, row) && !isSolid(grid, col, row + dr);
}

function tileOf(grid: CollisionGrid, p: Vec2): [number, number] {
  return [Math.floor(p.x / grid.tileSize), Math.floor(p.y / grid.tileSize)];
}

function centerOf(grid: CollisionGrid, index: number): Vec2 {
  const col = index % grid.width;
  const row = Math.floor(index / grid.width);
  return { x: (col + 0.5) * grid.tileSize, y: (row + 0.5) * grid.tileSize };
}

// Caminho mais curto (A*) do tile de `from` até o tile de `to`, em 8 direções.
// Devolve os centros dos tiles a percorrer, sem o tile de partida; [] se já está lá; undefined se não há caminho.
export function findPath(grid: CollisionGrid, from: Vec2, to: Vec2): Vec2[] | undefined {
  const [startCol, startRow] = tileOf(grid, from);
  const [goalCol, goalRow] = tileOf(grid, to);
  if (isSolid(grid, startCol, startRow) || isSolid(grid, goalCol, goalRow)) return undefined;

  const start = startRow * grid.width + startCol;
  const goal = goalRow * grid.width + goalCol;
  const cost = new Float64Array(grid.width * grid.height).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(grid.width * grid.height).fill(-1);
  const open = new MinHeap();
  cost[start] = 0;
  open.push(start, octile(goalCol - startCol, goalRow - startRow));

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) return reconstruct(grid, cameFrom, start, goal);
    const col = current % grid.width;
    const row = Math.floor(current / grid.width);
    for (const [dc, dr] of NEIGHBORS) {
      if (!canStep(grid, col, row, dc, dr)) continue;
      const next = (row + dr) * grid.width + (col + dc);
      const nextCost = (cost[current] ?? 0) + (dc !== 0 && dr !== 0 ? DIAGONAL_COST : 1);
      if (nextCost >= (cost[next] ?? Number.POSITIVE_INFINITY)) continue;
      cost[next] = nextCost;
      cameFrom[next] = current;
      open.push(next, nextCost + octile(goalCol - (col + dc), goalRow - (row + dr)));
    }
  }
  return undefined;
}

function reconstruct(grid: CollisionGrid, cameFrom: Int32Array, start: number, goal: number): Vec2[] {
  const path: Vec2[] = [];
  for (let at = goal; at !== start; at = cameFrom[at] ?? start) path.push(centerOf(grid, at));
  return path.reverse();
}
