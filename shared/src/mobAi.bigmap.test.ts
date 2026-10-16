import { describe, expect, it, vi } from "vitest";
import { areaAt } from "./areas";
import { PATH_RECALC_MS } from "./balance";
import type { CollisionGrid } from "./collision";
import { type MobWorld, type ThinkingMob, stepMob } from "./mobAi";
import type { Vec2 } from "./movement";

// O findPath de verdade, mas contando as chamadas e com o limite de tiles explorados que o teste escolher: com um
// limite baixo, um corredor de 60 tiles se comporta como um andar gigante (o destino fica além do que o A* explora).
const search = vi.hoisted(() => ({ calls: 0, maxNodes: 1200 }));
vi.mock("./pathfinding", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pathfinding")>();
  return {
    ...real,
    findPath: (grid: CollisionGrid, from: Vec2, to: Vec2) => {
      search.calls++;
      return real.findPath(grid, from, to, search.maxNodes);
    },
  };
});

const TILE = 32;
const WIDTH = 60;
// Corredor de 3 tiles de altura entre paredes. A casa do mob são as 4 primeiras colunas.
const grid: CollisionGrid = {
  width: WIDTH,
  height: 5,
  tileSize: TILE,
  solid: Array.from({ length: 5 * WIDTH }, (_, i) => {
    const col = i % WIDTH;
    const row = Math.floor(i / WIDTH);
    return row === 0 || row === 4 || col === 0 || col === WIDTH - 1;
  }),
};
const center = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
const home = { name: "casa", rects: [{ x: TILE, y: TILE, width: 4 * TILE, height: 3 * TILE }] };
const homeCells = [1, 2, 3].flatMap((row) => [1, 2, 3, 4].map((col) => center(col, row)));
const stats = {
  size: 16,
  speed: 100,
  maxHp: 10,
  aggroRadius: 100,
  reach: 8,
  windupMs: 500,
  attackDamage: 5,
  attackReach: 20,
  attackArcDegrees: 90,
  recoverMs: 400,
};
const world = (players: Record<string, Vec2>): MobWorld => ({ grid, home, homeCells, stats, players: new Map(Object.entries(players)) });

describe("perseguição: recálculo do A* limitado por PATH_RECALC_MS", () => {
  it("alvo trocando de tile a cada tick: o A* roda no máximo uma vez a cada PATH_RECALC_MS, não a cada tick", () => {
    search.maxNodes = 1200;
    search.calls = 0;
    const tickMs = 50;
    const ticks = 20;
    let mob: ThinkingMob = {
      position: center(10, 2),
      mind: { mode: "chase", targetId: "p", lastSeen: center(14, 2), lostMs: 0, path: [], sinceRepathMs: PATH_RECALC_MS },
    };
    // O alvo foge pelo corredor, um tile por tick, sempre à vista.
    for (let i = 0; i < ticks; i++) mob = stepMob(mob, world({ p: center(14 + i, 2) }), tickMs, Math.random);
    expect(mob.mind.mode).toBe("chase");
    expect(search.calls).toBeGreaterThan(0);
    expect(search.calls).toBeLessThanOrEqual(Math.ceil((ticks * tickMs) / PATH_RECALC_MS) + 1);
    expect(search.calls).toBeLessThan(ticks / 3);
  });

  it("passado o intervalo, recalcula para o tile novo do alvo", () => {
    search.maxNodes = 1200;
    let mob: ThinkingMob = {
      position: center(10, 2),
      mind: { mode: "chase", targetId: "p", lastSeen: center(20, 2), lostMs: 0, path: [], sinceRepathMs: PATH_RECALC_MS },
    };
    mob = stepMob(mob, world({ p: center(20, 2) }), 50, Math.random);
    search.calls = 0;
    mob = stepMob(mob, world({ p: center(21, 2) }), 50, Math.random);
    expect(search.calls).toBe(0);
    mob = stepMob(mob, world({ p: center(22, 2) }), PATH_RECALC_MS, Math.random);
    expect(search.calls).toBe(1);
    const path = mob.mind.mode === "chase" ? mob.mind.path : [];
    expect(path.at(-1)).toEqual(center(22, 2));
  });
});

describe("voltando para casa num andar grande (caminho em trechos)", () => {
  it("com o A* limitado, volta em vários trechos parciais e chega na própria área", () => {
    search.maxNodes = 12;
    search.calls = 0;
    // Perseguindo alguém que saiu da sala: desiste e volta. A casa fica a ~50 tiles, muito além de 12 tiles explorados.
    let mob: ThinkingMob = {
      position: center(55, 2),
      mind: { mode: "chase", targetId: "sumiu", lastSeen: center(55, 2), lostMs: 0, path: [], sinceRepathMs: 0 },
    };
    const modes = new Set<string>();
    for (let i = 0; i < 400 && mob.mind.mode !== "wander"; i++) {
      mob = stepMob(mob, world({}), 100, Math.random);
      modes.add(mob.mind.mode);
    }
    expect(modes.has("return")).toBe(true);
    expect(mob.mind.mode).toBe("wander");
    expect(areaAt([home], mob.position)).toBeDefined();
    expect(search.calls).toBeGreaterThan(3);
  });
});
