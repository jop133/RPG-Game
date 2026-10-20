import { readFileSync } from "node:fs";
import {
  AREAS,
  ARRIVAL_LAYER,
  BUILDINGS,
  INTERACTIONS,
  EXIT_LAYER,
  INTERACTION_LAYER,
  MOB_KINDS,
  PLAYER_SIZE,
  PORTAL_LAYER,
  SPAWN_LAYER,
  areaFloorCells,
  boxFits,
  entrySpawnPoints,
  isBuildingId,
  isInteractionId,
  lightRadius,
  parseAreas,
  parseCollisionGrid,
  parseExitPoints,
  parseArrivalPoints,
  parseInteractionPoints,
  parseLights,
  parsePortalPoints,
  parseSpawnPoints,
  validateAreas,
  zoneAt,
  type Area,
  type BuildingId,
  type InteractionPoint,
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
  // Luzes do mapa (camada "luzes"), já com o raio do tipo: o que elas iluminam, os jogadores enxergam (regra 4). Sem as
  // tochas da zona dos goblins, que começam apagadas (torches).
  lights: LightSource[];
  // Zonas hostis: as tochas e braseiros da zona dos goblins (apagados no começo de cada run), os cristais do mapa (os
  // gnomos andam entre eles), os cristais que dão descarga (os médios e grandes da zona dos gnomos) e as poças de lodo
  // ácido do mapa (objetos "poca-acida", pelo centro).
  torches: Vec2[];
  crystals: Vec2[];
  pulseCrystals: Vec2[];
  acidPools: Vec2[];
}

export interface City {
  grid: CollisionGrid;
  spawnPoints: Vec2[];
  // Portais para o labirinto.
  portals: Vec2[];
  // Portas da rua, portas de dentro e móveis com E (Guilda, Estalagem, Forja).
  interactions: InteractionPoint[];
  // Onde a porta da rua deixa o jogador, dentro de cada prédio; e a porta da rua de cada prédio (aonde a de dentro
  // leva de volta; a primeira, se o prédio tem mais de uma).
  arrivals: Record<BuildingId, Vec2>;
  streetDoors: Record<BuildingId, Vec2>;
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

  const zoneOf = (p: Vec2) => zoneAt(areas, AREAS, p);
  const isTorch = (light: { kind: string } & Vec2) => (light.kind === "tocha" || light.kind === "braseiro") && zoneOf(light) === "goblin";
  const point = ({ x, y }: Vec2) => ({ x, y });
  const lights = mapLights.filter((l) => !isTorch(l)).map(({ kind, x, y }) => ({ x, y, radius: lightRadius(kind) ?? 0 }));
  const torches = mapLights.filter(isTorch).map(point);
  const crystals = mapLights.filter((l) => l.kind.startsWith("cristal")).map(point);
  const pulseCrystals = mapLights.filter((l) => (l.kind === "cristal-medio" || l.kind === "cristal-grande") && zoneOf(l) === "gnomo").map(point);
  const acidPools = objectCenters(map, "poca-acida");
  return { grid, areas, playerEntryPoints, floorCells, exitCandidates, lights, torches, crystals, pulseCrystals, acidPools };
}

// Centro dos objetos de imagem com este nome (no Tiled, x e y são o canto de baixo à esquerda da imagem).
function objectCenters(map: TiledMap, name: string): Vec2[] {
  return map.layers
    .flatMap((layer) => (layer.type === "objectgroup" ? (layer.objects ?? []) : []))
    .filter((o) => o.name === name)
    .map((o) => ({ x: o.x + (o.width ?? 0) / 2, y: o.y - (o.height ?? 0) / 2 }));
}

// A cidade não tem áreas, mobs nem saídas: só onde se chega, os portais para o labirinto, as portas e os móveis dos
// prédios e as chegadas dentro deles.
export function loadCity(file: URL): City {
  const map = readMap(file);
  const grid = parseCollisionGrid(map);
  const spawnPoints = parseSpawnPoints(map);
  const portals = parsePortalPoints(map);
  const points = parseInteractionPoints(map);
  const arrivalPoints = parseArrivalPoints(map);
  const errors = [
    ...spawnErrors(grid, spawnPoints),
    ...portalErrors(grid, portals),
    ...lightErrors(parseLights(map)),
    ...interactionErrors(grid, points),
    ...arrivalErrors(grid, arrivalPoints),
  ];
  if (errors.length > 0) throw new Error(`Mapa inválido (${file.pathname}):\n- ${errors.join("\n- ")}`);
  const interactions = points.flatMap(({ name, x, y }) => (isInteractionId(name) ? [{ id: name, x, y }] : []));
  const pick = (list: (Vec2 & { name: string })[], id: BuildingId): Vec2 => {
    const found = list.find((p) => p.name === id) as Vec2;
    return { x: found.x, y: found.y };
  };
  const arrivals = Object.fromEntries(BUILDINGS.map((id) => [id, pick(arrivalPoints, id)])) as Record<BuildingId, Vec2>;
  const streetDoors = Object.fromEntries(BUILDINGS.map((id) => [id, pick(points, id)])) as Record<BuildingId, Vec2>;
  return { grid, spawnPoints, portals, interactions, arrivals, streetDoors };
}

// Todo ponto de INTERACTIONS precisa existir (porta da rua, porta de dentro e móveis de cada prédio); cada ponto, de
// um id conhecido e de lugar para o jogador.
function interactionErrors(grid: CollisionGrid, points: (Vec2 & { name: string })[]): string[] {
  const errors = INTERACTIONS.filter((id) => !points.some((p) => p.name === id)).map(
    (id) => `Falta o ponto "${id}". Crie um ponto com esse nome na camada "${INTERACTION_LAYER}".`,
  );
  for (const p of points) {
    if (!isInteractionId(p.name)) {
      errors.push(`O ponto "${p.name}" em (${p.x}, ${p.y}) não é conhecido (${INTERACTIONS.join(", ")}).`);
    } else if (!boxFits(grid, p, PLAYER_SIZE / 2)) {
      errors.push(`O ponto "${p.name}" (${p.x}, ${p.y}) encosta em parede. O jogador não conseguiria ficar nele.`);
    }
  }
  return errors;
}

// Cada prédio precisa de uma chegada de dentro, com lugar para o jogador.
function arrivalErrors(grid: CollisionGrid, points: (Vec2 & { name: string })[]): string[] {
  const errors = BUILDINGS.filter((id) => !points.some((p) => p.name === id)).map(
    (id) => `O prédio "${id}" não tem chegada. Crie um ponto com esse nome na camada "${ARRIVAL_LAYER}".`,
  );
  for (const p of points) {
    if (!isBuildingId(p.name)) errors.push(`A chegada "${p.name}" não é um prédio conhecido (${BUILDINGS.join(", ")}).`);
    else if (!boxFits(grid, p, PLAYER_SIZE / 2)) errors.push(`A chegada "${p.name}" (${p.x}, ${p.y}) encosta em parede.`);
  }
  return errors;
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
