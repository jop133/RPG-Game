import { type Area, areaAt } from "./areas";
import {
  CAST_RECOVER_MS,
  FLANK,
  GNOME_CASTER,
  GOBLIN_DASH,
  GOBLIN_THROW,
  FENRIR_CLAW,
  FENRIR_HOWL,
  FIZBAN_ESCAPE,
  FIZBAN_POTIONS,
  KING_EXPLOSION,
  KING_SLAM,
  KRAG_KICK,
  KRAG_TORNADO,
  LEASH,
  MOB_LOSE_TRACK_MS,
  MOB_WAKE_RADIUS,
  PATH_RECALC_MS,
  PLAYER_SIZE,
  SLIME_LEAP,
  VIEW_RADIUS,
  WOLF_POUNCE,
} from "./balance";
import { type CollisionGrid, moveWithCollision } from "./collision";
import type { Arc } from "./combat";
import { hasLineOfSight } from "./lineOfSight";
import type { MobAbility, MobStats } from "./mobs";
import type { Vec2 } from "./movement";
import { type IdlePlan, idlePauseMs, roamPoint } from "./packs";
import { findPath } from "./pathfinding";
import { type WanderState, startIdle, stepWander } from "./wander";

// O que o mob está fazendo. Fica no servidor; do golpe, o cliente recebe só "preparando" e a direção (o telegrafo).
// wander: o mob solto (sem posto) vagando pela área. idle: o mob de grupo (com posto) levando a vida em volta do posto
// (path até o ponto da vez; waitMs parado nele; leg: qual ponta da patrulha é a próxima).
// return: voltando; immuneMs > 0 = voltando pela coleira, sem notar ninguém.
// alert: atende ao alarme de um portal (alarm): sem coleira, e só desiste depois de chegar aonde foi chamado (ou onde
// viu o alvo por último). Passa pelo golpe (windup, recover) e só acaba quando ele desiste.
export type MobMind =
  | { mode: "wander"; wander: WanderState }
  | { mode: "idle"; path: Vec2[]; waitMs: number; leg: number }
  // sinceRepathMs: tempo desde o último A* da perseguição (o recálculo é limitado a um a cada PATH_RECALC_MS).
  | { mode: "chase"; targetId: string; lastSeen: Vec2; lostMs: number; path: Vec2[]; sinceRepathMs: number; alert?: boolean }
  | { mode: "return"; path: Vec2[]; immuneMs?: number }
  | { mode: "windup"; targetId: string; angle: number; remainingMs: number; alert?: boolean }
  | { mode: "recover"; targetId: string; remainingMs: number; alert?: boolean }
  // Ataque especial (balance.ts): "prep" é o preparo parado (o aviso); "act", o movimento (investida, bote, pulo).
  // aim: o ponto do alvo no começo (para onde o bote e o pulo vão).
  | { mode: "ability"; ability: MobAbility; targetId: string; phase: "prep" | "act"; remainingMs: number; angle: number; aim: Vec2; alert?: boolean };

// Recarga que falta (ms) de cada ataque especial, e há quanto tempo o alvo está na distância do arremesso (goblin).
export interface MobTimers {
  cooldowns: Partial<Record<MobAbility, number>>;
  holdMs: number;
}

// O que um ataque especial faz no mundo; quem aplica é o servidor (dano, projétil, cristal, poça).
// projectile: a adaga do goblin ou o projétil do gnomo, de `from` na direção `angle`. crystal: a erupção no ponto
// `at` (o círculo agora, o cristal depois). impact: a queda do bote (lobo), do pulo (slime) ou do Pulo Esmagador (Rei
// Slime) em `at`. spin: o tornado do Krag está em `at` neste tick (quem estiver perto leva dano, a cada intervalo).
// crack: o Chute Sísmico do Krag, a rachadura saindo de `from` na direção `angle`. blast: a Explosão do Rei Slime em `at`.
export type MobEvent =
  | { type: "projectile"; kind: "dagger" | "gnome"; from: Vec2; angle: number }
  | { type: "crystal"; at: Vec2 }
  | { type: "impact"; ability: "pounce" | "leap" | "slam"; at: Vec2 }
  | { type: "spin"; at: Vec2 }
  | { type: "crack"; from: Vec2; angle: number }
  | { type: "blast"; at: Vec2 }
  // Fizban: os 3 frascos caindo em volta de `target`; a fumaça do pulo de fuga em `at`. Fenrir: o uivo em `at`; o golpe
  // de garra saindo de `from` na direção `angle`.
  | { type: "potions"; target: Vec2 }
  | { type: "smoke"; at: Vec2 }
  | { type: "howl"; at: Vec2 }
  | { type: "claw"; from: Vec2; angle: number };

export interface ThinkingMob {
  position: Vec2;
  mind: MobMind;
  timers?: MobTimers;
}

