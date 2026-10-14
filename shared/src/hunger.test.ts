import { describe, expect, it } from "vitest";
import { HUNGER_DECAY_PER_SECOND, HUNGER_MAX, STARVATION_DAMAGE_PER_SECOND } from "./balance";
import { starvationDamage, tickHunger } from "./hunger";

describe("tickHunger", () => {
  it("cai HUNGER_DECAY_PER_SECOND por segundo", () => {
    expect(tickHunger(50, 1000)).toBeCloseTo(50 - HUNGER_DECAY_PER_SECOND);
  });

  it("ticks pequenos somam o mesmo que um tick grande", () => {
    let hunger = 50;
    for (let i = 0; i < 20; i++) hunger = tickHunger(hunger, 50);
    expect(hunger).toBeCloseTo(tickHunger(50, 1000));
  });

  it("nunca fica negativa", () => {
    expect(tickHunger(0.1, 10_000)).toBe(0);
  });

  it("de cheia a vazia no tempo previsto", () => {
    const secondsToEmpty = HUNGER_MAX / HUNGER_DECAY_PER_SECOND;
    expect(tickHunger(HUNGER_MAX, secondsToEmpty * 1000 - 1000)).toBeGreaterThan(0);
    expect(tickHunger(HUNGER_MAX, secondsToEmpty * 1000)).toBe(0);
  });
});

describe("starvationDamage", () => {
  it("com fome sobrando, não tira vida", () => {
    expect(starvationDamage(0.01, 1000)).toBe(0);
  });

  it("com a fome zerada, tira STARVATION_DAMAGE_PER_SECOND por segundo", () => {
    expect(starvationDamage(0, 1000)).toBe(STARVATION_DAMAGE_PER_SECOND);
    expect(starvationDamage(0, 50)).toBeCloseTo(STARVATION_DAMAGE_PER_SECOND / 20);
  });
});
