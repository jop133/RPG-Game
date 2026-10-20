import {
  INVENTORY_SLOTS,
  equipFromSlot,
  equipSlotOf,
  moveSlot,
  parseMoveSlots,
  parseSlotIndex,
  parseUnequip,
  unequip,
  wrongClassNotice,
  type ClassId,
  type EquipOutcome,
  type Equipment,
  type Inventory,
} from "shared";

// Mochila e equipamento de um personagem: mover, equipar e desequipar mexem nos dois juntos.
export interface Gear {
  inventory: Inventory;
  equipment: Equipment;
}

export type GearAction = "move" | "equip" | "unequip";

// O que a sala faz com o pedido: aplica o equipamento novo, avisa o jogador, ou ignora (pedido inválido ou que não
// muda nada).
export type GearResult = { kind: "changed"; gear: Gear } | { kind: "refused"; notice: string } | { kind: "ignored" };

const REFUSALS: Record<Exclude<EquipOutcome["kind"], "done" | "nothing" | "wrongClass">, string> = {
  notEquippable: "Isso não se equipa.",
  noSpace: "Mochila cheia: não há onde guardar.",
};

// A mensagem vem do cliente: os parsers recusam o que não for slot válido (regra 1). As regras são as de shared,
// com a classe do personagem (item de outra classe é recusado com aviso).
export function applyGearAction(action: GearAction, message: unknown, gear: Gear, classId?: ClassId): GearResult {
  if (action === "move") {
    const move = parseMoveSlots(message, INVENTORY_SLOTS);
    const inventory = move && moveSlot(gear.inventory, move.from, move.to);
    return inventory ? { kind: "changed", gear: { inventory, equipment: gear.equipment } } : { kind: "ignored" };
  }
  if (action === "equip") {
    const slot = parseSlotIndex(message);
    return slot === undefined ? { kind: "ignored" } : fromOutcome(equipFromSlot(gear.inventory, gear.equipment, slot, classId));
  }
  const request = parseUnequip(message, INVENTORY_SLOTS);
  return request ? fromOutcome(unequip(gear.inventory, gear.equipment, request.from, request.to, classId))
    : { kind: "ignored" };
}

// Usar (tecla ou clique) um item equipável é equipá-lo.
export function isEquippableSlot(inventory: Inventory, message: unknown): boolean {
  const slot = parseSlotIndex(message);
  const stack = slot === undefined ? undefined : inventory[slot];
  return stack ? equipSlotOf(stack.item) !== undefined : false;
}

function fromOutcome(outcome: EquipOutcome): GearResult {
  if (outcome.kind === "done") return { kind: "changed", gear: { inventory: outcome.inventory, equipment: outcome.equipment } };
  if (outcome.kind === "nothing") return { kind: "ignored" };
  if (outcome.kind === "wrongClass") return { kind: "refused", notice: wrongClassNotice(outcome.item) };
  return { kind: "refused", notice: REFUSALS[outcome.kind] };
}