// `strike`: no tick em que a preparação termina, a direção do golpe. O servidor aplica o dano. `events`: o que os
// ataques especiais fizeram neste tick.
export interface MobStep extends ThinkingMob {
  strike?: number;
  events?: MobEvent[];
}

// Arco do golpe do mob, do centro dele até a borda do alvo.
export function mobStrikeArc(stats: MobStats): Arc {
  return { range: stats.size / 2 + stats.attackReach, degrees: stats.attackArcDegrees };
}

// Um jogador como o mob o enxerga: posição e Furtividade (encurta, em %, a distância em que o mob o nota).
export interface MobTarget extends Vec2 {
  stealthPercent?: number;
}

// O posto de um mob de grupo: para onde volta e o que faz em repouso.
export interface MobPost {
  home: Vec2;
  plan: IdlePlan;
}

// Tudo o que o mob precisa saber do mundo para decidir o próximo tick. post: só os mobs de grupo (spawns táticos).
// noticeable: quem ele pode começar a perseguir agora (sem o campo, todos); o servidor tira quem já tem
// MAX_CHASERS atrás de si.
export interface MobWorld {
  grid: CollisionGrid;
  home: Area;
  homeCells: readonly Vec2[];
  stats: MobStats;
  players: ReadonlyMap<string, MobTarget>;
  post?: MobPost;
  noticeable?: ReadonlySet<string>;
  // Cerco: o ângulo (radianos, até ±FLANK.degrees) pelo qual este mob chega ao alvo de perto.
  flank?: number;
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

function sameTile(grid: CollisionGrid, a: Vec2, b: Vec2): boolean {
  const ts = grid.tileSize;
  return Math.floor(a.x / ts) === Math.floor(b.x / ts) && Math.floor(a.y / ts) === Math.floor(b.y / ts);
}

function sees(grid: CollisionGrid, from: Vec2, to: Vec2, radius: number): boolean {
  return distance(from, to) <= radius && hasLineOfSight(grid, from, to);
}

// Jogador mais próximo que o mob consegue notar agora: dentro do raio (menor para quem é furtivo) e sem parede no meio.
function noticeTarget(position: Vec2, world: MobWorld): [string, Vec2] | undefined {
  let best: [string, Vec2] | undefined;
  for (const [id, player] of world.players) {
    if (world.noticeable && !world.noticeable.has(id)) continue;
    const radius = world.stats.aggroRadius * (1 - (player.stealthPercent ?? 0) / 100);
    if (!sees(world.grid, position, player, radius)) continue;
    if (!best || distance(position, player) < distance(position, best[1])) best = [id, player];
  }
  return best;
}

function startChase(position: Vec2, [targetId, target]: [string, Vec2], grid: CollisionGrid): MobMind {
  const path = findPath(grid, position, target) ?? [];
  return { mode: "chase", targetId, lastSeen: target, lostMs: 0, path, sinceRepathMs: 0 };
}

// Reaproveita o caminho atual se ele ainda termina no tile do destino. Se o destino trocou de tile, só recalcula
// depois de PATH_RECALC_MS do último cálculo: um alvo andando não faz o mob rodar o A* a cada tick. (Quando o mob
// termina de andar o caminho, stepChasing vence o intervalo na hora; ver lá.) `repathed` diz se calculou agora.
function pathTo(
  grid: CollisionGrid,
  from: Vec2,
  goal: Vec2,
  current: Vec2[],
  sinceRepathMs: number,
): { path: Vec2[]; repathed: boolean } {
  const last = current.at(-1);
  if (last ? sameTile(grid, last, goal) : sameTile(grid, from, goal)) return { path: current, repathed: false };
  if (sinceRepathMs < PATH_RECALC_MS) return { path: current, repathed: false };
  return { path: findPath(grid, from, goal) ?? [], repathed: true };
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
    const safeGap = Math.max(0.001, gap);
    const delta = { x: ((waypoint.x - pos.x) / safeGap) * step, y: ((waypoint.y - pos.y) / safeGap) * step };
    const next = moveWithCollision(world.grid, pos, delta, world.stats.size / 2);
    const moved = distance(pos, next);
    pos = next;
    remaining -= moved;
    if (moved < step - 1e-9) break;
  }
  return { position: pos, path: rest };
}

// Volta pelo caminho até o tile de chão da própria área mais perto de onde está. Só olha os tiles da área (o
// servidor os calcula uma vez por mapa), nunca o mapa inteiro. Longe demais para o limite do A*, o caminho é um
// trecho: ao acabar, stepReturning pede o próximo. Sem trecho que avance (beco sem saída maior que o limite, ou a
// área fora de alcance), volta a vagar onde está em vez de travar.
function giveUp(position: Vec2, world: MobWorld, random: () => number): MobMind {
  if (world.post) return returnToPost(position, world.post, world.grid, 0);
  if (areaAt([world.home], position)) return { mode: "wander", wander: startIdle(random) };
  let nearest: Vec2 | undefined;
  for (const cell of world.homeCells) {
    if (!nearest || distance(position, cell) < distance(position, nearest)) nearest = cell;
  }
  const path = nearest ? (findPath(world.grid, position, nearest) ?? []) : [];
  if (path.length === 0) return { mode: "wander", wander: startIdle(random) };
  return { mode: "return", path };
}

