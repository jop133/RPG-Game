import { LIGHT_RADIUS, VIEW_HYSTERESIS, type LightKind } from "./balance";
import { type CollisionGrid, isSolid } from "./collision";
import type { Vec2 } from "./movement";

const TIE = 1e-9;

function firstCrossing(position: number, step: number, cell: number, delta: number, tileSize: number): number {
  if (step > 0) return ((cell + 1) * tileSize - position) / delta;
  if (step < 0) return (cell * tileSize - position) / delta;
  return Number.POSITIVE_INFINITY;
}

// Até onde a luz (ou a vista) vai de `from` rumo a `to` antes da primeira parede: a fração do segmento (0 a 1; 1 =
// chegou a `to`). Percorre os tiles que o segmento cruza (Amanatides & Woo), como hasLineOfSight, com duas diferenças:
// o tile de onde a luz sai não a bloqueia (tochas, minério e braseiros ficam dentro do tile da parede ou do objeto) e
// devolve onde ela parou, para o cliente desenhar o leque de luz. Passando exato pela quina entre dois tiles, para se
// qualquer um dos vizinhos for parede (a regra do pathfinding).
export function lightReach(grid: CollisionGrid, from: Vec2, to: Vec2): number {
  const ts = grid.tileSize;
  let col = Math.floor(from.x / ts);
  let row = Math.floor(from.y / ts);
  const endCol = Math.floor(to.x / ts);
  const endRow = Math.floor(to.y / ts);
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
    let t: number;
    if (Math.abs(tMaxX - tMaxY) < TIE) {
      t = tMaxX;
      if (isSolid(grid, col + stepX, row) || isSolid(grid, col, row + stepY)) return t;
      col += stepX;
      row += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      t = tMaxX;
      col += stepX;
      tMaxX += tDeltaX;
    } else {
      t = tMaxY;
      row += stepY;
      tMaxY += tDeltaY;
    }
    if (isSolid(grid, col, row)) return t;
  }
  return 1;
}

// A luz (ou a vista) de `from` chega a `to` sem parede no meio.
export function lightReaches(grid: CollisionGrid, from: Vec2, to: Vec2): boolean {
  return lightReach(grid, from, to) >= 1;
}

// Algo que ilumina um círculo: luz do mapa, saída ativa ou jogador.
export interface LightSource extends Vec2 {
  radius: number;
}

// Luz fixa de um andar, por tile: se o centro do tile está dentro de alguma luz que não se mexe (luzes do mapa,
// saídas ativas). Calculada uma vez por sala; consultar é só olhar a célula.
export interface LitMap {
  width: number;
  height: number;
  tileSize: number;
  cells: boolean[];
}

// Raio de um tipo de luz da camada "luzes"; undefined se o tipo não existe em LIGHT_RADIUS.
export function lightRadius(kind: string): number | undefined {
  return Object.hasOwn(LIGHT_RADIUS, kind) ? LIGHT_RADIUS[kind as LightKind] : undefined;
}

// Com `grid`, a parede corta a luz: o tile só acende se a luz chega ao centro dele (lightReaches).
export function staticLitMap(
  lights: readonly LightSource[],
  width: number,
  height: number,
  tileSize: number,
  grid?: CollisionGrid,
): LitMap {
  const cells = new Array<boolean>(width * height).fill(false);
  for (const light of lights) {
    const col0 = Math.max(0, Math.floor((light.x - light.radius) / tileSize));
    const col1 = Math.min(width - 1, Math.floor((light.x + light.radius) / tileSize));
    const row0 = Math.max(0, Math.floor((light.y - light.radius) / tileSize));
    const row1 = Math.min(height - 1, Math.floor((light.y + light.radius) / tileSize));
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const dx = (col + 0.5) * tileSize - light.x;
        const dy = (row + 0.5) * tileSize - light.y;
        if (cells[row * width + col] || dx * dx + dy * dy > light.radius * light.radius) continue;
        if (!grid || lightReaches(grid, light, { x: (col + 0.5) * tileSize, y: (row + 0.5) * tileSize })) cells[row * width + col] = true;
      }
    }
  }
  return { width, height, tileSize, cells };
}

// Quem carrega luz (os jogadores) e até onde ela vai (a Percepção de cada um).
export interface LightCarrier extends Vec2 {
  radius: number;
}

// Escuridão (regra 4): um ponto está iluminado se cai num tile de luz fixa ou está perto de quem carrega luz
// (os jogadores). Quem já está sendo visto ganha a folga de VIEW_HYSTERESIS na luz dos jogadores, para não piscar
// na borda dela. Com `grid`, a luz de quem carrega não atravessa parede.
export function isLit(p: Vec2, lit: LitMap, carriers: readonly LightCarrier[], currentlySeen: boolean, grid?: CollisionGrid): boolean {
  const col = Math.floor(p.x / lit.tileSize);
  const row = Math.floor(p.y / lit.tileSize);
  if (col >= 0 && row >= 0 && col < lit.width && row < lit.height && lit.cells[row * lit.width + col]) return true;
  return carriers.some((c) => {
    const limit = currentlySeen ? c.radius + VIEW_HYSTERESIS : c.radius;
    if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > limit * limit) return false;
    return !grid || lightReaches(grid, c, p);
  });
}
