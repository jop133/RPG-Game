import { describe, expect, it } from "vitest";
import { INVENTORY_SLOTS, ITEMS, MOB_DROPS } from "./balance";
import { addItems, countItem, emptyInventory, startingInventory } from "./inventory";
import { inventoryToPile, nearestWithin, rollDrops, takeFromPile } from "./loot";

function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("rollDrops", () => {
  it("sorteio abaixo da chance: cai o item, na quantidade sorteada", () => {
    // goblin: dente (chance 1, 1–2) e ração (chance 0.25). Sorteios: dente cai (0), quantidade alta (0.99);
    // ração cai (0.1 < 0.25), quantidade (0).
    expect(rollDrops("goblin", sequence(0, 0.99, 0.1, 0))).toEqual([
      { item: "dente_de_goblin", count: 2 },
      { item: "racao", count: 1 },
    ]);
  });

  it("sorteio acima da chance: o item não cai", () => {
    // dente sempre cai; ração com 0.9 >= 0.25 não cai.
    expect(rollDrops("goblin", sequence(0, 0, 0.9))).toEqual([{ item: "dente_de_goblin", count: 1 }]);
  });

  it("quantidade sempre dentro de [min, max], para qualquer sorteio", () => {
    for (let i = 0; i < 200; i++) {
      for (const drop of rollDrops("goblin", Math.random)) {
        const entry = MOB_DROPS.goblin.find((e) => e.item === drop.item);
        expect(drop.count).toBeGreaterThanOrEqual(entry?.min ?? 0);
        expect(drop.count).toBeLessThanOrEqual(entry?.max ?? 0);
      }
    }
  });
});

describe("inventoryToPile", () => {
  it("junta as pilhas do mesmo item e ignora slots vazios", () => {
    const inv = addItems(startingInventory({ racao: ITEMS.racao.maxStack + 2 }), "pele_de_rato", 3).inventory;
    expect(inventoryToPile(inv)).toEqual([
      { item: "racao", count: ITEMS.racao.maxStack + 2 },
      { item: "pele_de_rato", count: 3 },
    ]);
  });

  it("inventário vazio: pilha vazia", () => {
    expect(inventoryToPile(emptyInventory())).toEqual([]);
  });
});

describe("takeFromPile", () => {
  it("cabe tudo: o inventário recebe e a pilha fica vazia", () => {
    const { inventory, pile } = takeFromPile(startingInventory({ racao: 1 }), [
      { item: "racao", count: 2 },
      { item: "dente_de_goblin", count: 1 },
    ]);
    expect(countItem(inventory, "racao")).toBe(3);
    expect(countItem(inventory, "dente_de_goblin")).toBe(1);
    expect(pile).toEqual([]);
  });

  it("inventário quase cheio: pega o que couber, o resto fica na pilha", () => {
    // Todos os slots ocupados, menos o último; a pilha tem mais peles do que cabem num slot.
    const almostFull = addItems(emptyInventory(), "dente_de_goblin", (INVENTORY_SLOTS - 1) * ITEMS.dente_de_goblin.maxStack)
      .inventory;
    const { inventory, pile } = takeFromPile(almostFull, [{ item: "pele_de_rato", count: ITEMS.pele_de_rato.maxStack + 3 }]);
    expect(countItem(inventory, "pele_de_rato")).toBe(ITEMS.pele_de_rato.maxStack);
    expect(pile).toEqual([{ item: "pele_de_rato", count: 3 }]);
  });
});

describe("nearestWithin", () => {
  const points = new Map([
    ["longe", { x: 100, y: 0 }],
    ["perto", { x: 10, y: 0 }],
    ["medio", { x: 30, y: 0 }],
  ]);

  it("escolhe a mais próxima dentro do raio", () => {
    expect(nearestWithin({ x: 0, y: 0 }, points, 40)).toBe("perto");
  });

  it("nada no raio: undefined", () => {
    expect(nearestWithin({ x: 0, y: 0 }, points, 5)).toBeUndefined();
  });
});
