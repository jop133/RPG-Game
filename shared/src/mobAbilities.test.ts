import { describe, expect, it } from "vitest";
import { CAST_RECOVER_MS, GNOME_CASTER, GOBLIN_DASH, GOBLIN_THROW, MOB_KINDS, SLIME_LEAP, WOLF_POUNCE } from "./balance";
import type { CollisionGrid } from "./collision";
import { type MobEvent, type MobStep, type MobWorld, type ThinkingMob, stepMob } from "./mobAi";
import type { Vec2 } from "./movement";

// Ataques especiais dos mobs (mobAi.ts): goblin (investida e arremesso), lobo (bote), slime (pulo), gnomo (projétil,
// cristal e distância). Sala aberta de 40x40 tiles.
const TILE = 32;
const open: CollisionGrid = { width: 40, height: 40, tileSize: TILE, solid: new Array<boolean>(1600).fill(false) };
const center = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const home = { name: "sala", rects: [{ x: 0, y: 0, width: 40 * TILE, height: 40 * TILE }] };

function world(kind: keyof typeof MOB_KINDS, player: Vec2, extra: Partial<MobWorld> = {}): MobWorld {
  return { grid: open, home, homeCells: [], stats: MOB_KINDS[kind], players: new Map([["p", player]]), ...extra };
}

function chasing(at: Vec2, target: Vec2): ThinkingMob {
  return { position: at, mind: { mode: "chase", targetId: "p", lastSeen: target, lostMs: 0, path: [], sinceRepathMs: 0 } };
}

// Roda até `until` (ou o limite de ticks), juntando eventos e golpes.
function run(mob: ThinkingMob, w: MobWorld, ticks: number, until?: (s: MobStep) => boolean) {
  let current: MobStep = mob;
  const events: MobEvent[] = [];
  const strikes: number[] = [];
  for (let i = 0; i < ticks; i++) {
    current = stepMob(current, w, 50, () => 0.5);
    events.push(...(current.events ?? []));
    if (current.strike !== undefined) strikes.push(current.strike);
    if (until?.(current)) break;
  }
  return { mob: current, events, strikes };
}

describe("goblin", () => {
  it("investida: com o alvo a 2,5-5 tiles, prepara, avança rápido e termina numa facada", () => {
    const player = center(25, 20);
    const start = center(20, 20); // 160 px
    const first = stepMob(chasing(start, player), world("goblin", player), 50, () => 0.5);
    expect(first.mind).toMatchObject({ mode: "ability", ability: "dash", phase: "prep" });
    expect(first.timers?.cooldowns.dash).toBe(GOBLIN_DASH.cooldownMs);
    const out = run(first, world("goblin", player), 40, (s) => s.strike !== undefined);
    expect(out.strikes).toHaveLength(1);
    expect(distance(out.mob.position, player)).toBeLessThan(40);
  });

  it("arremesso: o alvo fica na distância por 2,2 s e a adaga sai na direção dele", () => {
    const player = center(26, 20);
    const start = center(20, 20); // 192 px: longe para a investida, perto para o arremesso
    let mob: ThinkingMob = { ...chasing(start, player), timers: { cooldowns: { dash: 99_999 }, holdMs: 0 } };
    const frozen = { ...MOB_KINDS.goblin, speed: 0 };
    const out = run(mob, world("goblin", player, { stats: frozen }), 80, (s) => (s.events ?? []).length > 0);
    const thrown = out.events.find((e) => e.type === "projectile");
    expect(thrown).toMatchObject({ type: "projectile", kind: "dagger" });
    expect(thrown && thrown.type === "projectile" ? thrown.angle : 1).toBeCloseTo(0);
    expect(out.mob.mind).toMatchObject({ mode: "recover", remainingMs: CAST_RECOVER_MS });
    mob = out.mob;
    expect(mob.timers?.holdMs).toBe(0);
    expect(GOBLIN_THROW.holdMs).toBeGreaterThan(0);
  });
});

