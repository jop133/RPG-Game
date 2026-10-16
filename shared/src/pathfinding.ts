import { PATHFIND_MAX_NODES } from "./balance";
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

// Fila de prioridade mínima (heap binário) de índices de tile, ordenada pelo custo estimado. Dois vetores paralelos
// de números: nada de objeto por entrada.
class MinHeap {
  private readonly indices: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.indices.length;
  }

  push(index: number, priority: number) {
    this.indices.push(index);
    this.priorities.push(priority);
    let i = this.indices.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priority(parent) <= this.priority(i)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.indices[0] as number;
    const lastIndex = this.indices.pop() as number;
    const lastPriority = this.priorities.pop() as number;
    if (this.indices.length === 0) return top;
    this.indices[0] = lastIndex;
    this.priorities[0] = lastPriority;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.size && this.priority(left) < this.priority(smallest)) smallest = left;
      if (right < this.size && this.priority(right) < this.priority(smallest)) smallest = right;
      if (smallest === i) return top;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private priority(i: number): number {
    return this.priorities[i] as number;
  }

  private swap(a: number, b: number) {
    [this.indices[a], this.indices[b]] = [this.indices[b] as number, this.indices[a] as number];
    [this.priorities[a], this.priorities[b]] = [this.priority(b), this.priority(a)];
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

// Caminho mais curto (A*) do tile de `from` até o tile de `to`, em 8 direções. Devolve os centros dos tiles a
// percorrer, sem o tile de partida; [] se já está lá; undefined se a partida ou o destino estão dentro de parede.
// Explora no máximo `maxNodes` tiles. Se acabar o limite (destino longe num andar grande) ou o destino estiver fora
// de alcance, devolve o caminho até o tile explorado mais perto do destino: quem segue anda na direção certa e pede
// o próximo trecho ao chegar. Se nenhum tile explorado for mais perto que a partida, devolve [].
export function findPath(grid: CollisionGrid, from: Vec2, to: Vec2, maxNodes = PATHFIND_MAX_NODES): Vec2[] | undefined {
  const [startCol, startRow] = tileOf(grid, from);
  const [goalCol, goalRow] = tileOf(grid, to);
  if (isSolid(grid, startCol, startRow) || isSolid(grid, goalCol, goalRow)) return undefined;

  const width = grid.width;
  const start = startRow * width + startCol;
  const goal = goalRow * width + goalCol;
  const toGoal = (index: number) => octile(goalCol - (index % width), goalRow - Math.floor(index / width));
  // Só os tiles que a busca tocou (no máximo alguns milhares), não o mapa inteiro: num andar 500x500, alocar e
  // preencher vetores de 250.000 posições a cada chamada custaria mais que a própria busca.
  const cost = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(start, toGoal(start));
  let best = start;
  let bestToGoal = toGoal(start);

  while (open.size > 0 && closed.size < maxNodes) {
    const current = open.pop();
    // Entrada velha na fila: este tile já foi explorado por um caminho mais barato.
    if (closed.has(current)) continue;
    if (current === goal) return reconstruct(grid, cameFrom, start, goal);
    closed.add(current);
    const currentCost = cost.get(current) ?? 0;
    const h = toGoal(current);
    if (h < bestToGoal || (h === bestToGoal && currentCost < (cost.get(best) ?? 0))) {
      best = current;
      bestToGoal = h;
    }
    const col = current % width;
    const row = Math.floor(current / width);
    for (const [dc, dr] of NEIGHBORS) {
      if (!canStep(grid, col, row, dc, dr)) continue;
      const next = (row + dr) * width + (col + dc);
      if (closed.has(next)) continue;
      const nextCost = currentCost + (dc !== 0 && dr !== 0 ? DIAGONAL_COST : 1);
      if (nextCost >= (cost.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(next, nextCost);
      cameFrom.set(next, current);
      open.push(next, nextCost + toGoal(next));
    }
  }
  return reconstruct(grid, cameFrom, start, best);
}

function reconstruct(grid: CollisionGrid, cameFrom: ReadonlyMap<number, number>, start: number, end: number): Vec2[] {
  const path: Vec2[] = [];
  for (let at = end; at !== start; at = cameFrom.get(at) ?? start) path.push(centerOf(grid, at));
  return path.reverse();
}
