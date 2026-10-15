import { describe, expect, it } from "vitest";
import { BUY_PRICES, ITEMS, MAX_TRADE_COUNT, SELL_PRICES } from "./balance";
import { addItems, countItem, emptyInventory, type Inventory, type ItemStack } from "./inventory";
import { buyItems, parseTrade, sellItems } from "./shop";

const RACAO = BUY_PRICES.racao ?? 0;
const PELE = SELL_PRICES.pele_de_lobo ?? 0;

function bag(items: (ItemStack | null)[]): Inventory {
  return Array.from({ length: emptyInventory().length }, (_, i) => items[i] ?? null);
}

describe("sellItems", () => {
  it("vende parte de uma pilha: tira da mochila e paga o preço por unidade", () => {
    const result = sellItems(bag([{ item: "pele_de_lobo", count: 5 }]), 7, "pele_de_lobo", 2);
    expect(result).toEqual({ kind: "done", inventory: bag([{ item: "pele_de_lobo", count: 3 }]), coins: 7 + 2 * PELE });
  });

  it("vender tudo junta as pilhas de slots diferentes", () => {
    const inventory = bag([{ item: "pele_de_lobo", count: 2 }, { item: "racao", count: 1 }, { item: "pele_de_lobo", count: 3 }]);
    const result = sellItems(inventory, 0, "pele_de_lobo", countItem(inventory, "pele_de_lobo"));
    expect(result.kind).toBe("done");
    if (result.kind !== "done") return;
    expect(countItem(result.inventory, "pele_de_lobo")).toBe(0);
    expect(result.inventory[1]).toEqual({ item: "racao", count: 1 });
    expect(result.coins).toBe(5 * PELE);
  });

  it("essência rara vale mais que a comum", () => {
    expect(SELL_PRICES.essencia_goblin_rara ?? 0).toBeGreaterThan(SELL_PRICES.essencia_goblin ?? 0);
    const result = sellItems(bag([{ item: "essencia_goblin_rara", count: 1 }]), 0, "essencia_goblin_rara", 1);
    expect(result).toMatchObject({ kind: "done", coins: SELL_PRICES.essencia_goblin_rara });
  });

  it("mais do que tem: recusa e nada muda", () => {
    expect(sellItems(bag([{ item: "pele_de_lobo", count: 1 }]), 3, "pele_de_lobo", 2)).toEqual({ kind: "notEnough" });
  });

  it("a ração não se vende", () => {
    expect(SELL_PRICES.racao).toBeUndefined();
    expect(sellItems(bag([{ item: "racao", count: 3 }]), 0, "racao", 1)).toEqual({ kind: "notForSale" });
  });
});

describe("buyItems", () => {
  it("compra ração: cobra e põe na mochila, completando a pilha que já existe", () => {
    const result = buyItems(bag([{ item: "racao", count: 1 }]), 3 * RACAO + 4, "racao", 3);
    expect(result).toEqual({ kind: "done", inventory: bag([{ item: "racao", count: 4 }]), coins: 4 });
  });

  it("sem moedas para todas: recusa sem comprar parte", () => {
    expect(buyItems(bag([]), 2 * RACAO - 1, "racao", 2)).toEqual({ kind: "noCoins" });
  });

  it("sem espaço para todas: recusa e não cobra", () => {
    let inventory = emptyInventory();
    inventory = addItems(inventory, "pele_de_lobo", ITEMS.pele_de_lobo.maxStack * inventory.length).inventory;
    expect(buyItems(inventory, 100 * RACAO, "racao", 1)).toEqual({ kind: "noSpace" });
  });

  it("só a Taverna vende: item fora de BUY_PRICES é recusado", () => {
    expect(buyItems(bag([]), 1000, "essencia_lobo", 1)).toEqual({ kind: "notForSale" });
  });

  it("compra com o saldo exato zera as moedas", () => {
    expect(buyItems(bag([]), RACAO, "racao", 1)).toMatchObject({ kind: "done", coins: 0 });
  });
});

describe("parseTrade", () => {
  it("aceita item existente com quantidade inteira de 1 a MAX_TRADE_COUNT", () => {
    expect(parseTrade({ item: "racao", count: 1 })).toEqual({ item: "racao", count: 1 });
    expect(parseTrade({ item: "pele_de_lobo", count: MAX_TRADE_COUNT })).toEqual({ item: "pele_de_lobo", count: MAX_TRADE_COUNT });
  });

  it("recusa item inexistente, herdado do protótipo ou quantidade inválida", () => {
    for (const raw of [
      null,
      "racao",
      { item: "ouro", count: 1 },
      { item: "toString", count: 1 },
      { item: "racao", count: 0 },
      { item: "racao", count: -3 },
      { item: "racao", count: 1.5 },
      { item: "racao", count: MAX_TRADE_COUNT + 1 },
      { item: "racao", count: "2" },
    ]) {
      expect(parseTrade(raw)).toBeUndefined();
    }
  });
});
