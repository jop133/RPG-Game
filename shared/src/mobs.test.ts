import { describe, expect, it } from "vitest";
import type { CollisionGrid } from "./collision";
import { MOB_SPAWN_SAFE_RADIUS } from "./balance";
import { areaFloorCells, planMobSpawns, safeSpawnCells } from "./mobs";

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
    const spawns = planMobSpawns(cells, { lobo: 2, goblin: 1 }, Math.random);
    expect(spawns.filter((s) => s.kind === "lobo")).toHaveLength(2);
    expect(spawns.filter((s) => s.kind === "goblin")).toHaveLength(1);
  });

  it("cada mob num tile diferente, todos tirados da lista", () => {
    const spawns = planMobSpawns(cells, { lobo: 4 }, Math.random);
    const keys = spawns.map((s) => `${s.position.x},${s.position.y}`);
    expect(new Set(keys).size).toBe(4);
    expect(spawns.every((s) => cells.some((c) => c.x === s.position.x && c.y === s.position.y))).toBe(true);
  });

  it("o sorteio vem do gerador recebido", () => {
    // 0.99 pega o último tile; 0 pega o primeiro dos que sobraram.
    const spawns = planMobSpawns(cells, { lobo: 2 }, sequence(0.99, 0));
    expect(spawns.map((s) => s.position)).toEqual([
      { x: 112, y: 16 },
      { x: 16, y: 16 },
    ]);
  });

  it("área sem mobs configurados não cria nenhum", () => {
    expect(planMobSpawns(cells, {}, Math.random)).toEqual([]);
  });

  it("mais mobs que tiles dá erro", () => {
    expect(() => planMobSpawns(cells, { lobo: 3, goblin: 2 }, Math.random)).toThrow(/5 mobs não cabem em 4/);
  });
});

describe("safeSpawnCells (raio seguro em volta da chegada)", () => {
  const row = Array.from({ length: 30 }, (_, i) => ({ x: i * 32 + 16, y: 16 }));
  const entry = [{ x: 16, y: 16 }];

  it("tira os tiles a menos do raio de qualquer ponto de entrada; o da borda do raio fica", () => {
    const safe = safeSpawnCells(row, entry, 320);
    expect(safe.every((c) => c.x - 16 >= 320)).toBe(true);
    expect(safe).toContainEqual({ x: 336, y: 16 });
    expect(safe).not.toContainEqual({ x: 304, y: 16 });
  });

  it("vale para todos os pontos de entrada ao mesmo tempo", () => {
    const safe = safeSpawnCells(row, [...entry, { x: 30 * 32, y: 16 }], 320);
    expect(safe.every((c) => c.x - 16 >= 320 && 30 * 32 - c.x >= 320)).toBe(true);
  });

  it("mobs planejados nos tiles seguros nunca nascem perto da chegada", () => {
    for (let run = 0; run < 20; run++) {
      for (const { position } of planMobSpawns(safeSpawnCells(row, entry, MOB_SPAWN_SAFE_RADIUS), { lobo: 3 }, Math.random)) {
        expect(Math.hypot(position.x - 16, position.y - 16)).toBeGreaterThanOrEqual(MOB_SPAWN_SAFE_RADIUS);
      }
    }
  });
});

