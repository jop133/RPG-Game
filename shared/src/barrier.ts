import { ICE_BARRIER } from "./balance";
import { isSolid, type CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

// Barreira de Gelo (ICE_BARRIER): onde ela fica e o que ela bloqueia. Quem decide é o servidor (regra 1); o cliente só
// desenha a parede na direção que chega no estado.

// Onde a barreira fica: o centro (no meio de um tile), a direção dela (múltiplo de 45°, a da mira) e os tiles que ela
// ocupa (índices da grade, row * width + col), atravessados na direção.
export interface BarrierPlacement {
  center: Vec2;
  angle: number;
  cells: number[];
}

const EIGHTH = Math.PI / 4;
// Passo das amostras ao longo da parede, em px: menor que um tile, então nenhum tile do caminho fica de fora.
const SAMPLE_PX = 4;
// A parede é amostrada em duas linhas, uma de cada lado do meio (px): na diagonal, os tiles se tocam pelos lados, sem
// fresta de quina por onde um mob passaria.
const THICKNESS_PX = 5;

// A barreira de quem está em `caster` mirando `angle`. Sem lugar (o meio cai em parede): undefined. `occupied` diz se um
// tile já tem alguém (um mob) dentro: esse tile fica de fora, para ninguém ficar preso no gelo.
export function placeBarrier(caster: Vec2, angle: number, grid: CollisionGrid, occupied: (cell: number) => boolean = () => false): BarrierPlacement | undefined {
  const eighths = Math.round(angle / EIGHTH);
  const snapped = eighths * EIGHTH;
  const ts = grid.tileSize;
  const ahead = { x: caster.x + Math.cos(snapped) * ICE_BARRIER.distance, y: caster.y + Math.sin(snapped) * ICE_BARRIER.distance };
  const col = Math.floor(ahead.x / ts);
  const row = Math.floor(ahead.y / ts);
  if (isSolid(grid, col, row)) return undefined;
  const center = { x: (col + 0.5) * ts, y: (row + 0.5) * ts };
  // Ao longo da parede: perpendicular à mira. Na diagonal, a parede tem o mesmo número de tiles de comprimento (medido
  // na diagonal) que na reta.
  const along = { x: -Math.sin(snapped), y: Math.cos(snapped) };
  const across = { x: Math.cos(snapped), y: Math.sin(snapped) };
  const half = ((ICE_BARRIER.cells - 1) / 2) * ts * (eighths % 2 === 0 ? 1 : Math.SQRT2);
  const cells = new Set<number>();
  for (let d = -half; d <= half + 1e-9; d += SAMPLE_PX) {
    for (const side of [-THICKNESS_PX, THICKNESS_PX]) {
      const x = center.x + along.x * d + across.x * side;
      const y = center.y + along.y * d + across.y * side;
      const c = Math.floor(x / ts);
      const r = Math.floor(y / ts);
      if (isSolid(grid, c, r)) continue;
      const cell = r * grid.width + c;
      if (!occupied(cell)) cells.add(cell);
    }
  }
  return { center, angle: snapped, cells: [...cells] };
}

// A grade com estes tiles a mais como parede (a que os mobs usam enquanto houver barreira de pé).
export function withBlockedCells(grid: CollisionGrid, cells: Iterable<number>): CollisionGrid {
  const solid = [...grid.solid];
  for (const cell of cells) solid[cell] = true;
  return { ...grid, solid };
}

// O tile de um ponto (índice da grade).
export function cellOf(grid: CollisionGrid, point: Vec2): number {
  return Math.floor(point.y / grid.tileSize) * grid.width + Math.floor(point.x / grid.tileSize);
}

// O centro de um tile.
export function cellCenter(grid: CollisionGrid, cell: number): Vec2 {
  const ts = grid.tileSize;
  return { x: ((cell % grid.width) + 0.5) * ts, y: (Math.floor(cell / grid.width) + 0.5) * ts };
}