// Volta ao posto (de longe, em trechos: o A* tem teto; stepReturning pede o próximo trecho ao acabar o atual).
function returnToPost(position: Vec2, post: MobPost, grid: CollisionGrid, immuneMs: number): MobMind {
  if (sameTile(grid, position, post.home)) return { mode: "idle", path: [], waitMs: 0, leg: 0 };
  return { mode: "return", path: findPath(grid, position, post.home) ?? [], immuneMs };
}

// Escolhe o próximo ponto da vida em repouso e o caminho até ele.
function nextIdleLeg(position: Vec2, post: MobPost, grid: CollisionGrid, leg: number, random: () => number): Extract<MobMind, { mode: "idle" }> {
  const plan = post.plan;
  if (plan.kind === "still") return { mode: "idle", path: [], waitMs: idlePauseMs(random), leg };
  const goal =
    plan.kind === "patrol" ? (leg === 0 ? plan.a : plan.b)
    : plan.kind === "visit" ? (plan.points[Math.floor(random() * plan.points.length)] ?? post.home)
    : roamPoint(post.home, grid, random);
  const path = findPath(grid, position, goal) ?? [];
  return { mode: "idle", path, waitMs: 0, leg: plan.kind === "patrol" ? 1 - leg : leg };
}

// Repouso no posto: nota quem chegar perto; parado, espera; sem caminho, escolhe o próximo ponto; senão, anda.
function stepIdle(mob: ThinkingMob, mind: Extract<MobMind, { mode: "idle" }>, world: MobWorld, dtMs: number, random: () => number): ThinkingMob {
  const post = world.post as MobPost;
  const spotted = noticeTarget(mob.position, world);
  if (spotted) return { position: mob.position, mind: startChase(mob.position, spotted, world.grid) };
  if (mind.waitMs > 0) return { position: mob.position, mind: { ...mind, waitMs: Math.max(0, mind.waitMs - dtMs) } };
  if (mind.path.length === 0) return { position: mob.position, mind: nextIdleLeg(mob.position, post, world.grid, mind.leg, random) };
  const goal = mind.path.at(-1) as Vec2;
  const moved = followPath(mob.position, mind.path, goal, world, dtMs);
  // Chegou (ou travou): para um pouco antes do próximo ponto.
  const arrived = moved.path.length === 0;
  return { position: moved.position, mind: { ...mind, path: moved.path, waitMs: arrived ? idlePauseMs(random) : 0 } };
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
  // Coleira: longe demais do posto, desiste e volta depressa, sem notar ninguém por um tempo. Atendendo a um alarme, não.
  if (!mind.alert && world.post && distance(mob.position, world.post.home) > LEASH.radius) {
    return { position: mob.position, mind: returnToPost(mob.position, world.post, world.grid, LEASH.immuneMs) };
  }
  const visible = sees(world.grid, mob.position, target, VIEW_RADIUS);
  // Atendendo a um alarme, o caminho até o portal pode ser longo: só conta o tempo sem ver o alvo depois de chegar.
  const enRoute = mind.alert === true && !sameTile(world.grid, mob.position, mind.lastSeen);
  const lostMs = visible || enRoute ? 0 : mind.lostMs + dtMs;
  if (lostMs >= MOB_LOSE_TRACK_MS) return { position: mob.position, mind: giveUp(mob.position, world, random) };
  const lastSeen = visible ? target : mind.lastSeen;
  const gap = distance(mob.position, target);
  const timers = holdTimer(mob.timers, visible, gap, dtMs);

  // Ataque especial pronto e na distância certa: começa.
  const special = visible ? startAbility(mob.position, mind, world.stats, target, gap, timers) : undefined;
  if (special) return { position: mob.position, mind: special.mind, timers: special.timers };

  const stopAt = world.stats.size / 2 + PLAYER_SIZE / 2 + world.stats.reach;
  // Gnomo: perto demais, recua; na distância de conjurar, espera parado a recarga. Encurralado, cai no golpe de perto.
  if (visible && isCaster(world.stats)) {
    const kept = keepDistance(mob, mind, world, target, gap, stopAt, dtMs);
    if (kept) return { position: kept.position, mind: kept.mind.mode === "chase" ? { ...mind, lastSeen, lostMs } : kept.mind, timers };
  }

  // Encostou no alvo à vista: para e começa a preparar o golpe, com a direção travada a partir de agora. O slime e o
  // Rei Slime não golpeiam parados: o ataque deles é o pulo.
  if (visible && gap <= stopAt && !world.stats.abilities?.some((a) => a === "leap" || a === "slam")) {
    const angle = Math.atan2(target.y - mob.position.y, target.x - mob.position.x);
    return {
      position: mob.position,
      mind: { mode: "windup", targetId: mind.targetId, angle, remainingMs: world.stats.windupMs, alert: mind.alert },
      timers,
    };
  }
  // Cerco: de perto e à vista, cada um chega pelo seu ângulo.
  if (visible && world.flank && gap < FLANK.range && gap > stopAt) {
    const away = Math.atan2(mob.position.y - target.y, mob.position.x - target.x) + world.flank;
    const goal = { x: target.x + Math.cos(away) * stopAt, y: target.y + Math.sin(away) * stopAt };
    const moved = followPath(mob.position, [], goal, chaser(world), dtMs);
    return { position: moved.position, mind: { ...mind, lastSeen, lostMs, path: [], sinceRepathMs: mind.sinceRepathMs + dtMs }, timers };
  }
  const since = mind.sinceRepathMs + dtMs;
  const route = pathTo(world.grid, mob.position, lastSeen, mind.path, since);
  const moved = followPath(mob.position, route.path, lastSeen, chaser(world), dtMs);
  // Terminou de andar o caminho neste tick: o próximo recalcula na hora. Um A* que devolveu [] (já está no ponto mais
  // perto de um alvo fora de alcance) não conta: aí espera o intervalo, em vez de rodar de novo a cada tick.
  const ranOut = route.path.length > 0 && moved.path.length === 0;
  const sinceRepathMs = ranOut ? PATH_RECALC_MS : route.repathed ? 0 : since;
  return { position: moved.position, mind: { ...mind, lastSeen, lostMs, path: moved.path, sinceRepathMs }, timers };
}

