import { describe, expect, it } from "vitest";
import { ACID, AREAS, BLEED, CRYSTAL_PULSE, FRENZY, MANA_REGEN_PER_SECOND, SHARDS, ZONE_EFFECTS } from "./balance";
import {
  crystalPulse,
  excessChasers,
  goblinEyes,
  inAcid,
  knockback,
  scatterShards,
  shardUnderfoot,
  tickBleed,
  tickMana,
  torchInReach,
  wolfFrenzy,
  zoneAt,
  zoneDamage,
  zoneHeal,
  zoneHungerFactor,
  zoneLightRadius,
} from "./zones";

describe("zoneAt", () => {
  const areas = [
    { name: "noroeste", rects: [{ x: 0, y: 0, width: 100, height: 100 }] },
    { name: "centro", rects: [{ x: 100, y: 0, width: 100, height: 100 }] },
  ];
  it("a zona vem da área do mapa; fora das 4 zonas, nenhuma", () => {
    expect(zoneAt(areas, AREAS, { x: 50, y: 50 })).toBe("goblin");
    expect(zoneAt(areas, AREAS, { x: 150, y: 50 })).toBeUndefined();
    expect(zoneAt(areas, AREAS, { x: 500, y: 500 })).toBeUndefined();
  });
});

describe("efeitos contínuos", () => {
  it("cada zona só mexe no que é dela", () => {
    expect(zoneLightRadius(240, "goblin")).toBe(240 * ZONE_EFFECTS.goblin.lightFactor);
    expect(zoneLightRadius(240, "slime")).toBe(240);
    expect(zoneHeal(10, "slime")).toBeCloseTo(10 * ZONE_EFFECTS.slime.healFactor);
    expect(zoneHeal(10, "gnomo")).toBe(10);
    expect(zoneHungerFactor("lobo")).toBe(ZONE_EFFECTS.lobo.hungerFactor);
    expect(zoneHungerFactor(undefined)).toBe(1);
    expect(zoneDamage(10, "gnomo")).toBeCloseTo(10 * ZONE_EFFECTS.gnomo.damageTakenFactor);
    expect(zoneDamage(10, "lobo")).toBe(10);
  });

  it("Mana regenera fora; nos gnomos drena (regeneração cortada mais o dreno), entre 0 e a máxima", () => {
    expect(tickMana(50, 100, undefined, 1000)).toBeCloseTo(50 + MANA_REGEN_PER_SECOND);
    const g = ZONE_EFFECTS.gnomo;
    expect(tickMana(50, 100, "gnomo", 1000)).toBeCloseTo(50 + MANA_REGEN_PER_SECOND * g.manaRegenFactor - g.manaDrainPerSecond);
    expect(tickMana(99.5, 100, undefined, 1000)).toBe(100);
    expect(tickMana(0.1, 100, "gnomo", 1000)).toBe(0);
  });
});

describe("goblins", () => {
  it("olhos: só quem já está caçando e entre 3 e 8 tiles", () => {
    const me = { x: 0, y: 0 };
    const eyes = goblinEyes(me, [
      { x: 50, y: 0, hunting: true },
      { x: 150, y: 0, hunting: true },
      { x: 150, y: 10, hunting: false },
      { x: 400, y: 0, hunting: true },
    ]);
    expect(eyes).toEqual([{ x: 150, y: 0 }]);
  });

  it("tocha: a apagada mais perto ao alcance", () => {
    const torches: [string, { x: number; y: number; lit: boolean }][] = [
      ["a", { x: 40, y: 0, lit: true }],
      ["b", { x: 50, y: 0, lit: false }],
      ["c", { x: 20, y: 0, lit: false }],
    ];
    expect(torchInReach({ x: 0, y: 0 }, torches, 56)).toBe("c");
    expect(torchInReach({ x: 500, y: 0 }, torches, 56)).toBeUndefined();
  });
});

describe("slimes", () => {
  it("poça: pelos pés", () => {
    expect(inAcid({ x: 0, y: -12 }, 12, [{ x: 0, y: 0 }])).toBe(true);
    expect(inAcid({ x: ACID.radius + 5, y: -12 }, 12, [{ x: 0, y: 0 }])).toBe(false);
  });
});

describe("lobos", () => {
  const wolf = { x: 0, y: 0 };
  it("frenesi: jogador ferido na zona dos lobos, perto", () => {
    const hurt = { x: 100, y: 0, hp: 30, maxHp: 100, zone: "lobo" as const };
    expect(wolfFrenzy(wolf, [hurt])).toBe(true);
    expect(wolfFrenzy(wolf, [{ ...hurt, hp: 40 }])).toBe(false);
    expect(wolfFrenzy(wolf, [{ ...hurt, zone: undefined }])).toBe(false);
    expect(wolfFrenzy(wolf, [{ ...hurt, x: FRENZY.radius + 10 }])).toBe(false);
  });
});

describe("gnomos", () => {
  it("descarga: carrega no fim do período e dispara na virada", () => {
    const period = CRYSTAL_PULSE.periodMs;
    expect(crystalPulse(0, 100, 0)).toEqual({ charging: false, fired: false });
    expect(crystalPulse(period - 500, period - 400, 0).charging).toBe(true);
    expect(crystalPulse(period - 50, period + 50, 0).fired).toBe(true);
    expect(crystalPulse(period + 50, period + 100, 0).fired).toBe(false);
  });

  it("empurrão para longe do cristal", () => {
    const push = knockback({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(push.x).toBeCloseTo(CRYSTAL_PULSE.knockback);
    expect(push.y).toBeCloseTo(0);
  });

  it("estilhaços espaçados, pisados pelos pés", () => {
    const cells = Array.from({ length: 2500 }, (_, i) => ({ x: (i % 50) * 32 + 16, y: Math.floor(i / 50) * 32 + 16 }));
    let s = 1;
    const shards = scatterShards(cells, () => ((s = (s * 16807) % 2147483647) / 2147483647));
    expect(shards.length).toBeGreaterThan(10);
    for (const a of shards) for (const b of shards) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(SHARDS.minSpacing);
    const list: [string, { x: number; y: number }][] = [["s1", { x: 0, y: 0 }]];
    expect(shardUnderfoot({ x: 0, y: -12 }, 12, list)).toBe("s1");
    expect(shardUnderfoot({ x: 40, y: -12 }, 12, list)).toBeUndefined();
  });

  it("sangramento: dano por segundo até acabar", () => {
    const tick = tickBleed(BLEED.durationMs, 1000);
    expect(tick.damage).toBeCloseTo(BLEED.damagePerSecond);
    expect(tick.remainingMs).toBe(BLEED.durationMs - 1000);
    expect(tickBleed(500, 1000).damage).toBeCloseTo(BLEED.damagePerSecond / 2);
    expect(tickBleed(0, 1000)).toEqual({ damage: 0, remainingMs: 0 });
  });
});

describe("excessChasers", () => {
  it("passou do teto: os mais longe de cada alvo desistem", () => {
    const chasers = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ id: `m${d}`, targetId: "p", distance: d * 10 }));
    expect(excessChasers([...chasers, { id: "x", targetId: "q", distance: 5 }], 5)).toEqual(["m6", "m7"]);
    expect(excessChasers(chasers.slice(0, 5), 5)).toEqual([]);
  });
});
