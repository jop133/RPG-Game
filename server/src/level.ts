import { readFileSync } from "node:fs";
import {
  AREAS,
  MOB_KINDS,
  PLAYER_SIZE,
  SPAWN_LAYER,
  areaFloorCells,
  boxFits,
  entrySpawnPoints,
  parseAreas,
  parseCollisionGrid,
  parseSpawnPoints,
  validateAreas,
  type Area,
  type CollisionGrid,
  type TiledMap,
  type Vec2,
} from "shared";

export interface Level {
  grid: CollisionGrid;
  areas: Area[];
  playerEntryPoints: Vec2[];
  // Tiles de chão de cada área, por nome: de onde os mobs são sorteados.
  floorCells: Map<string, Vec2[]>;
}

// Qualquer erro de mapa aparece ao subir o servidor, não no meio de uma run.
export function loadLevel(file: URL): Level {
  const map = JSON.parse(readFileSync(file, "utf8")) as TiledMap;
  const grid = parseCollisionGrid(map);
  const areas = parseAreas(map);
  const spawnPoints = parseSpawnPoints(map);
  const floorCells = new Map(areas.map((area) => [area.name, areaFloorCells(area, grid)]));

  const errors = [
    ...validateAreas(areas, AREAS, spawnPoints),
    ...spawnErrors(grid, spawnPoints),
    ...mobErrors(grid, floorCells),
  ];
  const playerEntryPoints = entrySpawnPoints(spawnPoints, areas, AREAS);
  if (spawnPoints.length > 0 && playerEntryPoints.length === 0) {
    errors.push("Nenhum ponto de spawn está numa área com playerEntry: true. Ninguém conseguiria entrar.");
  }
  if (errors.length > 0) throw new Error(`Mapa inválido (${file.pathname}):\n- ${errors.join("\n- ")}`);

  return { grid, areas, playerEntryPoints, floorCells };
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
