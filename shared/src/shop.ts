import { BUY_PRICES, ITEMS, MAX_TRADE_COUNT, SELL_PRICES, type ItemId } from "./balance";
import { addItems, removeItems, type Inventory } from "./inventory";

// Compra e venda na cidade, com as moedas da linhagem. Tudo ou nada: nunca vende ou compra só uma parte.
export type TradeOutcome =
  | { kind: "done"; inventory: Inventory; coins: number }
  // O item não está na lista de preços (de venda ou de compra).
  | { kind: "notForSale" }
  // Vender mais do que se tem na mochila.
  | { kind: "notEnough" }
  // Comprar sem moedas para tudo.
  | { kind: "noCoins" }
  // Comprar sem espaço na mochila para tudo.
  | { kind: "noSpace" };

// Mercador da Guilda: tira `count` do item da mochila e paga SELL_PRICES por unidade.
export function sellItems(inventory: Inventory, coins: number, item: ItemId, count: number): TradeOutcome {
  const price = SELL_PRICES[item];
  if (price === undefined) return { kind: "notForSale" };
  const rest = removeItems(inventory, item, count);
  if (!rest) return { kind: "notEnough" };
  return { kind: "done", inventory: rest, coins: coins + price * count };
}

// Taverna da Estalagem: cobra BUY_PRICES por unidade e põe `count` do item na mochila.
export function buyItems(inventory: Inventory, coins: number, item: ItemId, count: number): TradeOutcome {
  const price = BUY_PRICES[item];
  if (price === undefined) return { kind: "notForSale" };
  if (coins < price * count) return { kind: "noCoins" };
  const added = addItems(inventory, item, count);
  if (added.leftover > 0) return { kind: "noSpace" };
  return { kind: "done", inventory: added.inventory, coins: coins - price * count };
}

// Vem do cliente: só aceita { item: id de ITEMS, count: inteiro de 1 a MAX_TRADE_COUNT }.
export function parseTrade(raw: unknown): { item: ItemId; count: number } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { item, count } = raw as Record<string, unknown>;
  if (typeof item !== "string" || !Object.hasOwn(ITEMS, item)) return undefined;
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_TRADE_COUNT) return undefined;
  return { item: item as ItemId, count: count as number };
}
