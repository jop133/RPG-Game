import { describe, expect, it } from "vitest";
import { SCREEN_HALF_DIAGONAL, VIEW_HYSTERESIS, VIEW_RADIUS } from "./balance";
import { shouldSee, viewportSize } from "./visibility";

const R = 100;
const origin = { x: 0, y: 0 };
const at = (distance: number) => ({ x: distance, y: 0 });

describe("shouldSee", () => {
  it("dentro do raio, vê", () => {
    expect(shouldSee(origin, at(50), R, false)).toBe(true);
  });

  it("exatamente no raio, vê", () => {
    expect(shouldSee(origin, at(R), R, false)).toBe(true);
  });

  it("fora do raio e fora da folga, não vê", () => {
    expect(shouldSee(origin, at(R + VIEW_HYSTERESIS + 1), R, true)).toBe(false);
  });

  it("na folga: quem não era visto continua invisível", () => {
    expect(shouldSee(origin, at(R + VIEW_HYSTERESIS / 2), R, false)).toBe(false);
  });

  it("na folga: quem já era visto continua visível (não pisca na borda)", () => {
    expect(shouldSee(origin, at(R + VIEW_HYSTERESIS / 2), R, true)).toBe(true);
  });

  it("é um círculo, não um quadrado: diagonal conta a distância real", () => {
    // (80, 80) está a ~113 px: fora de um raio de 100, mesmo com x e y menores que 100.
    expect(shouldSee(origin, { x: 80, y: 80 }, R, false)).toBe(false);
  });
});

describe("viewportSize", () => {
  const halfDiagonal = ({ width, height }: { width: number; height: number }) => Math.hypot(width, height) / 2;

  it("4:3 dá o tamanho de sempre (800x600)", () => {
    expect(viewportSize(1024, 768)).toEqual({ width: 800, height: 600 });
  });

  it("qualquer formato de janela mantém a meia-diagonal, sem passar do raio de visão", () => {
    const windows: [number, number][] = [[1920, 1080], [2560, 1080], [1280, 1024], [800, 1200], [375, 812]];
    for (const [w, h] of windows) {
      const size = viewportSize(w, h);
      expect(halfDiagonal(size)).toBeLessThanOrEqual(SCREEN_HALF_DIAGONAL);
      expect(halfDiagonal(size)).toBeGreaterThan(SCREEN_HALF_DIAGONAL - 2);
      expect(halfDiagonal(size)).toBeLessThan(VIEW_RADIUS);
    }
  });

  it("segue a proporção da janela", () => {
    const { width, height } = viewportSize(1920, 1080);
    expect(width / height).toBeCloseTo(1920 / 1080, 1);
  });

  it("janela de tamanho zero (minimizada) não quebra", () => {
    const size = viewportSize(0, 0);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