// Perseguindo, alguns tipos correm mais (chaseSpeedFactor).
function chaser(world: MobWorld): MobWorld {
  const factor = world.stats.chaseSpeedFactor ?? 1;
  return factor === 1 ? world : { ...world, stats: { ...world.stats, speed: world.stats.speed * factor } };
}

// ---------------------------------------------------------------- ataques especiais

const NO_TIMERS: MobTimers = { cooldowns: {}, holdMs: 0 };

// As recargas andam em qualquer modo.
function tickTimers(timers: MobTimers | undefined, dtMs: number): MobTimers | undefined {
  if (!timers) return undefined;
  const cooldowns: Partial<Record<MobAbility, number>> = {};
  for (const [ability, left] of Object.entries(timers.cooldowns) as [MobAbility, number][]) {
    if (left - dtMs > 0) cooldowns[ability] = left - dtMs;
  }
  return { cooldowns, holdMs: timers.holdMs };
}

// Arremesso do goblin: conta o tempo seguido com o alvo à vista na distância dele (fora dela, zera).
function holdTimer(timers: MobTimers | undefined, visible: boolean, gap: number, dtMs: number): MobTimers {
  const current = timers ?? NO_TIMERS;
  const inRange = visible && gap >= GOBLIN_THROW.min && gap <= GOBLIN_THROW.max;
  return { cooldowns: current.cooldowns, holdMs: inRange ? current.holdMs + dtMs : 0 };
}

function isCaster(stats: MobStats): boolean {
  return stats.abilities?.includes("bolt") === true;
}

// Qual ataque especial começa agora (o primeiro pronto, na ordem da lista do tipo), ou nenhum.
function startAbility(
  position: Vec2,
  mind: Extract<MobMind, { mode: "chase" }>,
  stats: MobStats,
  target: Vec2,
  gap: number,
  timers: MobTimers,
): { mind: MobMind; timers: MobTimers } | undefined {
  const ready = (a: MobAbility) => (timers.cooldowns[a] ?? 0) <= 0;
  const angle = Math.atan2(target.y - position.y, target.x - position.x);
  for (const ability of stats.abilities ?? []) {
    const plan = abilityPlan(ability, gap, timers, ready(ability));
    if (!plan) continue;
    const aim =
      ability === "leap"
        ? clampTo(position, target, SLIME_LEAP.range)
        : ability === "slam"
          ? clampTo(position, target, KING_SLAM.range)
          : ability === "escape"
            ? awayFrom(position, target, FIZBAN_ESCAPE.distance)
            : { x: target.x, y: target.y };
    const cooldowns = plan.cooldownMs ? { ...timers.cooldowns, [ability]: plan.cooldownMs } : timers.cooldowns;
    return {
      mind: { mode: "ability", ability, targetId: mind.targetId, phase: "prep", remainingMs: plan.prepMs, angle, aim, alert: mind.alert },
      timers: { cooldowns, holdMs: ability === "throw" ? 0 : timers.holdMs },
    };
  }
  return undefined;
}

