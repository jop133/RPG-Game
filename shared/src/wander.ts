import { type Area, areaAt } from "./areas";
import { WANDER_IDLE_MS, WANDER_WALK_MS } from "./balance";
import { type CollisionGrid, moveWithCollision } from "./collision";
import type { MobStats } from "./mobs";
import type { Vec2 } from "./movement";

// direction (0, 0) = parado. remainingMs = quanto falta para trocar de estado.
export interface WanderState {
  direction: Vec2;
  remainingMs: number;
}

export interface WanderingMob {
  position: Vec2;
  wander: WanderState;
}

const STOPPED: Vec2 = { x: 0, y: 0 };

function between(range: { min: number; max: number }, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

export function startIdle(random: () => number): WanderState {
  return { direction: STOPPED, remainingMs: between(WANDER_IDLE_MS, random) };
}

function startWalk(random: () => number): WanderState {
  const angle = random() * 2 * Math.PI;
  return { direction: { x: Math.cos(angle), y: Math.sin(angle) }, remainingMs: between(WANDER_WALK_MS, random) };
}

function isWalking(wander: WanderState): boolean {
  return wander.direction.x !== 0 || wander.direction.y !== 0;
}

// Anda na direção atual; se a parede ou a borda da área impedirem, fica onde está e a caminhada acaba.
function walk(mob: WanderingMob, area: Area, grid: CollisionGrid, stats: MobStats, dtMs: number): WanderingMob {
  const distance = (stats.speed * dtMs) / 1000;
  const delta = { x: mob.wander.direction.x * distance, y: mob.wander.direction.y * distance };
  const next = moveWithCollision(grid, mob.position, delta, stats.size / 2);
  const leftArea = areaAt([area], next) === undefined;
  const blocked = next.x === mob.position.x && next.y === mob.position.y;
  if (leftArea || blocked) return { position: mob.position, wander: { ...mob.wander, remainingMs: 0 } };
  return { position: next, wander: { ...mob.wander, remainingMs: mob.wander.remainingMs - dtMs } };
}

// Um tick de um mob vagando dentro da própria área. `random` devolve [0, 1); vem de fora para ser testável.
export function stepWander(
  mob: WanderingMob,
  area: Area,
  grid: CollisionGrid,
  stats: MobStats,
  dtMs: number,
  random: () => number,
): WanderingMob {
  if (mob.wander.remainingMs <= 0) {
    const wander = isWalking(mob.wander) ? startIdle(random) : startWalk(random);
    return { position: mob.position, wander };
  }
  if (!isWalking(mob.wander)) {
    return { position: mob.position, wander: { ...mob.wander, remainingMs: mob.wander.remainingMs - dtMs } };
  }
  return walk(mob, area, grid, stats, dtMs);
}
