import { describe, expect, it } from "vitest";
import { VIEW_HYSTERESIS } from "./balance";
import { shouldSee } from "./visibility";

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