// Se o ataque pode começar agora (distância e recarga) e quanto dura o preparo e a recarga dele.
function abilityPlan(ability: MobAbility, gap: number, timers: MobTimers, ready: boolean): { prepMs: number; cooldownMs?: number } | undefined {
  switch (ability) {
    case "dash":
      return ready && gap >= GOBLIN_DASH.min && gap <= GOBLIN_DASH.max ? { prepMs: GOBLIN_DASH.windupMs, cooldownMs: GOBLIN_DASH.cooldownMs } : undefined;
    case "throw":
      return timers.holdMs >= GOBLIN_THROW.holdMs ? { prepMs: GOBLIN_THROW.windupMs } : undefined;
    case "pounce":
      return ready && gap >= WOLF_POUNCE.min && gap <= WOLF_POUNCE.max ? { prepMs: WOLF_POUNCE.crouchMs, cooldownMs: WOLF_POUNCE.cooldownMs } : undefined;
    case "leap":
      return gap <= SLIME_LEAP.range ? { prepMs: SLIME_LEAP.crouchMs } : undefined;
    case "crystal":
      return ready && gap <= GNOME_CASTER.keepMax + 32 ? { prepMs: GNOME_CASTER.castMs, cooldownMs: GNOME_CASTER.crystalCooldownMs } : undefined;
    case "bolt":
      return ready && gap <= GNOME_CASTER.boltRange ? { prepMs: GNOME_CASTER.castMs, cooldownMs: GNOME_CASTER.boltCooldownMs } : undefined;
    case "tornado":
      return ready && gap <= KRAG_TORNADO.max ? { prepMs: KRAG_TORNADO.poseMs, cooldownMs: KRAG_TORNADO.cooldownMs } : undefined;
    case "kick":
      return ready && gap >= KRAG_KICK.min && gap <= KRAG_KICK.max ? { prepMs: KRAG_KICK.windupMs, cooldownMs: KRAG_KICK.cooldownMs } : undefined;
    case "slam":
      return ready && gap <= KING_SLAM.range ? { prepMs: KING_SLAM.crouchMs, cooldownMs: KING_SLAM.cooldownMs } : undefined;
    case "explosion":
      return ready && gap <= KING_EXPLOSION.max ? { prepMs: KING_EXPLOSION.warnMs, cooldownMs: KING_EXPLOSION.cooldownMs } : undefined;
    case "potions":
      return ready && gap <= FIZBAN_POTIONS.max ? { prepMs: FIZBAN_POTIONS.windupMs, cooldownMs: FIZBAN_POTIONS.cooldownMs } : undefined;
    case "escape":
      return ready && gap <= FIZBAN_ESCAPE.trigger ? { prepMs: FIZBAN_ESCAPE.crouchMs, cooldownMs: FIZBAN_ESCAPE.cooldownMs } : undefined;
    case "howl":
      return ready && gap <= FENRIR_HOWL.max ? { prepMs: FENRIR_HOWL.prepMs, cooldownMs: FENRIR_HOWL.cooldownMs } : undefined;
    case "claws":
      return ready && gap >= FENRIR_CLAW.min && gap <= FENRIR_CLAW.max ? { prepMs: FENRIR_CLAW.windupMs, cooldownMs: FENRIR_CLAW.cooldownMs } : undefined;
  }
}

// O ponto a `distance` px de `from`, para o lado oposto de `threat` (a fuga do Fizban).
function awayFrom(from: Vec2, threat: Vec2, distance: number): Vec2 {
  const d = Math.hypot(from.x - threat.x, from.y - threat.y);
  const dir = d > 0 ? { x: (from.x - threat.x) / d, y: (from.y - threat.y) / d } : { x: 1, y: 0 };
  return { x: from.x + dir.x * distance, y: from.y + dir.y * distance };
}

// O ponto `to`, trazido para no máximo `max` px de `from`.
function clampTo(from: Vec2, to: Vec2, max: number): Vec2 {
  const d = distance(from, to);
  if (d <= max) return { x: to.x, y: to.y };
  return { x: from.x + ((to.x - from.x) * max) / d, y: from.y + ((to.y - from.y) * max) / d };
}

