import { describe, expect, it } from "vitest";
import { ADVENTURER_RANKS, LEVEL_XP, MOB_KINDS } from "./balance";
import { adventurerRank, levelForXp, xpForNextLevel } from "./progression";

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

describe("adventurerRank", () => {
  const kinds = Object.keys(MOB_KINDS);

  it("linhagem nova: Rank F, com o E como próximo", () => {
    const rank = adventurerRank([]);
    expect(rank.known).toBe(0);
    expect(rank.current.rank).toBe("F");
    expect(rank.next?.rank).toBe("E");
  });

  it("sobe exatamente ao alcançar o número de tipos de cada degrau", () => {
    for (const [i, step] of ADVENTURER_RANKS.entries()) {
      expect(adventurerRank(kinds.slice(0, step.bestiary)).current).toEqual(step);
      if (step.bestiary > 0) expect(adventurerRank(kinds.slice(0, step.bestiary - 1)).current).toEqual(ADVENTURER_RANKS[i - 1]);
    }
  });

  it("com todos os tipos do jogo: o último degrau, sem próximo", () => {
    const rank = adventurerRank(kinds);
    expect(rank.current).toEqual(ADVENTURER_RANKS.at(-1));
    expect(rank.next).toBeUndefined();
  });

  it("tipo que saiu do jogo (rato), repetido ou inventado não conta", () => {
    expect(adventurerRank(["rato", "toString", "lobo", "lobo"]).known).toBe(1);
  });

  it("os degraus sobem em ordem e o primeiro não pede nada", () => {
    expect(ADVENTURER_RANKS[0]?.bestiary).toBe(0);
    ADVENTURER_RANKS.slice(1).forEach((step, i) => expect(step.bestiary).toBeGreaterThan(ADVENTURER_RANKS[i]?.bestiary ?? 0));
  });
});

