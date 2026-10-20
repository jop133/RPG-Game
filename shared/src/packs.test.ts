import { describe, expect, it } from "vitest";
import { IDLE, LEASH, MOB_SPAWN_SAFE_RADIUS, PACKS, PATH_RECALC_MS } from "./balance";
import type { CollisionGrid } from "./collision";
import { type MobWorld, type ThinkingMob, stepMob } from "./mobAi";
import type { Vec2 } from "./movement";
import { idlePlanFor, patrolAxis, planPacks, roamPoint } from "./packs";

const TILE = 32;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });

// Sorteio previsível (LCG): os testes não dependem de Math.random.
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function gridFrom(rows: string[]): CollisionGrid {
  return { width: rows[0]?.length ?? 0, height: rows.length, tileSize: TILE, solid: rows.flatMap((r) => [...r].map((c) => c === "#")) };
}

// Chão aberto de 100x100 tiles: 16 setores de 25x25 inteiros.
const openCells = Array.from({ length: 100 * 100 }, (_, i) => center(i % 100, Math.floor(i / 100)));

describe("planPacks", () => {
  const packs = planPacks(openCells, "goblin", TILE, [], seeded(7));

  it("um grupo por setor com chão, de 2 a 4 membros", () => {
    expect(packs.length).toBeGreaterThan(8);
    expect(packs.length).toBeLessThanOrEqual(16);
    for (const pack of packs) {
      expect(pack.kind).toBe("goblin");
      expect(pack.members.length).toBeGreaterThanOrEqual(PACKS.size.min);
      expect(pack.members.length).toBeLessThanOrEqual(PACKS.size.max);
    }
  });

  it("postos a pelo menos a distância mínima entre si; membros perto do posto", () => {
    for (const a of packs) {
      for (const b of packs) if (a !== b) expect(distance(a.home, b.home)).toBeGreaterThanOrEqual(PACKS.minDistance);
      for (const m of a.members) expect(distance(m, a.home)).toBeLessThanOrEqual(PACKS.spreadTiles * TILE);
    }
  });

  it("nenhum posto perto das entradas", () => {
    const entry = center(50, 50);
    for (const pack of planPacks(openCells, "slime", TILE, [entry], seeded(3))) {
      expect(distance(pack.home, entry)).toBeGreaterThanOrEqual(MOB_SPAWN_SAFE_RADIUS);
    }
  });

  it("setor com pouco chão não recebe grupo", () => {
    expect(planPacks(openCells.slice(0, PACKS.minSectorCells - 1), "lobo", TILE, [], seeded(1))).toEqual([]);
  });
});

describe("vida em repouso", () => {
  // Corredor horizontal de 12 tiles (linha 2), fechado em volta.
  const corridor = gridFrom(["##############", "##############", "#............#", "##############", "##############"]);

  it("lobos: patrulha no eixo do corredor, de 5 a 7 tiles", () => {
    const plan = patrolAxis(center(6, 2), corridor, seeded(2));
    expect(plan?.kind).toBe("patrol");
    if (plan?.kind !== "patrol") return;
    expect(plan.a.y).toBe(plan.b.y);
    const tiles = Math.abs(plan.b.x - plan.a.x) / TILE + 1;
    expect(tiles).toBeGreaterThanOrEqual(IDLE.patrolTiles.min);
    expect(tiles).toBeLessThanOrEqual(IDLE.patrolTiles.max);
  });

  it("cada tipo com o seu plano", () => {
    expect(idlePlanFor("slime", center(6, 2), corridor, [], seeded(1)).kind).toBe("still");
    expect(idlePlanFor("goblin", center(6, 2), corridor, [], seeded(1)).kind).toBe("roam");
    expect(idlePlanFor("gnomo", center(6, 2), corridor, [center(9, 2)], seeded(1))).toEqual({ kind: "visit", points: [center(6, 2), center(9, 2)] });
    expect(idlePlanFor("gnomo", center(6, 2), corridor, [], seeded(1)).kind).toBe("roam");
  });

  it("ronda: um tile de chão perto do posto", () => {
    const open = gridFrom(Array.from({ length: 20 }, () => ".".repeat(20)));
    for (let i = 0; i < 20; i++) {
      const p = roamPoint(center(10, 10), open, seeded(i));
      expect(distance(p, center(10, 10))).toBeLessThanOrEqual((IDLE.roamTiles.max + 1) * TILE);
    }
  });
});

