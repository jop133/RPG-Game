import { IDLE, MOB_SPAWN_SAFE_RADIUS, PACKS, type MobKind } from "./balance";
import { isSolid, type CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

// Spawns táticos: em vez de mobs soltos pela zona inteira, grupos (packs) de 2 a 4, um por setor, cada um com o seu
// posto (home). O mob volta ao posto quando desiste (coleira) e, sem aggro, leva a vida dele em volta do posto
// (IdlePlan). Funções puras: o servidor sorteia com o random dele.

export interface PackPlan {
  kind: MobKind;
  home: Vec2;
  members: Vec2[];
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function between(range: { min: number; max: number }, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

// Os grupos de uma zona: os tiles de chão dela (centros) divididos em setores; cada setor com chão bastante ganha um
// grupo, se o posto ficar longe dos postos já escolhidos e das entradas (`avoid`). O posto é o tile mais perto do meio
// do chão do setor (ou, se esse estiver perto demais de outro posto, um tile sorteado do setor, algumas tentativas).
export function planPacks(cells: readonly Vec2[], kind: MobKind, tileSize: number, avoid: readonly Vec2[], random: () => number): PackPlan[] {
  const sectorPx = PACKS.sectorTiles * tileSize;
  const sectors = new Map<string, Vec2[]>();
  for (const cell of cells) {
    const key = `${Math.floor(cell.x / sectorPx)},${Math.floor(cell.y / sectorPx)}`;
    sectors.set(key, [...(sectors.get(key) ?? []), cell]);
  }
  const homes: Vec2[] = [];
  const packs: PackPlan[] = [];
  const allowed = (p: Vec2) =>
    homes.every((h) => distance(h, p) >= PACKS.minDistance) && avoid.every((a) => distance(a, p) >= MOB_SPAWN_SAFE_RADIUS);
  for (const sectorCells of shuffled([...sectors.values()], random)) {
    if (sectorCells.length < PACKS.minSectorCells) continue;
    const mid = {
      x: sectorCells.reduce((s, c) => s + c.x, 0) / sectorCells.length,
      y: sectorCells.reduce((s, c) => s + c.y, 0) / sectorCells.length,
    };
    const central = sectorCells.reduce((best, c) => (distance(c, mid) < distance(best, mid) ? c : best));
    const candidates = [central, ...Array.from({ length: 8 }, () => sectorCells[Math.floor(random() * sectorCells.length)] as Vec2)];
    const home = candidates.find(allowed);
    if (!home) continue;
    homes.push(home);
    const size = Math.floor(between({ min: PACKS.size.min, max: PACKS.size.max + 1 }, random));
    const near = sectorCells
      .filter((c) => distance(c, home) <= PACKS.spreadTiles * tileSize)
      .sort((a, b) => distance(a, home) - distance(b, home))
      .slice(0, size);
    packs.push({ kind, home: { x: home.x, y: home.y }, members: near.map((c) => ({ x: c.x, y: c.y })) });
  }
  return packs;
}

// ---------------------------------------------------------------- vida em repouso

// O que o mob faz sem aggro, em volta do posto:
// roam: vai a um ponto a 2-4 tiles do posto e para um pouco (goblin, e gnomo sem cristal perto);
// patrol: vai e volta entre a e b (o grupo de lobos inteiro com os mesmos pontos: patrulham juntos);
// visit: anda entre os pontos (os cristais perto do posto, para os gnomos);
// still: fica onde está (slime; o cliente pulsa).
export type IdlePlan =
  | { kind: "roam" }
  | { kind: "still" }
  | { kind: "patrol"; a: Vec2; b: Vec2 }
  | { kind: "visit"; points: Vec2[] };

export function idlePlanFor(kind: MobKind, home: Vec2, grid: CollisionGrid, crystals: readonly Vec2[], random: () => number): IdlePlan {
  if (kind === "slime") return { kind: "still" };
  if (kind === "lobo") return patrolAxis(home, grid, random) ?? { kind: "roam" };
  if (kind === "gnomo") {
    const near = crystals.filter((c) => distance(c, home) <= IDLE.crystalTiles * grid.tileSize);
    if (near.length > 0) return { kind: "visit", points: [home, ...near.map((c) => ({ x: c.x, y: c.y }))] };
  }
  return { kind: "roam" };
}

// Patrulha dos lobos: o eixo (horizontal ou vertical) do corredor em que o posto está, o de mais chão livre seguido,
// cortado entre 5 e 7 tiles e centrado no posto. Sem 5 tiles livres em nenhum eixo, undefined.
export function patrolAxis(home: Vec2, grid: CollisionGrid, random: () => number): IdlePlan | undefined {
  const ts = grid.tileSize;
  const col = Math.floor(home.x / ts);
  const row = Math.floor(home.y / ts);
  const reach = Math.ceil(IDLE.patrolTiles.max / 2) + 1;
  const run = (dc: number, dr: number) => {
    let n = 0;
    while (n < reach && !isSolid(grid, col + dc * (n + 1), row + dr * (n + 1))) n++;
    return n;
  };
  const axes = [
    { dc: 1, dr: 0, back: run(-1, 0), forward: run(1, 0) },
    { dc: 0, dr: 1, back: run(0, -1), forward: run(0, 1) },
  ].sort((a, b) => b.back + b.forward - (a.back + a.forward));
  const axis = axes[0];
  if (!axis || axis.back + axis.forward + 1 < IDLE.patrolTiles.min) return undefined;
  const want = Math.round(between(IDLE.patrolTiles, random));
  const span = Math.min(want, axis.back + axis.forward + 1);
  // Metade para cada lado; o que faltar de um lado (parede perto) vai para o outro.
  const forward = Math.min(axis.forward, span - 1 - Math.min(axis.back, Math.floor((span - 1) / 2)));
  const back = Math.min(axis.back, span - 1 - forward);
  const at = (n: number) => ({ x: (col + axis.dc * n + 0.5) * ts, y: (row + axis.dr * n + 0.5) * ts });
  return { kind: "patrol", a: at(-back), b: at(forward) };
}

// Próximo ponto da ronda (roam): a 2-4 tiles do posto, num tile de chão (algumas tentativas; sem achar, o posto).
export function roamPoint(home: Vec2, grid: CollisionGrid, random: () => number): Vec2 {
  const ts = grid.tileSize;
  for (let i = 0; i < 8; i++) {
    const angle = random() * Math.PI * 2;
    const r = between(IDLE.roamTiles, random) * ts;
    const col = Math.floor((home.x + Math.cos(angle) * r) / ts);
    const row = Math.floor((home.y + Math.sin(angle) * r) / ts);
    if (!isSolid(grid, col, row)) return { x: (col + 0.5) * ts, y: (row + 0.5) * ts };
  }
  return { x: home.x, y: home.y };
}

// Quanto o mob para em cada ponto da vida em repouso.
export function idlePauseMs(random: () => number): number {
  return between(IDLE.pauseMs, random);
}