// Gnomo: perto demais, recua (anda para longe do alvo); entre KEEP_MIN e KEEP_MAX, fica parado conjurando. Recuar
// travado (parede atrás) com o alvo colado: golpe de perto. Longe demais: undefined (persegue como os outros).
function keepDistance(
  mob: ThinkingMob,
  mind: Extract<MobMind, { mode: "chase" }>,
  world: MobWorld,
  target: Vec2,
  gap: number,
  stopAt: number,
  dtMs: number,
): ThinkingMob | undefined {
  if (gap > GNOME_CASTER.keepMax) return undefined;
  if (gap >= GNOME_CASTER.keepMin) return { position: mob.position, mind };
  const away = gap > 0 ? { x: (mob.position.x - target.x) / gap, y: (mob.position.y - target.y) / gap } : { x: 1, y: 0 };
  const goal = { x: mob.position.x + away.x * 32, y: mob.position.y + away.y * 32 };
  const moved = followPath(mob.position, [], goal, world, dtMs);
  const expected = (world.stats.speed * dtMs) / 1000;
  if (distance(moved.position, mob.position) >= expected * 0.25 || gap > stopAt) return { position: moved.position, mind };
  const angle = Math.atan2(target.y - mob.position.y, target.x - mob.position.x);
  return { position: mob.position, mind: { mode: "windup", targetId: mind.targetId, angle, remainingMs: world.stats.windupMs, alert: mind.alert } };
}

// Um tick de ataque especial. Preparo: parado, até acabar; aí atira, conjura ou parte. Movimento: investida (até
// encostar, termina numa facada), bote e pulo (até o ponto, terminam num impacto).
function stepAbility(mob: ThinkingMob, mind: Extract<MobMind, { mode: "ability" }>, world: MobWorld, dtMs: number): MobStep {
  const remainingMs = mind.remainingMs - dtMs;
  const target = world.players.get(mind.targetId);
  if (mind.phase === "prep") {
    if (remainingMs > 0) return { position: mob.position, mind: { ...mind, remainingMs } };
    return finishPrep(mob.position, mind, target);
  }
  if (mind.ability === "dash") return stepDash(mob.position, mind, world, target, remainingMs, dtMs);
  if (mind.ability === "tornado") return stepTornado(mob.position, mind, world, target, remainingMs, dtMs);
  return stepLeap(mob.position, mind, world, remainingMs, dtMs);
}

const recover = (mind: Extract<MobMind, { mode: "ability" }>, remainingMs: number): MobMind => ({
  mode: "recover",
  targetId: mind.targetId,
  remainingMs,
  alert: mind.alert,
});

function finishPrep(position: Vec2, mind: Extract<MobMind, { mode: "ability" }>, target: Vec2 | undefined): MobStep {
  const towards = target ? Math.atan2(target.y - position.y, target.x - position.x) : mind.angle;
  switch (mind.ability) {
    case "throw":
      return { position, mind: recover(mind, CAST_RECOVER_MS), events: [{ type: "projectile", kind: "dagger", from: position, angle: towards }] };
    case "bolt":
      return { position, mind: recover(mind, CAST_RECOVER_MS), events: [{ type: "projectile", kind: "gnome", from: position, angle: towards }] };
    case "crystal":
      return { position, mind: recover(mind, CAST_RECOVER_MS), events: [{ type: "crystal", at: target ? { x: target.x, y: target.y } : mind.aim }] };
    case "dash":
      return { position, mind: { ...mind, phase: "act", remainingMs: GOBLIN_DASH.maxMs, angle: towards } };
    case "pounce":
      return { position, mind: { ...mind, phase: "act", remainingMs: WOLF_POUNCE.maxAirMs } };
    case "leap":
      return { position, mind: { ...mind, phase: "act", remainingMs: SLIME_LEAP.airMs } };
    case "slam":
      return { position, mind: { ...mind, phase: "act", remainingMs: KING_SLAM.airMs } };
    case "tornado":
      return { position, mind: { ...mind, phase: "act", remainingMs: KRAG_TORNADO.durationMs } };
    case "kick":
      return { position, mind: recover(mind, KRAG_KICK.recoverMs), events: [{ type: "crack", from: position, angle: towards }] };
    case "explosion":
      return { position, mind: recover(mind, KING_EXPLOSION.recoverMs), events: [{ type: "blast", at: position }] };
    case "potions":
      return { position, mind: recover(mind, CAST_RECOVER_MS), events: [{ type: "potions", target: target ? { x: target.x, y: target.y } : mind.aim }] };
    case "escape":
      return { position, mind: { ...mind, phase: "act", remainingMs: FIZBAN_ESCAPE.airMs }, events: [{ type: "smoke", at: position }] };
    case "howl":
      return { position, mind: recover(mind, CAST_RECOVER_MS), events: [{ type: "howl", at: position }] };
    case "claws":
      return { position, mind: recover(mind, FENRIR_CLAW.recoverMs), events: [{ type: "claw", from: position, angle: towards }] };
  }
}

