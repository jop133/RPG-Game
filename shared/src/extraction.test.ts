import { describe, expect, it } from "vitest";
import { EXIT_RADIUS, EXTRACT_MS } from "./balance";
import { isInsideExit, pickActiveExits, stepExtraction } from "./extraction";

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

describe("stepExtraction", () => {
  it("dentro do portal, a contagem soma", () => {
    expect(stepExtraction(1000, true, 50)).toEqual({ progressMs: 1050, done: false });
  });

  it("saiu do portal: zera", () => {
    expect(stepExtraction(EXTRACT_MS - 50, false, 50)).toEqual({ progressMs: 0, done: false });
  });

  it("completa exatamente em EXTRACT_MS de ticks seguidos dentro", () => {
    let state = { progressMs: 0, done: false };
    let ticks = 0;
    while (!state.done) {
      state = stepExtraction(state.progressMs, true, 50);
      ticks++;
    }
    expect(ticks * 50).toBe(EXTRACT_MS);
  });
});
