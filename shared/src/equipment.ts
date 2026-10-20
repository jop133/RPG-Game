import { ITEMS, STARTING_EQUIPMENT, STARTING_EQUIPMENT_BY_CLASS, UNARMED_ATTACK, type ItemId } from "./balance";
import { CLASS_NAMES, type ClassId } from "./classes";
import type { EquipSlot } from "./forge";
import { addItems, type Inventory, type ItemStack, type ItemStats } from "./inventory";
import type { StatBonus } from "./stats";

// Golpe de uma arma (ou do soco): dano, alcance (do centro de quem golpeia até a borda do alvo, em px) e abertura do
// arco à frente, em graus. weaponType "staff": a arma não golpeia, dispara o Projétil Mágico (MAGIC_BOLT); sem o
// campo, é corpo a corpo.
export interface WeaponStats {
  damage: number;
  range: number;
  arcDegrees: number;
  weaponType?: "melee" | "staff";
}

// O que um item equipável faz: em que slot vai, o golpe (se for arma), o que soma aos status enquanto equipado e, nas
// armaduras do corpo, o visual que veste o personagem (camadas em assets/characters/<classe>/armor/<look>/).
export interface EquipStats {
  slot: EquipSlot;
  weapon?: WeaponStats;
  bonus?: StatBonus;
  look?: string;
  // Só estas classes equipam o item; sem o campo, qualquer uma.
  allowedClasses?: readonly ClassId[];
}

// O que o personagem tem equipado: um item por slot. Slot ausente = vazio.
export type Equipment = Partial<Record<EquipSlot, ItemId>>;

export const EQUIP_SLOTS: readonly EquipSlot[] = ["helm", "chest", "pants", "boots", "weapon", "shield", "amulet", "ring"];
// As peças que aparecem no corpo, na ordem em que se vestem (de baixo para cima na pilha de camadas).
export const BODY_LAYERS = ["boots", "pants", "chest", "helm"] as const satisfies readonly EquipSlot[];
// As que o cliente desenha hoje (no mapa e no boneco do inventário). O elmo está desligado por enquanto, a pedido do
// dono do projeto: continua equipável e somando status, como amuleto e anel, mas sem camada na cabeça (a arte dele
// continua gerada em assets/characters/<classe>/armor/<look>/helm/). Para religar, voltar a usar BODY_LAYERS.
export const DRAWN_BODY_LAYERS = BODY_LAYERS.filter((piece) => piece !== "helm");

export function equipSlotOf(item: ItemId): EquipSlot | undefined {
  return (ITEMS[item] as ItemStats).equip?.slot;
}

// A classe pode equipar o item? Sem classe conhecida, só o que não tem restrição.
export function canEquip(item: ItemId, classId: ClassId | undefined): boolean {
  const allowed = (ITEMS[item] as ItemStats).equip?.allowedClasses;
  return !allowed || (classId !== undefined && allowed.includes(classId));
}

// Aviso de quem tenta equipar um item de outra classe: "Apenas o Mago pode empunhar o Cajado Arcano!".
export function wrongClassNotice(item: ItemId): string {
  const allowed = (ITEMS[item] as ItemStats).equip?.allowedClasses ?? [];
  const classes = allowed.map((id) => CLASS_NAMES[id]).join(" ou ");
  const verb = equipSlotOf(item) === "weapon" ? "empunhar" : "usar";
  return `Apenas o ${classes} pode ${verb} o ${ITEMS[item].name}!`;
}

// Com o que um personagem da classe entra equipado pela primeira vez.
export function startingEquipment(classId: ClassId | undefined): Equipment {
  return { ...((classId && STARTING_EQUIPMENT_BY_CLASS[classId]) ?? STARTING_EQUIPMENT) };
}

// O golpe com a arma equipada; sem arma, o soco.
export function weaponStats(equipment: Equipment): WeaponStats {
  const weapon = equipment.weapon;
  return (weapon && (ITEMS[weapon] as ItemStats).equip?.weapon) || UNARMED_ATTACK;
}

// Equipamento guardado no personagem → equipamento em jogo. Nada guardado (personagem novo, ou de antes do
// equipamento existir) = o inicial da classe (startingEquipment). Descarta o que não for item equipável no slot certo.
export function restoreEquipment(saved: Equipment | null, classId?: ClassId): Equipment {
  if (saved === null) return startingEquipment(classId);
  const equipment: Equipment = {};
  for (const slot of EQUIP_SLOTS) {
    const item = saved[slot];
    if (item && item in ITEMS && equipSlotOf(item) === slot) equipment[slot] = item;
  }
  return equipment;
}

// O equipamento como pilhas (uma por item), para cair no chão junto com a mochila na morte.
export function equipmentToPile(equipment: Equipment): ItemStack[] {
  return EQUIP_SLOTS.flatMap((slot) => {
    const item = equipment[slot];
    return item ? [{ item, count: 1 }] : [];
  });
}