// Tornado do Krag: persegue o alvo (ou o ponto de onde ele estava) mais rápido, girando: cada tick avisa onde está
// (spin; o servidor dá o dano de área). No fim do tempo, volta a ser o Krag.
function stepTornado(position: Vec2, mind: Extract<MobMind, { mode: "ability" }>, world: MobWorld, target: Vec2 | undefined, remainingMs: number, dtMs: number): MobStep {
  const goal = target ?? mind.aim;
  const fast = { ...world, stats: { ...world.stats, speed: world.stats.speed * KRAG_TORNADO.speedFactor } };
  // Já em cima do alvo (distância ~0): fica onde está, sem calcular direção (nada de dividir por zero).
  const close = Math.hypot(goal.x - position.x, goal.y - position.y) < 0.001;
  const moved = close ? { position } : followPath(position, [], goal, fast, dtMs);
  const events: MobEvent[] = [{ type: "spin", at: moved.position }];
  if (remainingMs > 0) return { position: moved.position, mind: { ...mind, remainingMs }, events };
  return { position: moved.position, mind: recover(mind, KRAG_TORNADO.recoverMs), events };
}

// Investida do goblin: corre até encostar no alvo (ou acabar o tempo) e dá a facada (o golpe normal, na hora).
function stepDash(position: Vec2, mind: Extract<MobMind, { mode: "ability" }>, world: MobWorld, target: Vec2 | undefined, remainingMs: number, dtMs: number): MobStep {
  const goal = target ?? mind.aim;
  const stopAt = world.stats.size / 2 + PLAYER_SIZE / 2 + world.stats.reach;
  const fast = { ...world, stats: { ...world.stats, speed: world.stats.speed * GOBLIN_DASH.speedFactor } };
  const moved = followPath(position, [], goal, fast, dtMs);
  const angle = Math.atan2(goal.y - moved.position.y, goal.x - moved.position.x);
  if (distance(moved.position, goal) > stopAt && remainingMs > 0) return { position: moved.position, mind: { ...mind, remainingMs, angle } };
  return { position: moved.position, mind: recover(mind, world.stats.recoverMs), strike: angle };
}

// Bote do lobo e pulo do slime: voa em linha reta até o ponto (o bote a WOLF_POUNCE.speed; o pulo chega no fim do
// AIR_MS); parede no caminho para antes. Ao chegar (ou acabar o tempo), o impacto.
function stepLeap(position: Vec2, mind: Extract<MobMind, { mode: "ability" }>, world: MobWorld, remainingMs: number, dtMs: number): MobStep {
  const left = distance(position, mind.aim);
  const speed = mind.ability === "pounce" ? WOLF_POUNCE.speed : (left * 1000) / Math.max(dtMs, mind.remainingMs);
  const flying = { ...world, stats: { ...world.stats, speed } };
  const moved = followPath(position, [], mind.aim, flying, dtMs);
  const stuck = distance(moved.position, position) < 0.5 && left > 1;
  if (distance(moved.position, mind.aim) > 2 && remainingMs > 0 && !stuck) return { position: moved.position, mind: { ...mind, remainingMs } };
  // O pulo de fuga do Fizban só pousa (a fumaça saiu na partida).
  if (mind.ability === "escape") return { position: moved.position, mind: recover(mind, FIZBAN_ESCAPE.recoverMs) };
  const after = mind.ability === "pounce" ? WOLF_POUNCE.recoverMs : mind.ability === "slam" ? KING_SLAM.recoverMs : SLIME_LEAP.recoverMs;
  return { position: moved.position, mind: recover(mind, after), events: [{ type: "impact", ability: mind.ability as "pounce" | "leap" | "slam", at: moved.position }] };
}

// Preparando: parado, direção travada. Não é interrompido por dano. Ao terminar, golpeia e passa a se recuperar.
function stepWindup(mob: ThinkingMob, mind: Extract<MobMind, { mode: "windup" }>, world: MobWorld, dtMs: number): MobStep {
  const remainingMs = mind.remainingMs - dtMs;
  if (remainingMs > 0) return { position: mob.position, mind: { ...mind, remainingMs } };
  return {
    position: mob.position,
    mind: { mode: "recover", targetId: mind.targetId, remainingMs: world.stats.recoverMs, alert: mind.alert },
    strike: mind.angle,
  };
}

// Recuperando: parado. Depois volta a perseguir o mesmo alvo (ou desiste, se ele tiver saído da sala).
function stepRecover(mob: ThinkingMob, mind: Extract<MobMind, { mode: "recover" }>, dtMs: number): ThinkingMob {
  const remainingMs = mind.remainingMs - dtMs;
  if (remainingMs > 0) return { position: mob.position, mind: { ...mind, remainingMs } };
  return {
    position: mob.position,
    // Sem caminho ainda: o intervalo já vencido, para calcular no primeiro tick.
    mind: { mode: "chase", targetId: mind.targetId, lastSeen: mob.position, lostMs: 0, path: [], sinceRepathMs: PATH_RECALC_MS, alert: mind.alert },
  };
}

