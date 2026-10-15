import type { Area, Rect } from "./areas";
import type { CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

// Só os campos do JSON do Tiled que o jogo lê.
export interface TiledProperty {
  name: string;
  value: unknown;
}

export interface TiledTile {
  id: number;
  properties?: TiledProperty[];
  // Só em coleção de imagens (cada tile é uma imagem de qualquer tamanho, usada como objeto: casa, poste...).
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  // Retângulos de colisão desenhados no tile (editor de colisão do Tiled), a partir do canto de cima da imagem.
  objectgroup?: { objects: TiledObject[] };
}

export interface TiledTileset {
  firstgid: number;
  name?: string;
  // Folha de tiles: uma imagem só. Coleção de imagens não tem: cada tile traz a sua.
  image?: string;
  tiles?: TiledTile[];
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
export const GID_MASK = 0x1fffffff;

function isSolidTile(tile: TiledTile | undefined): boolean {
  return tile?.properties?.some((p) => p.name === "solid" && p.value === true) ?? false;
}

function solidGids(tilesets: TiledTileset[]): Set<number> {
  const gids = new Set<number>();
  for (const tileset of tilesets) {
    for (const tile of tileset.tiles ?? []) {
      if (isSolidTile(tile)) gids.add(tileset.firstgid + tile.id);
    }
  }
  return gids;
}

function tileForGid(tilesets: TiledTileset[], gid: number): TiledTile | undefined {
  const tileset = tilesets.filter((t) => t.firstgid <= gid).sort((a, b) => b.firstgid - a.firstgid)[0];
  return tileset?.tiles?.find((tile) => tile.id === gid - tileset.firstgid);
}

// Área que bloqueia de cada objeto de tile (com gid) cujo tile tem `solid`, em pixels do mundo.
// No Tiled (mapa ortogonal), x,y de um objeto de tile é o canto de BAIXO-esquerdo da imagem.
// Usa os retângulos de colisão do tile (escalados se o objeto foi redimensionado); sem retângulo, o objeto inteiro.
export function parseObjectFootprints(map: TiledMap): Rect[] {
  const rects: Rect[] = [];
  for (const layer of map.layers) {
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects ?? []) {
      if (object.gid === undefined) continue;
      const tile = tileForGid(map.tilesets, object.gid & GID_MASK);
      if (!isSolidTile(tile)) continue;
      const width = object.width ?? tile?.imagewidth ?? 0;
      const height = object.height ?? tile?.imageheight ?? 0;
      const sx = tile?.imagewidth ? width / tile.imagewidth : 1;
      const sy = tile?.imageheight ? height / tile.imageheight : 1;
      const top = object.y - height;
      const shapes = tile?.objectgroup?.objects.filter(isRectangle) ?? [];
      if (shapes.length === 0) rects.push({ x: object.x, y: top, width, height });
      for (const shape of shapes) {
        rects.push({
          x: object.x + shape.x * sx,
          y: top + shape.y * sy,
          width: (shape.width ?? 0) * sx,
          height: (shape.height ?? 0) * sy,
        });
      }
    }
  }
  return rects;
}

// Células cujo centro está dentro do intervalo [start, start + length). Se nenhum centro cair dentro
// (retângulo mais fino que uma célula, como a base de um poste), a célula do meio do intervalo.
function cellSpanOf(start: number, length: number, size: number, count: number): [number, number] {
  let first = Math.ceil(start / size - 0.5);
  let last = Math.ceil((start + length) / size - 0.5) - 1;
  if (first > last) first = last = Math.floor((start + length / 2) / size);
  return [Math.max(0, first), Math.min(count - 1, last)];
}

function markRects(solid: boolean[], map: TiledMap, rects: Rect[]) {
  for (const rect of rects) {
    const [col0, col1] = cellSpanOf(rect.x, rect.width, map.tilewidth, map.width);
    const [row0, row1] = cellSpanOf(rect.y, rect.height, map.tilewidth, map.height);
    for (let row = row0; row <= row1; row++) for (let col = col0; col <= col1; col++) solid[row * map.width + col] = true;
  }
}

function layerData(layer: TiledLayer): number[] {
  if (typeof layer.data === "string") {
    throw new Error(`Camada "${layer.name}" está comprimida. No Tiled, use formato de camada CSV.`);
  }
  return layer.data ?? [];
}

// Uma célula é parede se qualquer camada de tiles tiver ali um tile com a propriedade `solid`,
// ou se a área de colisão de um objeto sólido (casa, poste...) cobrir o centro dela.
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
  markRects(solid, map, parseObjectFootprints(map));
  return { width: map.width, height: map.height, tileSize: map.tilewidth, solid };
}

export const SPAWN_LAYER = "spawns";
export const AREA_LAYER = "areas";
export const EXIT_LAYER = "exits";
export const PORTAL_LAYER = "portal";
export const LIGHT_LAYER = "luzes";
export const INTERACTION_LAYER = "interacoes";

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

// Portais da cidade para o labirinto: pontos na camada "portal".
export function parsePortalPoints(map: TiledMap): Vec2[] {
  return pointsIn(map, PORTAL_LAYER);
}

// Pontos que precisam de nome; `meaning` diz no erro o que o nome é.
function namedPointsIn(map: TiledMap, layerName: string, meaning: string): (Vec2 & { name: string })[] {
  const objects = objectsIn(map, layerName);
  return pointsIn(map, layerName).map((point, i) => {
    const name = objects[i]?.name;
    if (!name) throw new Error(`Ponto ${objects[i]?.id} na camada "${layerName}" está sem nome (o nome é ${meaning}).`);
    return { name, ...point };
  });
}

// Luzes do mapa: pontos na camada "luzes", com o tipo da luz no nome (o raio de cada tipo fica em LIGHT_RADIUS).
export function parseLights(map: TiledMap): (Vec2 & { kind: string })[] {
  return namedPointsIn(map, LIGHT_LAYER, "o tipo da luz").map(({ name, x, y }) => ({ kind: name, x, y }));
}

// Portas dos prédios da cidade: pontos na camada "interacoes", com o id do prédio no nome (guild, inn, blacksmith).
// Quem confere se o id existe é o carregador da cidade (server/src/level.ts).
export function parseInteractionPoints(map: TiledMap): (Vec2 & { name: string })[] {
  return namedPointsIn(map, INTERACTION_LAYER, "o id do prédio");
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
