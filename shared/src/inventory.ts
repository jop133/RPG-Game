import { HUNGER_MAX, INVENTORY_SLOTS, ITEMS, type ItemId } from "./balance";

export interface ItemStats {
  name: string;
  maxStack: number;
  food?: number;
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

// Vem do cliente: só aceita { slot: inteiro de 0 a INVENTORY_SLOTS - 1 }.
export function parseSlotIndex(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const slot = (raw as Record<string, unknown>).slot;
  return Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < INVENTORY_SLOTS
    ? (slot as number)
    : undefined;
}

// Usa um item do slot escolhido pelo jogador. Comida: gasta uma e recupera a fome dela, a qualquer momento;
// o que passar do máximo se perde (a escolha é do jogador). undefined se o slot está vazio ou o item não é usável.
export function useSlot(
  inventory: Inventory,
  slotIndex: number,
  hunger: number,
): { inventory: Inventory; hunger: number } | undefined {
  const slot = inventory[slotIndex];
  const food = slot ? (ITEMS[slot.item] as ItemStats).food : undefined;
  if (!slot || food === undefined) return undefined;
  const slots = [...inventory];
  slots[slotIndex] = slot.count > 1 ? { item: slot.item, count: slot.count - 1 } : null;
  return { inventory: slots, hunger: Math.min(HUNGER_MAX, hunger + food) };
}
