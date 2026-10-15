import { describe, expect, it } from "vitest";
import {
  type TiledMap,
  parseAreas,
  parseCollisionGrid,
  parseExitPoints,
  parseObjectFootprints,
  parsePortalPoints,
  parseSpawnPoints,
} from "./tiledMap";

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

describe("parsePortalPoints", () => {
  it("lê os pontos da camada 'portal'", () => {
    const map = mapWith([
      { type: "objectgroup", name: "spawns", objects: [{ id: 1, x: 1, y: 1, point: true }] },
      { type: "objectgroup", name: "portal", objects: [{ id: 2, x: 496, y: 80, point: true }] },
    ]);
    expect(parsePortalPoints(map)).toEqual([{ x: 496, y: 80 }]);
  });

  it("retângulo na camada 'portal' dá erro dizendo a camada e o objeto", () => {
    const map = mapWith([{ type: "objectgroup", name: "portal", objects: [{ id: 3, x: 0, y: 0 }] }]);
    expect(() => parsePortalPoints(map)).toThrow(/Objeto 3 na camada "portal"/);
  });
});

// Mapa 10x10 (tiles de 32) com uma coleção de imagens: tile 0 sólido com retângulo de colisão na base,
// tile 1 sem `solid`, tile 2 sólido sem retângulo, tile 3 sólido com base pequena (poste).
function objectMap(objects: TiledMap["layers"][number]["objects"]): TiledMap {
  return {
    width: 10,
    height: 10,
    tilewidth: 32,
    tileheight: 32,
    tilesets: [
      {
        firstgid: 1,
        tiles: [
          {
            id: 0,
            imagewidth: 128,
            imageheight: 160,
            properties: [{ name: "solid", value: true }],
            objectgroup: { objects: [{ id: 1, x: 0, y: 96, width: 128, height: 64 }] },
          },
          { id: 1, imagewidth: 64, imageheight: 64 },
          { id: 2, imagewidth: 64, imageheight: 64, properties: [{ name: "solid", value: true }] },
          {
            id: 3,
            imagewidth: 32,
            imageheight: 96,
            properties: [{ name: "solid", value: true }],
            objectgroup: { objects: [{ id: 1, x: 12, y: 86, width: 10, height: 8 }] },
          },
        ],
      },
    ],
    layers: [{ type: "objectgroup", name: "objetos", objects }],
  };
}
const solidCells = (map: TiledMap) =>
  parseCollisionGrid(map).solid.flatMap((s, i) => (s ? [`${i % 10},${Math.floor(i / 10)}`] : []));

describe("objetos sólidos (casas, enfeites)", () => {
  it("o retângulo de colisão do tile, a partir do canto de baixo do objeto, vira parede", () => {
    // Objeto 128x160 com base em y=288: imagem de y=128 a 288; colisão nas 64 px de baixo (y 224..288), x 32..160.
    const map = objectMap([{ id: 1, gid: 1, x: 32, y: 288, width: 128, height: 160 }]);
    expect(parseObjectFootprints(map)).toEqual([{ x: 32, y: 224, width: 128, height: 64 }]);
    expect(solidCells(map)).toEqual(["1,7", "2,7", "3,7", "4,7", "1,8", "2,8", "3,8", "4,8"]);
  });

  it("tile sem solid não bloqueia, mesmo sendo objeto", () => {
    expect(solidCells(objectMap([{ id: 1, gid: 2, x: 64, y: 128, width: 64, height: 64 }]))).toEqual([]);
  });

  it("tile sólido sem retângulo: o objeto inteiro bloqueia", () => {
    expect(solidCells(objectMap([{ id: 1, gid: 3, x: 64, y: 128, width: 64, height: 64 }]))).toEqual([
      "2,2",
      "3,2",
      "2,3",
      "3,3",
    ]);
  });

  it("base menor que uma célula (poste) bloqueia a célula onde fica", () => {
    // Base x 76..86, y 118..126: nenhum centro de célula dentro; o meio (81, 122) cai na célula 2,3.
    expect(solidCells(objectMap([{ id: 1, gid: 4, x: 64, y: 128, width: 32, height: 96 }]))).toEqual(["2,3"]);
  });

  it("objeto redimensionado no Tiled escala o retângulo junto", () => {
    const map = objectMap([{ id: 1, gid: 1, x: 0, y: 320, width: 64, height: 80 }]);
    expect(parseObjectFootprints(map)).toEqual([{ x: 0, y: 288, width: 64, height: 32 }]);
  });

  it("espelhamento no gid não muda qual tile é", () => {
    const FLIPPED_HORIZONTALLY = 0x80000000;
    const map = objectMap([{ id: 1, gid: (1 | FLIPPED_HORIZONTALLY) >>> 0, x: 32, y: 288, width: 128, height: 160 }]);
    expect(parseObjectFootprints(map)).toHaveLength(1);
  });

  it("pontos e retângulos sem gid (spawns, áreas) não bloqueiam", () => {
    const map = objectMap([
      { id: 1, x: 50, y: 50, point: true },
      { id: 2, x: 0, y: 0, width: 64, height: 64 },
    ]);
    expect(solidCells(map)).toEqual([]);
  });
});
