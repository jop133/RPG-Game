import { describe, expect, it } from "vitest";
import { type TiledMap, parseCollisionGrid } from "./tiledMap";

// Tileset com 3 tiles: id 0 chão, id 1 parede (solid), id 2 com solid=false.
function mapWith(layers: TiledMap["layers"], width = 3, height = 1): TiledMap {
  return {
    width,
    height,
    tilewidth: 32,
    tileheight: 32,
    layers,
    tilesets: [
      {
        firstgid: 1,
        tiles: [
          { id: 1, properties: [{ name: "solid", value: true }] },
          { id: 2, properties: [{ name: "solid", value: false }] },
        ],
      },
    ],
  };
}

describe("parseCollisionGrid", () => {
  it("tile com solid=true vira parede; chão e solid=false não", () => {
    // gid = firstgid + id  →  1 = chão, 2 = parede, 3 = solid=false
    const grid = parseCollisionGrid(mapWith([{ type: "tilelayer", name: "ground", data: [1, 2, 3] }]));
    expect(grid.solid).toEqual([false, true, false]);
    expect(grid.tileSize).toBe(32);
  });

  it("tile espelhado no Tiled continua sendo parede", () => {
    const FLIPPED_HORIZONTALLY = 0x80000000;
    const grid = parseCollisionGrid(
      mapWith([{ type: "tilelayer", name: "ground", data: [1, (2 | FLIPPED_HORIZONTALLY) >>> 0, 0] }]),
    );
    expect(grid.solid).toEqual([false, true, false]);
  });

  it("parede em qualquer camada de tiles conta", () => {
    const grid = parseCollisionGrid(
      mapWith([
        { type: "tilelayer", name: "ground", data: [1, 1, 1] },
        { type: "tilelayer", name: "decor", data: [0, 0, 2] },
      ]),
    );
    expect(grid.solid).toEqual([false, false, true]);
  });

  it("camadas de objetos são ignoradas", () => {
    const grid = parseCollisionGrid(
      mapWith([
        { type: "tilelayer", name: "ground", data: [1, 1, 1] },
        { type: "objectgroup", name: "spawns" },
      ]),
    );
    expect(grid.solid).toEqual([false, false, false]);
  });

  it("camada comprimida dá erro explicando o que fazer", () => {
    expect(() => parseCollisionGrid(mapWith([{ type: "tilelayer", name: "ground", data: "eJxjZGBgAAAABAAB" }]))).toThrow(
      /CSV/,
    );
  });

  it("tiles não quadrados dão erro", () => {
    expect(() => parseCollisionGrid({ ...mapWith([]), tileheight: 16 })).toThrow(/quadrados/);
  });
});
