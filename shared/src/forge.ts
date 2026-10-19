import type { ItemId } from "./balance";

// Os 8 slots de equipamento do personagem: armaduras (elmo, peitoral, calça, bota), à esquerda na janela de inventário,
// e arma, escudo, amuleto e anel, à direita.
export type EquipSlot = "helm" | "chest" | "pants" | "boots" | "weapon" | "shield" | "amulet" | "ring";

// Receita da Forja do Ferreiro: por enquanto só vitrine (FORGE_RECIPES em balance.ts), nada se forja. O catálogo
// (FORGE_PRICES) já vende.
export interface ForgeItem {
  name: string;
  slot: EquipSlot;
  coins: number;
  materials?: Partial<Record<ItemId, number>>;
}