describe("mob de grupo (com posto)", () => {
  const open = gridFrom(Array.from({ length: 40 }, () => ".".repeat(40)));
  const stats = { size: 16, speed: 100, maxHp: 10, aggroRadius: 100, reach: 8, windupMs: 500, attackDamage: 5, attackReach: 20, attackArcDegrees: 90, recoverMs: 400 };
  const home = center(5, 5);
  const world = (players: Record<string, Vec2>, extra: Partial<MobWorld> = {}): MobWorld => ({
    grid: open,
    home: { name: "zona", rects: [{ x: 0, y: 0, width: 40 * TILE, height: 40 * TILE }] },
    homeCells: [],
    stats,
    players: new Map(Object.entries(players)),
    post: { home, plan: { kind: "roam" } },
    ...extra,
  });

  it("em repouso, anda em volta do posto e para; não fica congelado", () => {
    let mob: ThinkingMob = { position: home, mind: { mode: "idle", path: [], waitMs: 0, leg: 0 } };
    const random = seeded(11);
    let moved = false;
    for (let i = 0; i < 200; i++) {
      mob = stepMob(mob, world({}), 100, random);
      if (distance(mob.position, home) > 4) moved = true;
      expect(distance(mob.position, home)).toBeLessThanOrEqual((IDLE.roamTiles.max + 1.5) * TILE);
    }
    expect(moved).toBe(true);
  });

  it("coleira: perseguindo longe demais do posto, volta imune e mais rápido", () => {
    const far = center(5 + Math.ceil(LEASH.radius / TILE) + 1, 5);
    const chasing: ThinkingMob = { position: far, mind: { mode: "chase", targetId: "p", lastSeen: far, lostMs: 0, path: [], sinceRepathMs: PATH_RECALC_MS } };
    const next = stepMob(chasing, world({ p: { x: far.x + 40, y: far.y } }), 100, Math.random);
    expect(next.mind).toMatchObject({ mode: "return", immuneMs: LEASH.immuneMs });
    // Imune: com o jogador colado, continua voltando; e anda LEASH.returnSpeed x a velocidade.
    const after = stepMob(next, world({ p: { x: far.x + 20, y: far.y } }), 100, Math.random);
    expect(after.mind.mode).toBe("return");
    expect(distance(after.position, next.position)).toBeCloseTo(stats.speed * 0.1 * LEASH.returnSpeed, 0);
  });

  it("volta ao posto e repousa", () => {
    let mob: ThinkingMob = { position: center(12, 5), mind: { mode: "return", path: [], immuneMs: 0 } };
    for (let i = 0; i < 60 && mob.mind.mode !== "idle"; i++) mob = stepMob(mob, world({}), 100, Math.random);
    expect(mob.mind.mode).toBe("idle");
    expect(distance(mob.position, home)).toBeLessThan(TILE);
  });

  it("não começa a perseguir quem já tem perseguidores demais (noticeable)", () => {
    const idle: ThinkingMob = { position: home, mind: { mode: "idle", path: [], waitMs: 1000, leg: 0 } };
    const near = { p: { x: home.x + 50, y: home.y } };
    expect(stepMob(idle, world(near), 100, Math.random).mind.mode).toBe("chase");
    expect(stepMob(idle, world(near, { noticeable: new Set() }), 100, Math.random).mind.mode).toBe("idle");
  });
});
