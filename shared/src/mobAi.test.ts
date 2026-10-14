import { describe, expect, it } from "vitest";
import { areaAt } from "./areas";
import { MOB_LOSE_TRACK_MS, PLAYER_SIZE } from "./balance";
import { type CollisionGrid, boxFits } from "./collision";
import { type MobWorld, type ThinkingMob, stepMob } from "./mobAi";
import type { Vec2 } from "./movement";
import { startIdle } from "./wander";

const TILE = 32;
const stats = { size: 16, speed: 100, maxHp: 10, aggroRadius: 100, reach: 8 };
const STOP_AT = stats.size / 2 + PLAYER_SIZE / 2 + stats.reach;

// Duas salas ligadas por uma porta de 1 tile em (5, 2). A casa do mob é a sala da esquerda.
const grid: CollisionGrid = (() => {
  const rows = ["###########", "#....#....#", "#.........#", "#....#....#", "###########"];
  return {
    width: 11,
    height: 5,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
})();
const center = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
const home = { name: "casa", rects: [{ x: 32, y: 32, width: 128, height: 96 }] };
const homeCells = [1, 2, 3].flatMap((row) => [1, 2, 3, 4].map((col) => center(col, row)));

const world = (players: Record<string, Vec2>): MobWorld => ({
  grid,
  home,
  homeCells,
  stats,
  players: new Map(Object.entries(players)),
});
const wandering = (position: Vec2): ThinkingMob => ({ position, mind: { mode: "wander", wander: startIdle(() => 0.5) } });
const chasing = (position: Vec2, lastSeen: Vec2): ThinkingMob => ({
  position,
  mind: { mode: "chase", targetId: "p", lastSeen, lostMs: 0, path: [] },
});
const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

function run(mob: ThinkingMob, w: MobWorld, ticks: number, check?: (m: ThinkingMob) => void): ThinkingMob {
  let current = mob;
  for (let i = 0; i < ticks; i++) {
    current = stepMob(current, w, 100, Math.random);
    check?.(current);
  }
  return current;
}

describe("stepMob: notar", () => {
  it("vagando, nota jogador perto e à vista e passa a perseguir", () => {
    const next = stepMob(wandering(center(2, 2)), world({ p: center(4, 2) }), 100, Math.random);
    expect(next.mind).toMatchObject({ mode: "chase", targetId: "p" });
  });

  it("não nota jogador além do raio de aggro", () => {
    const next = stepMob(wandering(center(1, 2)), world({ p: center(6, 2) }), 100, Math.random);
    expect(next.mind.mode).toBe("wander");
  });

  it("não nota jogador do outro lado da parede, mesmo perto", () => {
    // 64 px de distância, mas a parede (5, 1) está no meio.
    const next = stepMob(wandering(center(4, 1)), world({ p: center(6, 1) }), 100, Math.random);
    expect(next.mind.mode).toBe("wander");
  });

  it("com dois jogadores à vista, persegue o mais perto", () => {
    const next = stepMob(wandering(center(2, 2)), world({ longe: center(4, 3), perto: center(3, 2) }), 100, Math.random);
    expect(next.mind).toMatchObject({ mode: "chase", targetId: "perto" });
  });
});

describe("stepMob: perseguir", () => {
  it("anda na direção do alvo", () => {
    const target = center(4, 2);
    const mob = chasing(center(1, 2), target);
    const next = stepMob(mob, world({ p: target }), 100, Math.random);
    expect(distance(next.position, target)).toBeCloseTo(distance(mob.position, target) - stats.speed / 10, 0);
  });

  it("para encostado no alvo, sem entrar nele", () => {
    const target = { x: 100, y: 80 };
    const mob = chasing({ x: target.x - STOP_AT + 2, y: 80 }, target);
    expect(stepMob(mob, world({ p: target }), 100, Math.random).position).toEqual(mob.position);
  });

  it("alvo do outro lado da parede, na mesma fileira: contorna pela porta, sem nunca entrar em parede", () => {
    // Em linha reta, o mob pararia na parede (5, 1). Só pelo caminho ele desce até a porta (5, 2) e sobe de novo.
    const target = center(8, 1);
    const end = run(chasing(center(2, 1), target), world({ p: target }), 100, (m) => {
      expect(boxFits(grid, m.position, stats.size / 2)).toBe(true);
    });
    expect(distance(end.position, target)).toBeLessThanOrEqual(STOP_AT);
  });

  it("alvo saiu da sala: desiste e volta para casa", () => {
    const next = stepMob(chasing(center(8, 2), center(9, 2)), world({}), 100, Math.random);
    expect(next.mind.mode).toBe("return");
  });
});

describe("stepMob: perder de vista e voltar", () => {
  it("sem ver o alvo, vai até onde o viu por último", () => {
    // Alvo escondido atrás da parede (5, 1); visto por último em (8, 2).
    const lastSeen = center(8, 2);
    const end = run(chasing(center(9, 3), lastSeen), world({ p: center(4, 1) }), 10);
    expect(distance(end.position, lastSeen)).toBeLessThan(1);
    expect(end.mind.mode).toBe("chase");
  });

  it(`sem ver o alvo por ${MOB_LOSE_TRACK_MS} ms, desiste`, () => {
    const hidden = world({ p: center(4, 1) });
    const ticksToGiveUp = MOB_LOSE_TRACK_MS / 100;
    const almost = run(chasing(center(8, 2), center(8, 2)), hidden, ticksToGiveUp - 1);
    expect(almost.mind.mode).toBe("chase");
    expect(run(almost, hidden, 1).mind.mode).toBe("return");
  });

  it("voltando, chega na própria área e volta a vagar", () => {
    const returning: ThinkingMob = run(chasing(center(9, 3), center(9, 3)), world({}), 1);
    expect(returning.mind.mode).toBe("return");
    const end = run(returning, world({}), 60, (m) => {
      expect(boxFits(grid, m.position, stats.size / 2)).toBe(true);
    });
    expect(end.mind.mode).toBe("wander");
    expect(areaAt([home], end.position)).toBeDefined();
  });

  it("voltando, se notar alguém, persegue de novo", () => {
    const returning: ThinkingMob = { position: center(3, 2), mind: { mode: "return", path: [center(2, 2)] } };
    expect(stepMob(returning, world({ p: center(4, 2) }), 100, Math.random).mind.mode).toBe("chase");
  });

  it("desistindo já dentro de casa, volta direto a vagar", () => {
    expect(stepMob(chasing(center(2, 2), center(2, 2)), world({}), 100, Math.random).mind.mode).toBe("wander");
  });
});
