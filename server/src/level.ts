import { readFileSync } from "node:fs";
import {
  AREAS,
  PLAYER_SIZE,
  SPAWN_LAYER,
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
}

// Qualquer erro de mapa aparece ao subir o servidor, não no meio de uma run.
export function loadLevel(file: URL): Level {
  const map = JSON.parse(readFileSync(file, "utf8")) as TiledMap;
  const grid = parseCollisionGrid(map);
  const areas = parseAreas(map);
  const spawnPoints = parseSpawnPoints(map);

  const errors = [...validateAreas(areas, AREAS, spawnPoints), ...spawnErrors(grid, spawnPoints)];
  const playerEntryPoints = entrySpawnPoints(spawnPoints, areas, AREAS);
  if (spawnPoints.length > 0 && playerEntryPoints.length === 0) {
    errors.push("Nenhum ponto de spawn está numa área com playerEntry: true. Ninguém conseguiria entrar.");
  }
  if (errors.length > 0) throw new Error(`Mapa inválido (${file.pathname}):\n- ${errors.join("\n- ")}`);

  return { grid, areas, playerEntryPoints };
}

function spawnErrors(grid: CollisionGrid, points: Vec2[]): string[] {
  if (points.length === 0) return [`O mapa não tem pontos de spawn. Crie uma camada de objetos "${SPAWN_LAYER}" com pontos.`];
  return points
    .filter((p) => !boxFits(grid, p, PLAYER_SIZE / 2))
    .map((p) => `O ponto de spawn (${p.x}, ${p.y}) encosta em parede. O jogador nasceria preso.`);
}
