import { type Area, areaAt } from "./areas";
import { LEASH, MOB_LOSE_TRACK_MS, MOB_WAKE_RADIUS, PATH_RECALC_MS, PLAYER_SIZE, VIEW_RADIUS } from "./balance";
import { type CollisionGrid, moveWithCollision } from "./collision";
import type { Arc } from "./combat";
import { hasLineOfSight } from "./lineOfSight";
import type { MobStats } from "./mobs";
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
  | { mode: "recover"; targetId: string; remainingMs: number; alert?: boolean };

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
    const delta = { x: ((waypoint.x - pos.x) / gap) * step, y: ((waypoint.y - pos.y) / gap) * step };
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

  // Encostou no alvo à vista: para e começa a preparar o golpe, com a direção travada a partir de agora.
  const stopAt = world.stats.size / 2 + PLAYER_SIZE / 2 + world.stats.reach;
  if (visible && distance(mob.position, target) <= stopAt) {
    const angle = Math.atan2(target.y - mob.position.y, target.x - mob.position.x);
    return {
      position: mob.position,
      mind: { mode: "windup", targetId: mind.targetId, angle, remainingMs: world.stats.windupMs, alert: mind.alert },
    };
  }
  const since = mind.sinceRepathMs + dtMs;
  const route = pathTo(world.grid, mob.position, lastSeen, mind.path, since);
  // Perseguindo, alguns tipos correm mais (chaseSpeedFactor).
  const factor = world.stats.chaseSpeedFactor ?? 1;
  const runner = factor === 1 ? world : { ...world, stats: { ...world.stats, speed: world.stats.speed * factor } };
  const moved = followPath(mob.position, route.path, lastSeen, runner, dtMs);
  // Terminou de andar o caminho neste tick: o próximo recalcula na hora. Um A* que devolveu [] (já está no ponto mais
  // perto de um alvo fora de alcance) não conta: aí espera o intervalo, em vez de rodar de novo a cada tick.
  const ranOut = route.path.length > 0 && moved.path.length === 0;
  const sinceRepathMs = ranOut ? PATH_RECALC_MS : route.repathed ? 0 : since;
  return { position: moved.position, mind: { ...mind, lastSeen, lostMs, path: moved.path, sinceRepathMs } };
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
  }
}
