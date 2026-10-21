import { GROUND_DROPS, type ItemId, MOB_DROPS, type MobKind } from "./balance";
import { boxFits, type CollisionGrid } from "./collision";
import { lightReaches } from "./light";
import { type Inventory, type ItemStack, addItems } from "./inventory";
import type { Vec2 } from "./movement";

export interface DropEntry {
  item: ItemId;
  chance: number;
  min: number;
  max: number;
}

// O que um mob larga ao morrer. `random` devolve [0, 1); vem de fora para ser testável.
export function rollDrops(kind: MobKind, random: () => number): ItemStack[] {
  const drops: ItemStack[] = [];
  for (const entry of MOB_DROPS[kind]) {
    if (random() >= entry.chance) continue;
    const count = entry.min + Math.floor(random() * (entry.max - entry.min + 1));
    drops.push({ item: entry.item, count });
  }
  return drops;
}

// Cada unidade do que caiu, à parte (cada uma vira um item no chão).
export function dropUnits(drops: readonly ItemStack[]): ItemId[] {
  return drops.flatMap((stack) => Array.from({ length: stack.count }, () => stack.item));
}

// Onde cada um de `count` itens novos fica no chão, em volta de `center`: em anéis (espiral), o mais perto possível,
// a pelo menos GROUND_DROPS.minDistance px de todo item que já está no chão (`taken`) e dos outros novos; fora de
// parede e sem parede entre o ponto e `center` (nada vai parar do outro lado do muro). Sem lugar livre: no centro.
export function placeDrops(center: Vec2, count: number, taken: readonly Vec2[], grid: CollisionGrid): Vec2[] {
  const { minDistance, maxRings, radius } = GROUND_DROPS;
  const used: Vec2[] = [...taken];
  const out: Vec2[] = [];
  const free = (p: Vec2) =>
    boxFits(grid, p, radius) && lightReaches(grid, center, p) && used.every((u) => Math.hypot(u.x - p.x, u.y - p.y) >= minDistance - 1e-6);
  for (let i = 0; i < count; i++) {
    let spot: Vec2 | undefined;
    for (let ring = 0; ring <= maxRings && !spot; ring++) {
      const r = ring * minDistance;
      const steps = ring === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / minDistance));
      for (let k = 0; k < steps && !spot; k++) {
        const a = (k / steps) * Math.PI * 2 + ring * 0.5;
        const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
        if (free(p)) spot = p;
      }
    }
    const chosen = spot ?? { x: center.x, y: center.y };
    used.push(chosen);
    out.push(chosen);
  }
  return out;
}

// Todas as pilhas a até `radius` (para pegar tudo de uma vez), da mais perto para a mais longe.
export function allWithin(position: Vec2, points: ReadonlyMap<string, Vec2>, radius: number): string[] {
  return [...points]
    .map(([id, p]) => ({ id, d: Math.hypot(p.x - position.x, p.y - position.y) }))
    .filter((e) => e.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map((e) => e.id);
}

// Tudo o que o jogador carregava, juntando pilhas do mesmo item: vira a pilha deixada no chão quando ele morre.
export function inventoryToPile(inventory: Inventory): ItemStack[] {
  const totals = new Map<ItemId, number>();
  for (const slot of inventory) {
    if (slot) totals.set(slot.item, (totals.get(slot.item) ?? 0) + slot.count);
  }
  return [...totals].map(([item, count]) => ({ item, count }));
}

// Passa da pilha para o inventário o que couber. O que sobra continua na pilha.
export function takeFromPile(inventory: Inventory, pile: readonly ItemStack[]): { inventory: Inventory; pile: ItemStack[] } {
  let current = inventory;
  const rest: ItemStack[] = [];
  for (const stack of pile) {
    const { inventory: next, leftover } = addItems(current, stack.item, stack.count);
    current = next;
    if (leftover > 0) rest.push({ item: stack.item, count: leftover });
  }
  return { inventory: current, pile: rest };
}

// Id da pilha mais próxima dentro do alcance, ou undefined.
export function nearestWithin(position: Vec2, points: ReadonlyMap<string, Vec2>, radius: number): string | undefined {
  let best: { id: string; distance: number } | undefined;
  for (const [id, p] of points) {
    const distance = Math.hypot(p.x - position.x, p.y - position.y);
    if (distance <= radius && (!best || distance < best.distance)) best = { id, distance };
  }
  return best?.id;
}
