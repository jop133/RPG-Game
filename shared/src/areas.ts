import type { MobKind } from "./balance";
import type { ZoneId } from "./zones";
import type { Vec2 } from "./movement";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Uma área pode ter vários retângulos: é assim que se desenha uma área de formato irregular.
export interface Area {
  name: string;
  rects: Rect[];
}

// Borda esquerda/de cima inclusa, direita/de baixo não: dois retângulos vizinhos não disputam o mesmo ponto.
export function rectContains(rect: Rect, p: Vec2): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
}

export function areaAt(areas: readonly Area[], p: Vec2): Area | undefined {
  return areas.find((area) => area.rects.some((rect) => rectContains(rect, p)));
}

// O que o jogo sabe de cada área além do formato. Os valores ficam em balance.ts (AREAS).
export interface AreaConfig {
  playerEntry: boolean;
  mobs: Partial<Record<MobKind, number>>;
  // Uma das 4 zonas hostis (ver ZONES em zones.ts): grupos táticos do povo dela e o efeito em quem entra.
  zone?: ZoneId;
}

// Mapa e configuração precisam concordar nos nomes. Devolve os problemas encontrados; lista vazia = ok.
export function validateAreas(
  areas: readonly Area[],
  configs: Readonly<Record<string, AreaConfig>>,
  spawnPoints: readonly Vec2[],
): string[] {
  const inMap = new Set(areas.map((a) => a.name));
  const errors: string[] = [];
  for (const name of inMap) {
    if (!configs[name]) errors.push(`A área "${name}" do mapa não está em AREAS (shared/src/balance.ts).`);
  }
  for (const name of Object.keys(configs)) {
    if (!inMap.has(name)) errors.push(`AREAS tem "${name}", mas o mapa não tem área com esse nome.`);
  }
  for (const p of spawnPoints) {
    if (!areaAt(areas, p)) errors.push(`O ponto de spawn (${p.x}, ${p.y}) está fora de qualquer área.`);
  }
  return errors;
}
