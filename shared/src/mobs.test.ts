import { describe, expect, it } from "vitest";
import type { CollisionGrid } from "./collision";
import { areaFloorCells, planMobSpawns } from "./mobs";

const TILE = 32;

function gridFrom(rows: string[]): CollisionGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

// Gerador determinístico para os testes: sempre devolve a mesma sequência.
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("areaFloorCells", () => {
  const grid = gridFrom(["....", ".#..", "...."]);

  it("devolve o centro de cada tile de chão dentro da área, sem as paredes", () => {
    // Área cobre as colunas 0-1 e as linhas 0-1: 4 tiles, um deles parede.
    const area = { name: "a", rects: [{ x: 0, y: 0, width: 64, height: 64 }] };
    expect(areaFloorCells(area, grid)).toEqual([
      { x: 16, y: 16 },
      { x: 48, y: 16 },
      { x: 16, y: 48 },
    ]);
  });

  it("tile cujo centro está fora da área não conta, mesmo se a área encostar nele", () => {
    // Vai até x=40: pega o centro da coluna 0 (16), não o da coluna 1 (48).
    const area = { name: "a", rects: [{ x: 0, y: 0, width: 40, height: 32 }] };
    expect(areaFloorCells(area, grid)).toEqual([{ x: 16, y: 16 }]);
  });

  it("junta os tiles de todos os retângulos da área", () => {
    const area = {
      name: "a",
      rects: [
        { x: 0, y: 0, width: 32, height: 32 },
        { x: 96, y: 64, width: 32, height: 32 },
      ],
    };
    expect(areaFloorCells(area, grid)).toEqual([
      { x: 16, y: 16 },
      { x: 112, y: 80 },
    ]);
  });
});

describe("planMobSpawns", () => {
  const cells = [
    { x: 16, y: 16 },
    { x: 48, y: 16 },
    { x: 80, y: 16 },
    { x: 112, y: 16 },
  ];

  it("cria a quantidade pedida de cada tipo", () => {
    const spawns = planMobSpawns(cells, { rato: 2, goblin: 1 }, Math.random);
    expect(spawns.filter((s) => s.kind === "rato")).toHaveLength(2);
    expect(spawns.filter((s) => s.kind === "goblin")).toHaveLength(1);
  });

  it("cada mob num tile diferente, todos tirados da lista", () => {
    const spawns = planMobSpawns(cells, { rato: 4 }, Math.random);
    const keys = spawns.map((s) => `${s.position.x},${s.position.y}`);
    expect(new Set(keys).size).toBe(4);
    expect(spawns.every((s) => cells.some((c) => c.x === s.position.x && c.y === s.position.y))).toBe(true);
  });

  it("o sorteio vem do gerador recebido", () => {
    // 0.99 pega o último tile; 0 pega o primeiro dos que sobraram.
    const spawns = planMobSpawns(cells, { rato: 2 }, sequence(0.99, 0));
    expect(spawns.map((s) => s.position)).toEqual([
      { x: 112, y: 16 },
      { x: 16, y: 16 },
    ]);
  });

  it("área sem mobs configurados não cria nenhum", () => {
    expect(planMobSpawns(cells, {}, Math.random)).toEqual([]);
  });

  it("mais mobs que tiles dá erro", () => {
    expect(() => planMobSpawns(cells, { rato: 3, goblin: 2 }, Math.random)).toThrow(/5 mobs não cabem em 4/);
  });
});
