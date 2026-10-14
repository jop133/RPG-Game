import { describe, expect, it } from "vitest";
import { HUNGER_MAX, INVENTORY_SLOTS, ITEMS, type ItemId } from "./balance";
import {
  type Inventory,
  addItems,
  countItem,
  emptyInventory,
  parseSlotIndex,
  removeItems,
  startingInventory,
  useSlot,
} from "./inventory";

const RACAO_STACK = ITEMS.racao.maxStack;
const PELE_STACK = ITEMS.pele_de_rato.maxStack;
const used = (inv: Inventory) => inv.filter((slot) => slot !== null).length;

describe("addItems", () => {
  it("inventário vazio: ocupa um slot", () => {
    const { inventory, leftover } = addItems(emptyInventory(), "racao", 2);
    expect(leftover).toBe(0);
    expect(inventory[0]).toEqual({ item: "racao", count: 2 });
    expect(used(inventory)).toBe(1);
  });

  it("completa a pilha existente antes de abrir slot novo", () => {
    const first = addItems(emptyInventory(), "racao", RACAO_STACK - 1).inventory;
    const { inventory } = addItems(first, "racao", 3);
    expect(inventory[0]).toEqual({ item: "racao", count: RACAO_STACK });
    expect(inventory[1]).toEqual({ item: "racao", count: 2 });
  });

  it("itens diferentes não se misturam no mesmo slot", () => {
    const withFood = addItems(emptyInventory(), "racao", 1).inventory;
    const { inventory } = addItems(withFood, "pele_de_rato", 1);
    expect(inventory[0]).toEqual({ item: "racao", count: 1 });
    expect(inventory[1]).toEqual({ item: "pele_de_rato", count: 1 });
  });

  it("cheio: devolve o que não coube", () => {
    const full = addItems(emptyInventory(), "pele_de_rato", INVENTORY_SLOTS * PELE_STACK).inventory;
    const { inventory, leftover } = addItems(full, "racao", 4);
    expect(leftover).toBe(4);
    expect(inventory).toEqual(full);
  });

  it("cabe só uma parte: guarda a parte e devolve o resto", () => {
    const almost = addItems(emptyInventory(), "pele_de_rato", (INVENTORY_SLOTS - 1) * PELE_STACK).inventory;
    const { leftover } = addItems(almost, "racao", RACAO_STACK + 2);
    expect(leftover).toBe(2);
  });

  it("não altera o inventário original", () => {
    const original = emptyInventory();
    addItems(original, "racao", 3);
    expect(used(original)).toBe(0);
  });
});

describe("removeItems", () => {
  it("tira das pilhas e libera o slot que zerar", () => {
    const inv = addItems(emptyInventory(), "racao", RACAO_STACK + 1).inventory;
    const after = removeItems(inv, "racao", 1);
    expect(after && countItem(after, "racao")).toBe(RACAO_STACK);
    expect(after && used(after)).toBe(1);
  });

  it("sem o bastante: undefined, nada é tirado", () => {
    const inv = addItems(emptyInventory(), "racao", 2).inventory;
    expect(removeItems(inv, "racao", 3)).toBeUndefined();
  });
});

describe("startingInventory", () => {
  it("monta o inventário inicial a partir de quantidades por item", () => {
    const inv = startingInventory({ racao: 3, pele_de_rato: 2 });
    expect(countItem(inv, "racao")).toBe(3);
    expect(countItem(inv, "pele_de_rato")).toBe(2);
    expect(inv).toHaveLength(INVENTORY_SLOTS);
  });
});

describe("useSlot", () => {
  const ctx = (hunger: number, essences: ItemId[] = [], essenceSlots = 1) => ({ hunger, essences, essenceSlots });

  it("ração no slot escolhido: gasta uma e recupera a fome dela", () => {
    const result = useSlot(startingInventory({ racao: 3 }), 0, ctx(10));
    expect(result.kind).toBe("used");
    if (result.kind !== "used") return;
    expect(countItem(result.inventory, "racao")).toBe(2);
    expect(result.hunger).toBe(10 + ITEMS.racao.food);
  });

  it("come a qualquer momento, mesmo com a fome cheia; o excesso se perde", () => {
    const result = useSlot(startingInventory({ racao: 1 }), 0, ctx(HUNGER_MAX));
    expect(result.kind === "used" && result.hunger).toBe(HUNGER_MAX);
    expect(result.kind === "used" && countItem(result.inventory, "racao")).toBe(0);
  });

  it("tira do slot escolhido, não de outro", () => {
    const inv = addItems(startingInventory({ pele_de_rato: 1 }), "racao", ITEMS.racao.maxStack + 1).inventory;
    // slot 0: pele, slot 1: pilha cheia de ração, slot 2: 1 ração
    const result = useSlot(inv, 1, ctx(10));
    expect(result.kind === "used" && result.inventory[1]).toEqual({ item: "racao", count: ITEMS.racao.maxStack - 1 });
    expect(result.kind === "used" && result.inventory[2]).toEqual({ item: "racao", count: 1 });
  });

  it("última unidade: o slot fica vazio", () => {
    const result = useSlot(startingInventory({ racao: 1 }), 0, ctx(10));
    expect(result.kind === "used" && result.inventory[0]).toBeNull();
  });

  it("slot vazio ou item sem uso: nada acontece", () => {
    expect(useSlot(emptyInventory(), 0, ctx(10)).kind).toBe("nothing");
    expect(useSlot(startingInventory({ pele_de_rato: 2 }), 0, ctx(10)).kind).toBe("nothing");
  });

  it("essência com slot livre: gasta uma e ela passa a ocupar um slot", () => {
    const result = useSlot(startingInventory({ essencia_rato: 2 }), 0, ctx(50, [], 2));
    expect(result.kind).toBe("used");
    if (result.kind !== "used") return;
    expect(result.essences).toEqual(["essencia_rato"]);
    expect(countItem(result.inventory, "essencia_rato")).toBe(1);
    expect(result.hunger).toBe(50);
  });

  it("essências se acumulam até o número de slots", () => {
    const result = useSlot(startingInventory({ essencia_goblin: 1 }), 0, ctx(50, ["essencia_rato"], 2));
    expect(result.kind === "used" && result.essences).toEqual(["essencia_rato", "essencia_goblin"]);
  });

  it("sem slot de essência livre: recusa e não gasta nada", () => {
    expect(useSlot(startingInventory({ essencia_rato: 1 }), 0, ctx(50, ["essencia_goblin"], 1)).kind).toBe("noEssenceSlot");
  });
});

describe("parseSlotIndex", () => {
  it("aceita inteiros dentro do inventário", () => {
    expect(parseSlotIndex({ slot: 0 })).toBe(0);
    expect(parseSlotIndex({ slot: INVENTORY_SLOTS - 1 })).toBe(INVENTORY_SLOTS - 1);
  });

  it("recusa fora do inventário, fração, texto e lixo (cliente malicioso)", () => {
    expect(parseSlotIndex({ slot: -1 })).toBeUndefined();
    expect(parseSlotIndex({ slot: INVENTORY_SLOTS })).toBeUndefined();
    expect(parseSlotIndex({ slot: 1.5 })).toBeUndefined();
    expect(parseSlotIndex({ slot: "1" })).toBeUndefined();
    expect(parseSlotIndex(null)).toBeUndefined();
  });
});