describe("lobo", () => {
  it("bote: agacha, salta até onde o alvo estava e cai com um impacto", () => {
    const player = center(25, 20);
    const start = center(20, 20); // 160 px
    const first = stepMob(chasing(start, player), world("lobo", player), 50, () => 0.5);
    expect(first.mind).toMatchObject({ mode: "ability", ability: "pounce", phase: "prep", aim: player });
    const out = run(first, world("lobo", player), 40, (s) => (s.events ?? []).length > 0);
    expect(out.events[0]).toMatchObject({ type: "impact", ability: "pounce" });
    expect(distance(out.mob.position, player)).toBeLessThan(4);
    expect(out.mob.mind).toMatchObject({ mode: "recover", remainingMs: WOLF_POUNCE.recoverMs });
  });

  it("bote para o norte também (direção não importa)", () => {
    const player = center(20, 15);
    const out = run(chasing(center(20, 20), player), world("lobo", player), 40, (s) => (s.events ?? []).length > 0);
    expect(out.events[0]).toMatchObject({ type: "impact" });
    expect(distance(out.mob.position, player)).toBeLessThan(4);
  });
});

describe("slime", () => {
  it("não golpeia parado: perto, pula no alvo e cai com impacto", () => {
    const player = center(21, 20);
    const first = stepMob(chasing(center(20, 20), player), world("slime", player), 50, () => 0.5);
    expect(first.mind).toMatchObject({ mode: "ability", ability: "leap" });
    const out = run(first, world("slime", player), 30, (s) => (s.events ?? []).length > 0);
    expect(out.events[0]).toMatchObject({ type: "impact", ability: "leap" });
    expect(distance(out.mob.position, player)).toBeLessThan(4);
  });

  it("o pulo vai no máximo SLIME_LEAP.range", () => {
    const player = center(22, 20); // 64 px: no limite
    const first = stepMob(chasing(center(20, 20), player), world("slime", player), 50, () => 0.5);
    expect(first.mind.mode === "ability" ? distance(first.mind.aim, center(20, 20)) : 0).toBeLessThanOrEqual(SLIME_LEAP.range + 1e-6);
  });
});

describe("gnomo", () => {
  it("conjura o cristal sob o alvo e o projétil, cada um com a sua recarga", () => {
    const player = center(25, 20); // 160 px: na distância de conjurar
    const out = run(chasing(center(20, 20), player), world("gnomo", player), 60);
    const kinds = out.events.map((e) => e.type);
    expect(kinds).toContain("crystal");
    expect(kinds).toContain("projectile");
    expect(out.events.find((e) => e.type === "crystal")).toMatchObject({ at: player });
    expect(out.events.find((e) => e.type === "projectile")).toMatchObject({ kind: "gnome" });
    expect(GNOME_CASTER.crystalCooldownMs).toBeGreaterThan(GNOME_CASTER.boltCooldownMs);
  });

  it("na distância certa, fica parado; perto demais, recua", () => {
    const player = center(20, 20);
    const still = { ...chasing(center(25, 20), player), timers: { cooldowns: { bolt: 99_999, crystal: 99_999 }, holdMs: 0 } };
    expect(stepMob(still, world("gnomo", player), 100, () => 0.5).position).toEqual(center(25, 20));
    const close = { ...chasing(center(22, 20), player), timers: { cooldowns: { bolt: 99_999, crystal: 99_999 }, holdMs: 0 } };
    const after = stepMob(close, world("gnomo", player), 100, () => 0.5);
    expect(distance(after.position, player)).toBeGreaterThan(distance(center(22, 20), player));
  });

  it("encurralado na parede com o alvo colado: golpe de perto", () => {
    const walled: CollisionGrid = { ...open, solid: open.solid.map((_, i) => i % 40 === 21) };
    // Encostado na parede (coluna 21) e o alvo a 24 px, a oeste.
    const at = { x: 21 * TILE - MOB_KINDS.gnomo.size / 2, y: center(20, 20).y };
    const player = { x: at.x - 24, y: at.y };
    const mob = { ...chasing(at, player), timers: { cooldowns: { bolt: 99_999, crystal: 99_999 }, holdMs: 0 } };
    expect(stepMob(mob, world("gnomo", player, { grid: walled }), 100, () => 0.5).mind.mode).toBe("windup");
  });
});

describe("cerco", () => {
  it("de perto, cada um chega pelo seu ângulo", () => {
    const player = center(20, 20);
    const start = center(24, 20); // 128 px, a leste
    const stats = { ...MOB_KINDS.goblin, abilities: [] };
    const left = run(chasing(start, player), world("goblin", player, { stats, flank: (40 * Math.PI) / 180 }), 6).mob.position;
    const right = run(chasing(start, player), world("goblin", player, { stats, flank: (-40 * Math.PI) / 180 }), 6).mob.position;
    expect(left.y).toBeGreaterThan(player.y + 4);
    expect(right.y).toBeLessThan(player.y - 4);
  });
});
