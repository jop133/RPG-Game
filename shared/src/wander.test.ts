import { describe, expect, it } from "vitest";
import { areaAt } from "./areas";
import { WANDER_IDLE_MS, WANDER_WALK_MS } from "./balance";
import { type CollisionGrid, boxFits } from "./collision";
import { type WanderingMob, startIdle, stepWander } from "./wander";

const TILE = 32;
const stats = { size: 16, speed: 100, maxHp: 10 };

function gridFrom(rows: string[]): CollisionGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const open = gridFrom(Array(10).fill(".........."));
const wholeMap = { name: "a", rects: [{ x: 0, y: 0, width: 320, height: 320 }] };
const right = { x: 1, y: 0 };
const stopped = { x: 0, y: 0 };

describe("stepWander", () => {
  it("parado: não se mexe e o tempo corre", () => {
    const mob: WanderingMob = { position: { x: 48, y: 48 }, wander: { direction: stopped, remainingMs: 1000 } };
    expect(stepWander(mob, wholeMap, open, stats, 50, Math.random)).toEqual({
      position: { x: 48, y: 48 },
      wander: { direction: stopped, remainingMs: 950 },
    });
  });

  it("fim do tempo parado: começa a andar na direção e pelo tempo sorteados", () => {
    const mob: WanderingMob = { position: { x: 48, y: 48 }, wander: { direction: stopped, remainingMs: 0 } };
    // 1º sorteio: ângulo (0 → para a direita). 2º: duração (0 → mínimo).
    const next = stepWander(mob, wholeMap, open, stats, 50, sequence(0, 0));
    expect(next.position).toEqual({ x: 48, y: 48 });
    expect(next.wander.direction.x).toBeCloseTo(1);
    expect(next.wander.direction.y).toBeCloseTo(0);
    expect(next.wander.remainingMs).toBe(WANDER_WALK_MS.min);
  });

  it("andando: anda speed × tempo na direção", () => {
    const mob: WanderingMob = { position: { x: 48, y: 48 }, wander: { direction: right, remainingMs: 1000 } };
    expect(stepWander(mob, wholeMap, open, stats, 500, Math.random)).toEqual({
      position: { x: 98, y: 48 },
      wander: { direction: right, remainingMs: 500 },
    });
  });

  it("fim do tempo andando: para pelo tempo sorteado", () => {
    const mob: WanderingMob = { position: { x: 48, y: 48 }, wander: { direction: right, remainingMs: -5 } };
    expect(stepWander(mob, wholeMap, open, stats, 50, sequence(1))).toEqual({
      position: { x: 48, y: 48 },
      wander: { direction: stopped, remainingMs: WANDER_IDLE_MS.max },
    });
  });

  it("não sai da própria área: o passo que sairia é cancelado e a caminhada acaba", () => {
    const smallArea = { name: "a", rects: [{ x: 0, y: 0, width: 160, height: 320 }] };
    const mob: WanderingMob = { position: { x: 150, y: 48 }, wander: { direction: right, remainingMs: 1000 } };
    expect(stepWander(mob, smallArea, open, stats, 500, Math.random)).toEqual({
      position: { x: 150, y: 48 },
      wander: { direction: right, remainingMs: 0 },
    });
  });

  it("encostado numa parede: não atravessa e a caminhada acaba", () => {
    const walled = gridFrom(Array(10).fill(".....#...."));
    const flush = { x: 160 - stats.size / 2, y: 48 };
    const mob: WanderingMob = { position: flush, wander: { direction: right, remainingMs: 1000 } };
    expect(stepWander(mob, wholeMap, walled, stats, 50, Math.random)).toEqual({
      position: flush,
      wander: { direction: right, remainingMs: 0 },
    });
  });

  it("simulação longa: nunca sai da área nem entra em parede", () => {
    const grid = gridFrom([
      "##########",
      "#........#",
      "#..##....#",
      "#..##..#.#",
      "#......#.#",
      "#........#",
      "##########",
    ]);
    // Área só da metade esquerda; a direita é chão também, mas de outra área.
    const area = { name: "a", rects: [{ x: 32, y: 32, width: 160, height: 160 }] };
    const mobs: WanderingMob[] = [
      { position: { x: 48, y: 48 }, wander: startIdle(Math.random) },
      { position: { x: 176, y: 176 }, wander: startIdle(Math.random) },
      { position: { x: 48, y: 176 }, wander: startIdle(Math.random) },
    ];
    for (let tick = 0; tick < 2000; tick++) {
      mobs.forEach((mob, i) => {
        const next = stepWander(mob, area, grid, stats, 50, Math.random);
        expect(areaAt([area], next.position)).toBeDefined();
        expect(boxFits(grid, next.position, stats.size / 2)).toBe(true);
        mobs[i] = next;
      });
    }
  });
});

describe("startIdle", () => {
  it("dura entre o mínimo e o máximo configurados", () => {
    expect(startIdle(() => 0).remainingMs).toBe(WANDER_IDLE_MS.min);
    expect(startIdle(() => 0.5).remainingMs).toBe((WANDER_IDLE_MS.min + WANDER_IDLE_MS.max) / 2);
  });
});
