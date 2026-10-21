import { describe, expect, it } from "vitest";
import { INVENTORY_SLOTS, ITEMS, MOB_DROPS } from "./balance";
import { addItems, countItem, emptyInventory, startingInventory } from "./inventory";
import type { CollisionGrid } from "./collision";
import { allWithin, dropUnits, inventoryToPile, nearestWithin, placeDrops, rollDrops, takeFromPile } from "./loot";

function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("rollDrops", () => {
  it("só Cristais e a essência do tipo: o 1º cristal sempre, o 2º com 50%, o 3º com 25%, a essência com 5%", () => {
    // Sorteios na ordem da tabela (cada linha: chance, depois quantidade): todos caem.
    expect(rollDrops("lobo", sequence(0, 0, 0.4, 0, 0.2, 0, 0.01, 0))).toEqual([
      { item: "cristal_magico", count: 1 },
      { item: "cristal_magico", count: 1 },
      { item: "cristal_magico", count: 1 },
      { item: "essencia_lobo", count: 1 },
    ]);
    // Acima das chances: só o 1º cristal.
    expect(rollDrops("gnomo", sequence(0.99))).toEqual([{ item: "cristal_magico", count: 1 }]);
  });

  it("cada tipo larga a sua essência e nada dos materiais antigos", () => {
    for (const kind of ["goblin", "slime", "lobo", "gnomo"] as const) {
      const items = new Set(MOB_DROPS[kind].map((e) => e.item));
      expect(items).toEqual(new Set(["cristal_magico", `essencia_${kind}`]));
    }
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

describe("itens no chão", () => {
  const open: CollisionGrid = { width: 20, height: 20, tileSize: 32, solid: new Array<boolean>(400).fill(false) };
  const center = { x: 320, y: 320 };
  const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it("cada unidade vira um item à parte", () => {
    expect(dropUnits([{ item: "cristal_magico", count: 3 }, { item: "essencia_lobo", count: 1 }])).toEqual([
      "cristal_magico",
      "cristal_magico",
      "cristal_magico",
      "essencia_lobo",
    ]);
  });

  it("nunca dois itens a menos de 26 px, nem dos que já estavam no chão", () => {
    const taken = [{ x: 320, y: 320 }, { x: 346, y: 320 }];
    const spots = placeDrops(center, 6, taken, open);
    const all = [...taken, ...spots];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(gap(all[i]!, all[j]!)).toBeGreaterThanOrEqual(26 - 1e-6);
    for (const s of spots) expect(gap(s, center)).toBeLessThan(26 * 3);
  });

  it("não cai dentro nem do outro lado da parede", () => {
    // Parede na coluna 11 (x 352 a 384), logo a leste do centro.
    const walled: CollisionGrid = { ...open, solid: open.solid.map((_, i) => i % 20 === 11) };
    for (const s of placeDrops(center, 10, [], walled)) expect(s.x).toBeLessThan(352 - 6);
  });

  it("pegar: todas as pilhas no alcance, a mais perto primeiro", () => {
    const piles = new Map([["a", { x: 30, y: 0 }], ["b", { x: 10, y: 0 }], ["c", { x: 99, y: 0 }]]);
    expect(allWithin({ x: 0, y: 0 }, piles, 40)).toEqual(["b", "a"]);
  });
});
