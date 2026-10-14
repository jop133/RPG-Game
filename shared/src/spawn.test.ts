import { describe, expect, it } from "vitest";
import { entrySpawnPoints, pickSpawnPoint } from "./spawn";

const points = [
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 4 },
];

describe("pickSpawnPoint", () => {
  it("random no início do intervalo escolhe o primeiro ponto", () => {
    expect(pickSpawnPoint(points, 0)).toEqual({ x: 1, y: 1 });
  });

  it("random quase 1 escolhe o último, nunca passa do fim da lista", () => {
    expect(pickSpawnPoint(points, 0.9999)).toEqual({ x: 4, y: 4 });
  });

  it("cada ponto tem a mesma fatia do intervalo", () => {
    expect(pickSpawnPoint(points, 0.25)).toEqual({ x: 2, y: 2 });
    expect(pickSpawnPoint(points, 0.74)).toEqual({ x: 3, y: 3 });
  });

  it("lista vazia dá erro", () => {
    expect(() => pickSpawnPoint([], 0.5)).toThrow();
  });
});

describe("entrySpawnPoints", () => {
  const areas = [
    { name: "salao", rects: [{ x: 0, y: 0, width: 100, height: 100 }] },
    { name: "toca", rects: [{ x: 100, y: 0, width: 100, height: 100 }] },
  ];
  const configs = { salao: { playerEntry: true }, toca: { playerEntry: false } };

  it("só ficam os pontos em áreas que aceitam entrada", () => {
    const points = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 10, y: 10 },
    ];
    expect(entrySpawnPoints(points, areas, configs)).toEqual([
      { x: 50, y: 50 },
      { x: 10, y: 10 },
    ]);
  });

  it("ponto fora de qualquer área não serve de entrada", () => {
    expect(entrySpawnPoints([{ x: 500, y: 500 }], areas, configs)).toEqual([]);
  });
});
