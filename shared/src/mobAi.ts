import { type Area, areaAt } from "./areas";
import { MOB_LOSE_TRACK_MS, PLAYER_SIZE, VIEW_RADIUS } from "./balance";
import { type CollisionGrid, moveWithCollision } from "./collision";
import type { Arc } from "./combat";
import { hasLineOfSight } from "./lineOfSight";
import type { MobStats } from "./mobs";
import type { Vec2 } from "./movement";
import { findPath } from "./pathfinding";
import { type WanderState, startIdle, stepWander } from "./wander";

// O que o mob está fazendo. Fica no servidor; do golpe, o cliente recebe só "preparando" e a direção (o telegrafo).
export type MobMind =
  | { mode: "wander"; wander: WanderState }
  | { mode: "chase"; targetId: string; lastSeen: Vec2; lostMs: number; path: Vec2[] }
  | { mode: "return"; path: Vec2[] }
  | { mode: "windup"; targetId: string; angle: number; remainingMs: number }
  | { mode: "recover"; targetId: string; remainingMs: number };

export interface ThinkingMob {
  position: Vec2;
  mind: MobMind;
}

// `strike`: no tick em que a preparação termina, a direção do golpe. O servidor aplica o dano.
export interface MobStep extends ThinkingMob {
  strike?: number;
}

// Arco do golpe do mob, do centro dele até a borda do alvo.
export function mobStrikeArc(stats: MobStats): Arc {
  return { range: stats.size / 2 + stats.attackReach, degrees: stats.attackArcDegrees };
}

