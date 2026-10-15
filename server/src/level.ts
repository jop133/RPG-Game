import { readFileSync } from "node:fs";
import {
  AREAS,
  EXIT_LAYER,
  MOB_KINDS,
  PLAYER_SIZE,
  PORTAL_LAYER,
  SPAWN_LAYER,
  areaFloorCells,
  boxFits,
  entrySpawnPoints,
  lightRadius,
  parseAreas,
  parseCollisionGrid,
  parseExitPoints,
  parseLights,
  parsePortalPoints,
  parseSpawnPoints,
  validateAreas,
  type Area,
  type CollisionGrid,
  type LightSource,
  type TiledMap,
  type Vec2,
} from "shared";

export interface Level {
  grid: CollisionGrid;
  areas: Area[];
  playerEntryPoints: Vec2[];
  // Tiles de chão de cada área, por nome: de onde os mobs são sorteados.
  floorCells: Map<string, Vec2[]>;
  // Candidatos a portal de saída; os ativos são sorteados por sala (run).
  exitCandidates: Vec2[];
  // Luzes do mapa (camada "luzes"), já com o raio do tipo: o que elas iluminam, os jogadores enxergam (regra 4).
  lights: LightSource[];
}

export interface City {
  grid: CollisionGrid;
  spawnPoints: Vec2[];
  // Portais para o labirinto.
  portals: Vec2[];
}

function readMap(file: URL): TiledMap {
  return JSON.parse(readFileSync(file, "utf8")) as TiledMap;
}

// Qualquer erro de mapa aparece ao subir o servidor, não no meio de uma run.
export function loadLevel(file: URL): Level {
  const map = readMap(file);
  const grid = parseCollisionGrid(map);
  const areas = parseAreas(map);
  const spawnPoints = parseSpawnPoints(map);
  const exitCandidates = parseExitPoints(map);
  const mapLights = parseLights(map);
  const floorCells = new Map(areas.map((area) => [area.name, areaFloorCells(area, grid)]));

  const errors = [
    ...validateAreas(areas, AREAS, spawnPoints),
    ...spawnErrors(grid, spawnPoints),
    ...mobErrors(grid, floorCells),
    ...exitErrors(grid, exitCandidates),
    ...lightErrors(mapLights),
  ];
  const playerEntryPoints = entrySpawnPoints(spawnPoints, areas, AREAS);
  if (spawnPoints.length > 0 && playerEntryPoints.length === 0) {
    errors.push("Nenhum ponto de spawn está numa área com playerEntry: true. Ninguém conseguiria entrar.");
  }
  if (errors.length > 0) throw new Error(`Mapa inválido (${file.pathname}):\n- ${errors.join("\n- ")}`);

  const lights = mapLights.map(({ kind, x, y }) => ({ x, y, radius: lightRadius(kind) ?? 0 }));
  return { grid, areas, playerEntryPoints, floorCells, exitCandidates, lights };
}

// A cidade não tem áreas, mobs nem saídas: só onde se chega e os portais para o labirinto.
export function loadCity(file: URL): City {
  const map = readMap(file);
  const grid = parseCollisionGrid(map);
  const spawnPoints = parseSpawnPoints(map);
  const portals = parsePortalPoints(map);
  const errors = [...spawnErrors(grid, spawnPoints), ...portalErrors(grid, portals), ...lightErrors(parseLights(map))];
  if (errors.length > 0) throw new Error(`Mapa inválido (${file.pathname}):\n- ${errors.join("\n- ")}`);
  return { grid, spawnPoints, portals };
}

// Na cidade a luz é só desenho, mas um tipo errado no mapa é erro de digitação do mesmo jeito.
function lightErrors(lights: { kind: string; x: number; y: number }[]): string[] {
  return lights
    .filter((light) => lightRadius(light.kind) === undefined)
    .map((light) => `A luz "${light.kind}" em (${light.x}, ${light.y}) não existe em LIGHT_RADIUS (shared/src/balance.ts).`);
}

function portalErrors(grid: CollisionGrid, portals: Vec2[]): string[] {
  if (portals.length === 0) return [`A cidade não tem portal. Crie uma camada de objetos "${PORTAL_LAYER}" com pontos.`];
  return portals
    .filter((p) => !boxFits(grid, p, PLAYER_SIZE / 2))
    .map((p) => `O portal (${p.x}, ${p.y}) encosta em parede. O jogador não conseguiria ficar nele.`);
}

function exitErrors(grid: CollisionGrid, exits: Vec2[]): string[] {
  if (exits.length === 0) return [`O mapa não tem saídas. Crie uma camada de objetos "${EXIT_LAYER}" com pontos.`];
  return exits
    .filter((p) => !boxFits(grid, p, PLAYER_SIZE / 2))
    .map((p) => `A saída (${p.x}, ${p.y}) encosta em parede. O jogador não conseguiria ficar no portal.`);
}

function spawnErrors(grid: CollisionGrid, points: Vec2[]): string[] {
  if (points.length === 0) return [`O mapa não tem pontos de spawn. Crie uma camada de objetos "${SPAWN_LAYER}" com pontos.`];
  return points
    .filter((p) => !boxFits(grid, p, PLAYER_SIZE / 2))
    .map((p) => `O ponto de spawn (${p.x}, ${p.y}) encosta em parede. O jogador nasceria preso.`);
}

function mobErrors(grid: CollisionGrid, floorCells: Map<string, Vec2[]>): string[] {
  const errors = Object.entries(MOB_KINDS)
    .filter(([, stats]) => stats.size > grid.tileSize)
    .map(([kind, stats]) => `O mob "${kind}" tem ${stats.size} px, maior que o tile (${grid.tileSize} px).`);
  for (const [name, config] of Object.entries(AREAS)) {
    const wanted = Object.values(config.mobs).reduce((sum, n) => sum + (n ?? 0), 0);
    const available = floorCells.get(name)?.length ?? 0;
    if (wanted > available) errors.push(`A área "${name}" pede ${wanted} mobs, mas só tem ${available} tiles de chão.`);
  }
  return errors;
}
