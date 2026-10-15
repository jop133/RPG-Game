import { describe, expect, it } from "vitest";
import { ITEMS, STASH_SLOTS } from "./balance";
import { emptyInventory, type Inventory, type ItemStack } from "./inventory";
import { deposit, restoreStash, withdraw, type Stash } from "./stash";

const RACAO_STACK = ITEMS.racao.maxStack;
const PELE_STACK = ITEMS.pele_de_lobo.maxStack;

// Monta slots a partir de uma lista curta; o resto fica vazio.
function slots(length: number, items: (ItemStack | null)[]): Inventory {
  return Array.from({ length }, (_, i) => items[i] ?? null);
}
const bag = (items: (ItemStack | null)[]) => slots(emptyInventory().length, items);
const chest = (items: (ItemStack | null)[]): Stash => slots(STASH_SLOTS, items);
const full = (length: number, stack: ItemStack) => slots(length, Array<ItemStack>(length).fill(stack));

describe("restoreStash", () => {
  it("nada guardado (linhagem nova): baú vazio com STASH_SLOTS slots", () => {
    const stash = restoreStash(null);
    expect(stash).toHaveLength(STASH_SLOTS);
    expect(stash.every((slot) => slot === null)).toBe(true);
  });

  it("guardado menor (STASH_SLOTS cresceu): mantém os itens e completa com vazios", () => {
    const stash = restoreStash([{ item: "pele_de_lobo", count: 3 }, null]);
    expect(stash).toHaveLength(STASH_SLOTS);
    expect(stash[0]).toEqual({ item: "pele_de_lobo", count: 3 });
  });
});

describe("deposit", () => {
  it("leva a pilha inteira da mochila para o primeiro slot vazio do baú", () => {
    const result = deposit(bag([null, { item: "pele_de_lobo", count: 4 }]), chest([]), 1);
    expect(result?.inventory[1]).toBeNull();
    expect(result?.stash[0]).toEqual({ item: "pele_de_lobo", count: 4 });
  });

  it("completa a pilha do mesmo item no baú antes de ocupar slot novo", () => {
    const result = deposit(
      bag([{ item: "pele_de_lobo", count: 3 }]),
      chest([{ item: "racao", count: 1 }, { item: "pele_de_lobo", count: PELE_STACK - 1 }]),
      0,
    );
    expect(result?.stash[1]).toEqual({ item: "pele_de_lobo", count: PELE_STACK });
    expect(result?.stash[2]).toEqual({ item: "pele_de_lobo", count: 2 });
    expect(result?.inventory[0]).toBeNull();
  });

  it("baú quase cheio: o que não cabe fica no slot da mochila", () => {
    const almost = slots(STASH_SLOTS, [
      ...Array<ItemStack>(STASH_SLOTS - 1).fill({ item: "racao", count: RACAO_STACK }),
      { item: "pele_de_lobo", count: PELE_STACK - 2 },
    ]);
    const result = deposit(bag([{ item: "pele_de_lobo", count: 5 }]), almost, 0);
    expect(result?.stash[STASH_SLOTS - 1]).toEqual({ item: "pele_de_lobo", count: PELE_STACK });
    expect(result?.inventory[0]).toEqual({ item: "pele_de_lobo", count: 3 });
  });

  it("baú cheio sem pilha do mesmo item, ou slot vazio: nada muda", () => {
    const stuffed = full(STASH_SLOTS, { item: "racao", count: RACAO_STACK });
    expect(deposit(bag([{ item: "pele_de_lobo", count: 1 }]), stuffed, 0)).toBeUndefined();
    expect(deposit(bag([]), chest([]), 0)).toBeUndefined();
  });

  it("não altera as listas recebidas", () => {
    const inventory = bag([{ item: "pele_de_lobo", count: 4 }]);
    const stash = chest([]);
    deposit(inventory, stash, 0);
    expect(inventory[0]).toEqual({ item: "pele_de_lobo", count: 4 });
    expect(stash[0]).toBeNull();
  });
});

describe("withdraw", () => {
  it("leva a pilha do baú para a mochila, completando a ração que já está lá", () => {
    const result = withdraw(bag([{ item: "racao", count: 2 }]), chest([null, null, { item: "racao", count: 4 }]), 2);
    expect(result?.inventory[0]).toEqual({ item: "racao", count: RACAO_STACK });
    expect(result?.inventory[1]).toEqual({ item: "racao", count: 4 - (RACAO_STACK - 2) });
    expect(result?.stash[2]).toBeNull();
  });

  it("mochila cheia: o resto fica no baú; sem espaço nenhum, nada muda", () => {
    const almost = slots(emptyInventory().length, [
      ...Array<ItemStack>(emptyInventory().length - 1).fill({ item: "pele_de_lobo", count: PELE_STACK }),
      { item: "racao", count: RACAO_STACK - 1 },
    ]);
    const result = withdraw(almost, chest([{ item: "racao", count: 3 }]), 0);
    expect(result?.inventory.at(-1)).toEqual({ item: "racao", count: RACAO_STACK });
    expect(result?.stash[0]).toEqual({ item: "racao", count: 2 });
    const stuffed = full(emptyInventory().length, { item: "pele_de_lobo", count: PELE_STACK });
    expect(withdraw(stuffed, chest([{ item: "racao", count: 1 }]), 0)).toBeUndefined();
  });
});
