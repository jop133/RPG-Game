import { describe, expect, it } from "vitest";
import { pickSpawnPoint } from "./spawn";

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
