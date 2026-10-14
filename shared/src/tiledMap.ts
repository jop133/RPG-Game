import type { Area, Rect } from "./areas";
import type { CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

// Só os campos do JSON do Tiled que o jogo lê.
export interface TiledProperty {
  name: string;
  value: unknown;
}

export interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

export interface TiledObject {
  id: number;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  ellipse?: boolean;
  polygon?: unknown;
  polyline?: unknown;
  text?: unknown;
  gid?: number;
}

export interface TiledLayer {
  type: string;
  name: string;
  data?: number[] | string;
  objects?: TiledObject[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

// Os 3 bits mais altos do gid guardam espelhamento/rotação do tile, não a identidade dele.
const GID_MASK = 0x1fffffff;

function solidGids(tilesets: TiledTileset[]): Set<number> {
  const gids = new Set<number>();
  for (const tileset of tilesets) {
    for (const tile of tileset.tiles ?? []) {
      const solid = tile.properties?.some((p) => p.name === "solid" && p.value === true);
      if (solid) gids.add(tileset.firstgid + tile.id);
    }
  }
  return gids;
}

function layerData(layer: TiledLayer): number[] {
  if (typeof layer.data === "string") {
    throw new Error(`Camada "${layer.name}" está comprimida. No Tiled, use formato de camada CSV.`);
  }
  return layer.data ?? [];
}

// Uma célula é parede se qualquer camada de tiles tiver ali um tile com a propriedade `solid`.
export function parseCollisionGrid(map: TiledMap): CollisionGrid {
  if (map.tilewidth !== map.tileheight) {
    throw new Error(`Tiles precisam ser quadrados (mapa tem ${map.tilewidth}x${map.tileheight}).`);
  }
  const gids = solidGids(map.tilesets);
  const solid = new Array<boolean>(map.width * map.height).fill(false);
  for (const layer of map.layers) {
    if (layer.type !== "tilelayer") continue;
    layerData(layer).forEach((gid, index) => {
      if (gids.has(gid & GID_MASK)) solid[index] = true;
    });
  }
  return { width: map.width, height: map.height, tileSize: map.tilewidth, solid };
}

export const SPAWN_LAYER = "spawns";
export const AREA_LAYER = "areas";
export const EXIT_LAYER = "exits";

function objectsIn(map: TiledMap, layerName: string): TiledObject[] {
  const layer = map.layers.find((l) => l.type === "objectgroup" && l.name === layerName);
  return layer?.objects ?? [];
}

function pointsIn(map: TiledMap, layerName: string): Vec2[] {
  return objectsIn(map, layerName).map((object) => {
    if (object.point !== true) {
      throw new Error(`Objeto ${object.id} na camada "${layerName}" não é um ponto. Use a ferramenta "Insert Point".`);
    }
    return { x: object.x, y: object.y };
  });
}

// Pontos de entrada: objetos do tipo ponto na camada de objetos "spawns".
export function parseSpawnPoints(map: TiledMap): Vec2[] {
  return pointsIn(map, SPAWN_LAYER);
}

// Candidatos a portal de saída: pontos na camada "exits". Alguns são sorteados como ativos em cada run.
export function parseExitPoints(map: TiledMap): Vec2[] {
  return pointsIn(map, EXIT_LAYER);
}

// No JSON do Tiled, ponto, elipse, polígono, texto e tile também têm x/y; retângulo é o que não tem marca nenhuma.
function isRectangle(object: TiledObject): boolean {
  const marked = object.point || object.ellipse || object.polygon || object.polyline || object.text || object.gid;
  return !marked && (object.width ?? 0) > 0 && (object.height ?? 0) > 0;
}

function toRect(object: TiledObject): Rect {
  return { x: object.x, y: object.y, width: object.width ?? 0, height: object.height ?? 0 };
}

// Áreas: retângulos com nome na camada "areas". Retângulos de mesmo nome formam uma área só.
export function parseAreas(map: TiledMap): Area[] {
  const byName = new Map<string, Rect[]>();
  for (const object of objectsIn(map, AREA_LAYER)) {
    if (!isRectangle(object)) {
      throw new Error(`Objeto ${object.id} na camada "${AREA_LAYER}" não é um retângulo. Use a ferramenta "Insert Rectangle".`);
    }
    if (!object.name) throw new Error(`Retângulo ${object.id} na camada "${AREA_LAYER}" está sem nome.`);
    byName.set(object.name, [...(byName.get(object.name) ?? []), toRect(object)]);
  }
  return [...byName].map(([name, rects]) => ({ name, rects }));
}