// Atingido de longe (Projétil Mágico): o mob que estava vagando ou voltando para casa sai atrás de quem atirou, rumo
// ao ponto de onde veio o tiro (lastSeen), mesmo sem tê-lo notado; se não o enxergar no caminho, desiste como em
// qualquer perseguição (MOB_LOSE_TRACK_MS). Quem já está perseguindo, preparando ou recuperando segue como está.
export function provoke(mind: MobMind, targetId: string, from: Vec2): MobMind {
  if (mind.mode !== "wander" && mind.mode !== "idle" && mind.mode !== "return") return mind;
  // Voltando pela coleira: imune, não se deixa puxar de novo.
  if (mind.mode === "return" && (mind.immuneMs ?? 0) > 0) return mind;
  return { mode: "chase", targetId, lastSeen: { x: from.x, y: from.y }, lostMs: 0, path: [], sinceRepathMs: PATH_RECALC_MS };
}

// Alarme de um portal (canalização): o mob larga o que fazia (vagando, em repouso, voltando, até pela coleira, ou
// perseguindo outro) e corre para `at`, caçando `targetId` (quem canaliza), sem coleira (ver `alert`). No meio de um
// golpe (preparando ou recuperando), termina o golpe primeiro e segue o alvo que já tinha.
export function alarm(mind: MobMind, targetId: string, at: Vec2): MobMind {
  if (mind.mode === "windup" || mind.mode === "recover") return { ...mind, alert: true };
  return { mode: "chase", targetId, lastSeen: { x: at.x, y: at.y }, lostMs: 0, path: [], sinceRepathMs: PATH_RECALC_MS, alert: true };
}

function stepReturning(
  mob: ThinkingMob,
  mind: Extract<MobMind, { mode: "return" }>,
  world: MobWorld,
  dtMs: number,
  random: () => number,
): ThinkingMob {
  const immuneMs = Math.max(0, (mind.immuneMs ?? 0) - dtMs);
  if (immuneMs === 0) {
    const spotted = noticeTarget(mob.position, world);
    if (spotted) return { position: mob.position, mind: startChase(mob.position, spotted, world.grid) };
  }
  const goal = mind.path.at(-1);
  // Acabou o trecho: já em casa, vaga (ou repousa no posto); ainda fora (trecho parcial), calcula o próximo.
  if (!goal) {
    if (world.post && sameTile(world.grid, mob.position, world.post.home)) return { position: mob.position, mind: { mode: "idle", path: [], waitMs: 0, leg: 0 } };
    const next = giveUp(mob.position, world, random);
    // Sem caminho que avance: repousa onde está em vez de travar.
    if (next.mode === "return" && next.path.length === 0) return { position: mob.position, mind: { mode: "idle", path: [], waitMs: 0, leg: 0 } };
    return { position: mob.position, mind: next.mode === "return" ? { ...next, immuneMs } : next };
  }
  // Mob de grupo volta ao posto LEASH.returnSpeed x mais rápido.
  const fast = world.post ? { ...world, stats: { ...world.stats, speed: world.stats.speed * LEASH.returnSpeed } } : world;
  const moved = followPath(mob.position, mind.path, goal, fast, dtMs);
  return { position: moved.position, mind: { mode: "return", path: moved.path, immuneMs } };
}

// Hibernação: mob vagando (ou em repouso no posto) sem nenhum jogador a menos de MOB_WAKE_RADIUS pode ficar parado, sem pensar (o servidor
// pula o tick dele). Perseguindo, voltando, preparando ou se recuperando, nunca: termina o que estava fazendo.
export function isDormant(mob: ThinkingMob, players: ReadonlyMap<string, Vec2>): boolean {
  if (mob.mind.mode !== "wander" && mob.mind.mode !== "idle") return false;
  for (const player of players.values()) if (distance(mob.position, player) < MOB_WAKE_RADIUS) return false;
  return true;
}

// Um tick da cabeça de um mob: vagar, perseguir, golpear ou voltar para casa. `random` vem de fora para ser testável.
export function stepMob(mob: ThinkingMob, world: MobWorld, dtMs: number, random: () => number): MobStep {
  const timers = tickTimers(mob.timers, dtMs);
  const step = thinkStep({ ...mob, timers }, world, dtMs, random);
  return { ...step, timers: step.timers ?? timers };
}

function thinkStep(mob: ThinkingMob, world: MobWorld, dtMs: number, random: () => number): MobStep {
  switch (mob.mind.mode) {
    case "wander":
      return stepWandering(mob, mob.mind.wander, world, dtMs, random);
    case "idle":
      return world.post ? stepIdle(mob, mob.mind, world, dtMs, random) : { position: mob.position, mind: { mode: "wander", wander: startIdle(random) } };
    case "chase":
      return stepChasing(mob, mob.mind, world, dtMs, random);
    case "return":
      return stepReturning(mob, mob.mind, world, dtMs, random);
    case "windup":
      return stepWindup(mob, mob.mind, world, dtMs);
    case "recover":
      return stepRecover(mob, mob.mind, dtMs);
    case "ability":
      return stepAbility(mob, mob.mind, world, dtMs);
  }
}
