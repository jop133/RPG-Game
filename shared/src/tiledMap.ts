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
  x: number;
  y: number;
  point?: boolean;
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

// Pontos de entrada: objetos do tipo ponto na camada de objetos "spawns".
export function parseSpawnPoints(map: TiledMap): Vec2[] {
  const layer = map.layers.find((l) => l.type === "objectgroup" && l.name === SPAWN_LAYER);
  return (layer?.objects ?? []).map((object) => {
    if (object.point !== true) {
      throw new Error(`Objeto ${object.id} na camada "${SPAWN_LAYER}" não é um ponto. Use a ferramenta "Insert Point".`);
    }
    return { x: object.x, y: object.y };
  });
}
