import { describe, expect, it } from "vitest";
import { type TiledMap, parseAreas, parseCollisionGrid, parseExitPoints, parseSpawnPoints } from "./tiledMap";

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

describe("parseSpawnPoints", () => {
  it("lê os pontos da camada 'spawns'", () => {
    const map = mapWith([
      {
        type: "objectgroup",
        name: "spawns",
        objects: [
          { id: 1, x: 10, y: 20, point: true },
          { id: 2, x: 30, y: 40, point: true },
        ],
      },
    ]);
    expect(parseSpawnPoints(map)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it("ignora pontos em outras camadas de objetos", () => {
    const map = mapWith([{ type: "objectgroup", name: "decor", objects: [{ id: 1, x: 10, y: 20, point: true }] }]);
    expect(parseSpawnPoints(map)).toEqual([]);
  });

  it("mapa sem camada 'spawns' devolve lista vazia", () => {
    expect(parseSpawnPoints(mapWith([]))).toEqual([]);
  });

  it("retângulo na camada 'spawns' dá erro dizendo qual objeto", () => {
    const map = mapWith([{ type: "objectgroup", name: "spawns", objects: [{ id: 7, x: 0, y: 0 }] }]);
    expect(() => parseSpawnPoints(map)).toThrow(/Objeto 7/);
  });
});

describe("parseAreas", () => {
  const areaLayer = (objects: TiledMap["layers"][number]["objects"]) =>
    mapWith([{ type: "objectgroup", name: "areas", objects }]);

  it("retângulos de mesmo nome viram uma área só", () => {
    const map = areaLayer([
      { id: 1, name: "salao", x: 0, y: 0, width: 10, height: 10 },
      { id: 2, name: "tuneis", x: 20, y: 0, width: 5, height: 5 },
      { id: 3, name: "salao", x: 0, y: 10, width: 10, height: 10 },
    ]);
    expect(parseAreas(map)).toEqual([
      {
        name: "salao",
        rects: [
          { x: 0, y: 0, width: 10, height: 10 },
          { x: 0, y: 10, width: 10, height: 10 },
        ],
      },
      { name: "tuneis", rects: [{ x: 20, y: 0, width: 5, height: 5 }] },
    ]);
  });

  it("mapa sem camada 'areas' não tem áreas", () => {
    expect(parseAreas(mapWith([]))).toEqual([]);
  });

  it("elipse, polígono ou ponto na camada dão erro dizendo qual objeto", () => {
    expect(() => parseAreas(areaLayer([{ id: 4, name: "a", x: 0, y: 0, width: 10, height: 10, ellipse: true }]))).toThrow(
      /Objeto 4/,
    );
    expect(() => parseAreas(areaLayer([{ id: 5, name: "a", x: 0, y: 0, polygon: [] }]))).toThrow(/Objeto 5/);
    expect(() => parseAreas(areaLayer([{ id: 6, name: "a", x: 0, y: 0, point: true }]))).toThrow(/Objeto 6/);
  });

  it("retângulo sem nome dá erro", () => {
    expect(() => parseAreas(areaLayer([{ id: 8, name: "", x: 0, y: 0, width: 10, height: 10 }]))).toThrow(/sem nome/);
  });
});

describe("parseExitPoints", () => {
  it("lê os pontos da camada 'exits', separada da de spawns", () => {
    const map = mapWith([
      { type: "objectgroup", name: "spawns", objects: [{ id: 1, x: 1, y: 1, point: true }] },
      { type: "objectgroup", name: "exits", objects: [{ id: 2, x: 50, y: 60, point: true }] },
    ]);
    expect(parseExitPoints(map)).toEqual([{ x: 50, y: 60 }]);
  });

  it("retângulo na camada 'exits' dá erro dizendo a camada e o objeto", () => {
    const map = mapWith([{ type: "objectgroup", name: "exits", objects: [{ id: 9, x: 0, y: 0 }] }]);
    expect(() => parseExitPoints(map)).toThrow(/Objeto 9 na camada "exits"/);
  });
});
