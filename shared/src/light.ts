import { LIGHT_RADIUS, VIEW_HYSTERESIS, type LightKind } from "./balance";
import type { Vec2 } from "./movement";

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

export function staticLitMap(lights: readonly LightSource[], width: number, height: number, tileSize: number): LitMap {
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
        if (dx * dx + dy * dy <= light.radius * light.radius) cells[row * width + col] = true;
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
// na borda dela.
export function isLit(p: Vec2, lit: LitMap, carriers: readonly LightCarrier[], currentlySeen: boolean): boolean {
  const col = Math.floor(p.x / lit.tileSize);
  const row = Math.floor(p.y / lit.tileSize);
  if (col >= 0 && row >= 0 && col < lit.width && row < lit.height && lit.cells[row * lit.width + col]) return true;
  return carriers.some((c) => {
    const limit = currentlySeen ? c.radius + VIEW_HYSTERESIS : c.radius;
    return (c.x - p.x) ** 2 + (c.y - p.y) ** 2 <= limit * limit;
  });
}
