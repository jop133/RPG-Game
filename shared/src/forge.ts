import type { ItemId } from "./balance";

// Slots de equipamento do personagem (os da janela de inventário). Ainda vazios: equipamento vem no passo 8.
export type EquipSlot = "helm" | "chest" | "boots" | "weapon" | "shield" | "ring";

// Peça da Forja do Ferreiro. Por enquanto só vitrine (FORGE_CATALOG e FORGE_RECIPES em balance.ts): não há regra que
// compre ou forje. `materials` só nas receitas.
export interface ForgeItem {
  name: string;
  slot: EquipSlot;
  coins: number;
  materials?: Partial<Record<ItemId, number>>;
}