// Tudo o que o mob precisa saber do mundo para decidir o próximo tick.
export interface MobWorld {
  grid: CollisionGrid;
  home: Area;
  homeCells: readonly Vec2[];
  stats: MobStats;
  players: ReadonlyMap<string, Vec2>;
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

function sameTile(grid: CollisionGrid, a: Vec2, b: Vec2): boolean {
  const ts = grid.tileSize;
  return Math.floor(a.x / ts) === Math.floor(b.x / ts) && Math.floor(a.y / ts) === Math.floor(b.y / ts);
}

function sees(grid: CollisionGrid, from: Vec2, to: Vec2, radius: number): boolean {
  return distance(from, to) <= radius && hasLineOfSight(grid, from, to);
}

// Jogador mais próximo que o mob consegue notar agora: dentro do raio e sem parede no meio.
function noticeTarget(position: Vec2, world: MobWorld): [string, Vec2] | undefined {
  let best: [string, Vec2] | undefined;
  for (const [id, player] of world.players) {
    if (!sees(world.grid, position, player, world.stats.aggroRadius)) continue;
    if (!best || distance(position, player) < distance(position, best[1])) best = [id, player];
  }
  return best;
}

function startChase(position: Vec2, [targetId, target]: [string, Vec2], grid: CollisionGrid): MobMind {
  return { mode: "chase", targetId, lastSeen: target, lostMs: 0, path: findPath(grid, position, target) ?? [] };
}

// Reaproveita o caminho atual se ele ainda termina no tile do destino; senão calcula de novo.
function pathTo(grid: CollisionGrid, from: Vec2, goal: Vec2, current: Vec2[]): Vec2[] {
  const last = current.at(-1);
  if (last ? sameTile(grid, last, goal) : sameTile(grid, from, goal)) return current;
  return findPath(grid, from, goal) ?? [];
}

// Anda pelos centros de tile do caminho e, acabado o caminho, direto até `finalPoint`. Para se travar.
function followPath(
  position: Vec2,
  path: Vec2[],
  finalPoint: Vec2,
  world: MobWorld,
  dtMs: number,
): { position: Vec2; path: Vec2[] } {
  let remaining = (world.stats.speed * dtMs) / 1000;
  let pos = position;
  const rest = [...path];
  while (remaining > 1e-9) {
    const waypoint = rest[0] ?? finalPoint;
    const gap = distance(pos, waypoint);
    if (gap < 1e-9) {
      if (rest.length === 0) break;
      rest.shift();
      continue;
    }
    const step = Math.min(remaining, gap);
    const delta = { x: ((waypoint.x - pos.x) / gap) * step, y: ((waypoint.y - pos.y) / gap) * step };
    const next = moveWithCollision(world.grid, pos, delta, world.stats.size / 2);
    const moved = distance(pos, next);
    pos = next;
    remaining -= moved;
    if (moved < step - 1e-9) break;
  }
  return { position: pos, path: rest };
}

// Volta pelo caminho até o tile de chão da própria área mais perto de onde está.
function giveUp(position: Vec2, world: MobWorld, random: () => number): MobMind {
  if (areaAt([world.home], position)) return { mode: "wander", wander: startIdle(random) };
  let nearest: Vec2 | undefined;
  for (const cell of world.homeCells) {
    if (!nearest || distance(position, cell) < distance(position, nearest)) nearest = cell;
  }
  const path = nearest ? (findPath(world.grid, position, nearest) ?? []) : [];
  return { mode: "return", path };
}

function stepWandering(mob: ThinkingMob, wander: WanderState, world: MobWorld, dtMs: number, random: () => number) {
  const spotted = noticeTarget(mob.position, world);
  if (spotted) return { position: mob.position, mind: startChase(mob.position, spotted, world.grid) };
  const next = stepWander({ position: mob.position, wander }, world.home, world.grid, world.stats, dtMs, random);
  return { position: next.position, mind: { mode: "wander" as const, wander: next.wander } };
}

function stepChasing(
  mob: ThinkingMob,
  mind: Extract<MobMind, { mode: "chase" }>,
  world: MobWorld,
  dtMs: number,
  random: () => number,
): ThinkingMob {
  const target = world.players.get(mind.targetId);
  if (!target) return { position: mob.position, mind: giveUp(mob.position, world, random) };
  const visible = sees(world.grid, mob.position, target, VIEW_RADIUS);
  const lostMs = visible ? 0 : mind.lostMs + dtMs;
  if (lostMs >= MOB_LOSE_TRACK_MS) return { position: mob.position, mind: giveUp(mob.position, world, random) };
  const lastSeen = visible ? target : mind.lastSeen;

  // Encostou no alvo à vista: para e começa a preparar o golpe, com a direção travada a partir de agora.
  const stopAt = world.stats.size / 2 + PLAYER_SIZE / 2 + world.stats.reach;
  if (visible && distance(mob.position, target) <= stopAt) {
    const angle = Math.atan2(target.y - mob.position.y, target.x - mob.position.x);
    return {
      position: mob.position,
      mind: { mode: "windup", targetId: mind.targetId, angle, remainingMs: world.stats.windupMs },
    };
  }
  const moved = followPath(mob.position, pathTo(world.grid, mob.position, lastSeen, mind.path), lastSeen, world, dtMs);
  return { position: moved.position, mind: { ...mind, lastSeen, lostMs, path: moved.path } };
}

// Preparando: parado, direção travada. Não é interrompido por dano. Ao terminar, golpeia e passa a se recuperar.
function stepWindup(mob: ThinkingMob, mind: Extract<MobMind, { mode: "windup" }>, world: MobWorld, dtMs: number): MobStep {
  const remainingMs = mind.remainingMs - dtMs;
  if (remainingMs > 0) return { position: mob.position, mind: { ...mind, remainingMs } };
  return {
    position: mob.position,
    mind: { mode: "recover", targetId: mind.targetId, remainingMs: world.stats.recoverMs },
    strike: mind.angle,
  };
}

// Recuperando: parado. Depois volta a perseguir o mesmo alvo (ou desiste, se ele tiver saído da sala).
function stepRecover(mob: ThinkingMob, mind: Extract<MobMind, { mode: "recover" }>, dtMs: number): ThinkingMob {
  const remainingMs = mind.remainingMs - dtMs;
  if (remainingMs > 0) return { position: mob.position, mind: { ...mind, remainingMs } };
  return {
    position: mob.position,
    mind: { mode: "chase", targetId: mind.targetId, lastSeen: mob.position, lostMs: 0, path: [] },
  };
}

function stepReturning(
  mob: ThinkingMob,
  path: Vec2[],
  world: MobWorld,
  dtMs: number,
  random: () => number,
): ThinkingMob {
  const spotted = noticeTarget(mob.position, world);
  if (spotted) return { position: mob.position, mind: startChase(mob.position, spotted, world.grid) };
  const goal = path.at(-1);
  if (!goal) return { position: mob.position, mind: { mode: "wander", wander: startIdle(random) } };
  const moved = followPath(mob.position, path, goal, world, dtMs);
  return { position: moved.position, mind: { mode: "return", path: moved.path } };
}

// Um tick da cabeça de um mob: vagar, perseguir, golpear ou voltar para casa. `random` vem de fora para ser testável.
export function stepMob(mob: ThinkingMob, world: MobWorld, dtMs: number, random: () => number): MobStep {
  switch (mob.mind.mode) {
    case "wander":
      return stepWandering(mob, mob.mind.wander, world, dtMs, random);
    case "chase":
      return stepChasing(mob, mob.mind, world, dtMs, random);
    case "return":
      return stepReturning(mob, mob.mind.path, world, dtMs, random);
    case "windup":
      return stepWindup(mob, mob.mind, world, dtMs);
    case "recover":
      return stepRecover(mob, mob.mind, dtMs);
  }
}
