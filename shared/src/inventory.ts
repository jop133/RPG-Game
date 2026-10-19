import { HUNGER_MAX, INVENTORY_SLOTS, ITEMS, STARTING_ITEMS, type ItemId } from "./balance";
import type { EquipStats } from "./equipment";
import type { EssenceEffect } from "./stats";

// Raridade do item: por enquanto só decide a moldura do slot no HUD.
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface ItemStats {
  name: string;
  rarity: Rarity;
  maxStack: number;
  food?: number;
  essence?: EssenceEffect;
  equip?: EquipStats;
}

export interface ItemStack {
  item: ItemId;
  count: number;
}

// Um slot por posição; null = vazio. O tamanho é sempre INVENTORY_SLOTS.
export type Inventory = readonly (ItemStack | null)[];

export function emptyInventory(): Inventory {
  return Array<ItemStack | null>(INVENTORY_SLOTS).fill(null);
}

export function countItem(inventory: Inventory, item: ItemId): number {
  return inventory.reduce((sum, slot) => sum + (slot?.item === item ? slot.count : 0), 0);
}

// Guarda o que couber: primeiro completa as pilhas do mesmo item, depois ocupa slots vazios.
// `leftover` é o que não coube.
export function addItems(inventory: Inventory, item: ItemId, count: number): { inventory: Inventory; leftover: number } {
  const maxStack = ITEMS[item].maxStack;
  const slots = [...inventory];
  let remaining = count;
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const slot = slots[i];
    if (slot?.item !== item || slot.count >= maxStack) continue;
    const moved = Math.min(remaining, maxStack - slot.count);
    slots[i] = { item, count: slot.count + moved };
    remaining -= moved;
  }
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (slots[i] !== null) continue;
    const moved = Math.min(remaining, maxStack);
    slots[i] = { item, count: moved };
    remaining -= moved;
  }
  return { inventory: slots, leftover: remaining };
}

// Tira `count` do item, das últimas pilhas para as primeiras. undefined se não houver o bastante.
export function removeItems(inventory: Inventory, item: ItemId, count: number): Inventory | undefined {
  if (countItem(inventory, item) < count) return undefined;
  const slots = [...inventory];
  let remaining = count;
  for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = slots[i];
    if (slot?.item !== item) continue;
    const taken = Math.min(remaining, slot.count);
    slots[i] = slot.count === taken ? null : { item, count: slot.count - taken };
    remaining -= taken;
  }
  return slots;
}

export function startingInventory(items: Partial<Record<ItemId, number>>): Inventory {
  let inventory = emptyInventory();
  for (const [item, count] of Object.entries(items) as [ItemId, number][]) {
    inventory = addItems(inventory, item, count).inventory;
  }
  return inventory;
}

// Inventário guardado no personagem → inventário em jogo. Nada guardado (personagem novo) = kit inicial.
// Completa com slots vazios se INVENTORY_SLOTS tiver crescido desde que foi gravado.
export function restoreInventory(saved: Inventory | null): Inventory {
  if (saved === null) return startingInventory(STARTING_ITEMS);
  return Array.from({ length: INVENTORY_SLOTS }, (_, i) => saved[i] ?? null);
}

// Vem do cliente: só aceita { slot: inteiro de 0 a slots - 1 } (inventário, ou o baú com STASH_SLOTS).
export function parseSlotIndex(raw: unknown, slots = INVENTORY_SLOTS): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const slot = (raw as Record<string, unknown>).slot;
  return Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < slots ? (slot as number) : undefined;
}

// O que o uso de um slot pode mudar no personagem.
export interface UseContext {
  hunger: number;
  essences: readonly ItemId[];
  // Slots de essência = nível.
  essenceSlots: number;
}

export type UseOutcome =
  | { kind: "used"; inventory: Inventory; hunger: number; essences: ItemId[] }
  // Essência sem slot livre: nada é gasto. Tirar essência só com NPC (mais à frente).
  | { kind: "noEssenceSlot" }
  // Slot vazio ou item sem uso (pele, dente).
  | { kind: "nothing" };

// Usa um item do slot escolhido pelo jogador, a qualquer momento e em qualquer lugar.
// Comida: gasta uma e recupera a fome dela; o excesso se perde.
// Essência: gasta uma e ela passa a ocupar um slot de essência, se houver slot livre.
export function useSlot(inventory: Inventory, slotIndex: number, context: UseContext): UseOutcome {
  const slot = inventory[slotIndex];
  if (!slot) return { kind: "nothing" };
  const stats = ITEMS[slot.item] as ItemStats;
  const spent = [...inventory];
  spent[slotIndex] = slot.count > 1 ? { item: slot.item, count: slot.count - 1 } : null;
  if (stats.food !== undefined) {
    const hunger = Math.min(HUNGER_MAX, context.hunger + stats.food);
    return { kind: "used", inventory: spent, hunger, essences: [...context.essences] };
  }
  if (stats.essence !== undefined) {
    if (context.essences.length >= context.essenceSlots) return { kind: "noEssenceSlot" };
    return { kind: "used", inventory: spent, hunger: context.hunger, essences: [...context.essences, slot.item] };
  }
  return { kind: "nothing" };
}
