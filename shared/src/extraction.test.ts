import { describe, expect, it } from "vitest";
import { EXIT_CHANNEL, EXIT_RADIUS } from "./balance";
import { alarmedMobs, exitIndexAt, isInsideExit, pickActiveExits, stepChannel } from "./extraction";

const candidates = [
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 4 },
];

describe("pickActiveExits", () => {
  it("sorteia a quantidade pedida, sem repetir", () => {
    const picked = pickActiveExits(candidates, 2, Math.random);
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((p) => p.x)).size).toBe(2);
  });

  it("o sorteio vem do gerador recebido", () => {
    // 0.99 pega o último; 0 pega o primeiro dos que sobraram.
    let i = 0;
    const values = [0.99, 0];
    expect(pickActiveExits(candidates, 2, () => values[i++] ?? 0)).toEqual([
      { x: 4, y: 4 },
      { x: 1, y: 1 },
    ]);
  });

  it("pedindo mais do que existe, devolve todos", () => {
    expect(pickActiveExits(candidates, 10, Math.random)).toHaveLength(4);
  });
});

describe("isInsideExit", () => {
  const exits = [{ x: 100, y: 100 }];

  it("dentro do raio: está no portal; na borda também", () => {
    expect(isInsideExit({ x: 100, y: 100 }, exits)).toBe(true);
    expect(isInsideExit({ x: 100 + EXIT_RADIUS, y: 100 }, exits)).toBe(true);
  });

  it("fora do raio: não está", () => {
    expect(isInsideExit({ x: 100 + EXIT_RADIUS + 1, y: 100 }, exits)).toBe(false);
  });
});

describe("exitIndexAt", () => {
  it("diz em qual portal o ponto está, ou -1", () => {
    const exits = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
    expect(exitIndexAt({ x: 505, y: 3 }, exits)).toBe(1);
    expect(exitIndexAt({ x: 250, y: 0 }, exits)).toBe(-1);
  });
});

describe("stepChannel", () => {
  it("parado e sem dano, a canalização soma", () => {
    expect(stepChannel(1000, false, 50)).toEqual({ elapsedMs: 1050, done: false, interrupted: false });
  });

  it("andou ou levou dano: interrompe e zera", () => {
    expect(stepChannel(EXIT_CHANNEL.channelMs - 50, true, 50)).toEqual({ elapsedMs: 0, done: false, interrupted: true });
  });

  it("completa exatamente em channelMs de ticks seguidos", () => {
    let state = { elapsedMs: 0, done: false, interrupted: false };
    let ticks = 0;
    while (!state.done) {
      state = stepChannel(state.elapsedMs, false, 50);
      ticks++;
    }
    expect(ticks * 50).toBe(EXIT_CHANNEL.channelMs);
  });
});

describe("alarmedMobs", () => {
  it("só os mobs dentro do raio do alarme", () => {
    const r = EXIT_CHANNEL.alertRadius;
    const mobs: [string, { x: number; y: number }][] = [["perto", { x: r - 1, y: 0 }], ["longe", { x: r + 1, y: 0 }]];
    expect(alarmedMobs({ x: 0, y: 0 }, mobs)).toEqual(["perto"]);
  });
});
