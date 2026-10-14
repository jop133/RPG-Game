import { type ItemId, MOB_DROPS, type MobKind } from "./balance";
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
