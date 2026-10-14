import { describe, expect, it } from "vitest";
import { LEVEL_XP } from "./balance";
import { levelForXp, xpForNextLevel } from "./progression";

describe("levelForXp", () => {
  it("começa no nível 1", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("sobe exatamente ao alcançar cada limite", () => {
    LEVEL_XP.forEach((needed, i) => {
      expect(levelForXp(needed - 1)).toBe(i + 1);
      expect(levelForXp(needed)).toBe(i + 2);
    });
  });

  it("além da tabela, fica no último nível", () => {
    expect(levelForXp(10_000)).toBe(LEVEL_XP.length + 1);
  });
});

describe("xpForNextLevel", () => {
  it("diz quanto XP total o próximo nível pede", () => {
    expect(xpForNextLevel(1)).toBe(LEVEL_XP[0]);
    expect(xpForNextLevel(2)).toBe(LEVEL_XP[1]);
  });

  it("no nível máximo, não há próximo", () => {
    expect(xpForNextLevel(LEVEL_XP.length + 1)).toBeUndefined();
  });
});
