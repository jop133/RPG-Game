import { STASH_SLOTS } from "./balance";
import { addItems, type Inventory } from "./inventory";

// Baú da linhagem: o mesmo formato do inventário (um item por slot, ou null), com STASH_SLOTS slots.
export type Stash = Inventory;

// Baú guardado na linhagem → baú em jogo. Nada guardado = vazio. Completa com vazios se STASH_SLOTS crescer.
export function restoreStash(saved: Stash | null): Stash {
  return Array.from({ length: STASH_SLOTS }, (_, i) => saved?.[i] ?? null);
}

// Clicar num slot da mochila na Estalagem: a pilha vai para o baú.
export function deposit(inventory: Inventory, stash: Stash, slot: number): { inventory: Inventory; stash: Stash } | undefined {
  const moved = moveStack(inventory, slot, stash);
  return moved && { inventory: moved.from, stash: moved.to };
}

// Clicar num slot do baú: a pilha vai para a mochila.
export function withdraw(inventory: Inventory, stash: Stash, slot: number): { inventory: Inventory; stash: Stash } | undefined {
  const moved = moveStack(stash, slot, inventory);
  return moved && { inventory: moved.to, stash: moved.from };
}

// Leva a pilha do slot `slot` de `from` para `to`: completa as pilhas do mesmo item até maxStack, depois ocupa
// slots vazios. O que não couber fica no slot de origem. undefined = nada mudou (slot vazio ou nada coube).
function moveStack(from: Inventory, slot: number, to: Inventory): { from: Inventory; to: Inventory } | undefined {
  const stack = from[slot];
  if (!stack) return undefined;
  const added = addItems(to, stack.item, stack.count);
  if (added.leftover === stack.count) return undefined;
  const rest = [...from];
  rest[slot] = added.leftover > 0 ? { item: stack.item, count: added.leftover } : null;
  return { from: rest, to: added.inventory };
}