// Arrastar a pilha do slot `from` para o slot `to` da mochila. Mesmo item: completa a pilha de destino até maxStack e o
// resto fica na origem. Item diferente ou slot vazio: trocam de lugar. undefined = nada mudou.
export function moveSlot(inventory: Inventory, from: number, to: number): Inventory | undefined {
  const moving = inventory[from];
  if (from === to || !moving) return undefined;
  const target = inventory[to] ?? null;
  const slots = [...inventory];
  if (target?.item === moving.item) {
    const moved = Math.min(moving.count, ITEMS[moving.item].maxStack - target.count);
    if (moved === 0) return undefined;
    slots[to] = { item: moving.item, count: target.count + moved };
    slots[from] = moving.count > moved ? { item: moving.item, count: moving.count - moved } : null;
    return slots;
  }
  slots[to] = moving;
  slots[from] = target;
  return slots;
}

export type EquipOutcome =
  | { kind: "done"; inventory: Inventory; equipment: Equipment }
  // O item do slot não se equipa (comida, material, essência).
  | { kind: "notEquippable" }
  // Não há slot livre na mochila para o que sai do equipamento.
  | { kind: "noSpace" }
  // O item é de outra classe (allowedClasses).
  | { kind: "wrongClass"; item: ItemId }
  // Slot vazio (mochila ou equipamento).
  | { kind: "nothing" };

// Equipa um item do slot `slot` da mochila. O que já estava equipado naquele slot de equipamento vai para a mochila,
// no lugar do que saiu (troca). Item de outra classe é recusado.
export function equipFromSlot(inventory: Inventory, equipment: Equipment, slot: number, classId?: ClassId): EquipOutcome {
  const stack = inventory[slot];
  if (!stack) return { kind: "nothing" };
  const target = equipSlotOf(stack.item);
  if (!target) return { kind: "notEquippable" };
  if (!canEquip(stack.item, classId)) return { kind: "wrongClass", item: stack.item };
  const previous = equipment[target];
  const slots: (ItemStack | null)[] = [...inventory];
  const equipped = { ...equipment, [target]: stack.item };
  // Pilha de um: quem estava equipado fica no lugar dele. Pilha maior: sobra o resto, e quem sai procura vaga.
  if (stack.count === 1) {
    slots[slot] = previous ? { item: previous, count: 1 } : null;
    return { kind: "done", inventory: slots, equipment: equipped };
  }
  slots[slot] = { item: stack.item, count: stack.count - 1 };
  if (!previous) return { kind: "done", inventory: slots, equipment: equipped };
  const added = addItems(slots, previous, 1);
  if (added.leftover > 0) return { kind: "noSpace" };
  return { kind: "done", inventory: added.inventory, equipment: equipped };
}

// Tira o item de um slot de equipamento para a mochila: para o slot `to` se ele estiver vazio; se `to` tiver outro
// item do mesmo slot de equipamento, os dois trocam; senão (ou sem `to`), para o primeiro slot livre.
export function unequip(
  inventory: Inventory,
  equipment: Equipment,
  from: EquipSlot,
  to?: number,
  classId?: ClassId,
): EquipOutcome {
  const item = equipment[from];
  if (!item) return { kind: "nothing" };
  const target = to === undefined ? undefined : inventory[to];
  if (target && equipSlotOf(target.item) === from) return equipFromSlot(inventory, equipment, to as number, classId);
  const rest = { ...equipment };
  delete rest[from];
  if (to !== undefined && target === null) {
    const slots = [...inventory];
    slots[to] = { item, count: 1 };
    return { kind: "done", inventory: slots, equipment: rest };
  }
  const added = addItems(inventory, item, 1);
  if (added.leftover > 0) return { kind: "noSpace" };
  return { kind: "done", inventory: added.inventory, equipment: rest };
}

// Vem do cliente: só aceita { from, to }, inteiros de 0 a slots - 1.
export function parseMoveSlots(raw: unknown, slots: number): { from: number; to: number } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { from, to } = raw as Record<string, unknown>;
  const valid = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < slots;
  return valid(from) && valid(to) ? { from, to } : undefined;
}

// Vem do cliente: { slot: slot de equipamento, to?: slot da mochila }. `to` fora do intervalo = recusa.
export function parseUnequip(raw: unknown, slots: number): { from: EquipSlot; to?: number } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { slot, to } = raw as Record<string, unknown>;
  if (!EQUIP_SLOTS.includes(slot as EquipSlot)) return undefined;
  if (to === undefined) return { from: slot as EquipSlot };
  return Number.isInteger(to) && (to as number) >= 0 && (to as number) < slots ? { from: slot as EquipSlot, to: to as number } : undefined;
}
