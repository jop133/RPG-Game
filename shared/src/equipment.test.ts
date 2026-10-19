import { describe, expect, it } from "vitest";
import { BASE_STATS, INVENTORY_SLOTS, ITEMS, STARTING_EQUIPMENT, UNARMED_ATTACK } from "./balance";
import { playerStats } from "./stats";
import {
  equipFromSlot,
  equipmentToPile,
  moveSlot,
  parseMoveSlots,
  parseUnequip,
  restoreEquipment,
  unequip,
  weaponStats,
  type Equipment,
} from "./equipment";
import { addItems, emptyInventory, type Inventory, type ItemStack } from "./inventory";

const SWORD = "espada_ferro" as const;
// Inventário com os itens nos slots dados (os outros vazios).
function bag(slots: Record<number, ItemStack>): Inventory {
  const inventory: (ItemStack | null)[] = [...emptyInventory()];
  for (const [i, stack] of Object.entries(slots)) inventory[Number(i)] = stack;
  return inventory;
}

describe("moveSlot", () => {
  it("para um slot vazio: a pilha muda de lugar", () => {
    const moved = moveSlot(bag({ 0: { item: "racao", count: 3 } }), 0, 5);
    expect(moved?.[0]).toBeNull();
    expect(moved?.[5]).toEqual({ item: "racao", count: 3 });
  });

  it("para um item diferente: os dois trocam de lugar", () => {
    const moved = moveSlot(bag({ 0: { item: "racao", count: 3 }, 1: { item: SWORD, count: 1 } }), 0, 1);
    expect(moved?.[0]).toEqual({ item: SWORD, count: 1 });
    expect(moved?.[1]).toEqual({ item: "racao", count: 3 });
  });

  it("para o mesmo item: completa a pilha de destino e o resto fica na origem", () => {
    const max = ITEMS.racao.maxStack;
    const moved = moveSlot(bag({ 0: { item: "racao", count: 3 }, 1: { item: "racao", count: max - 1 } }), 0, 1);
    expect(moved?.[1]).toEqual({ item: "racao", count: max });
    expect(moved?.[0]).toEqual({ item: "racao", count: 2 });
  });

  it("nada muda: slot de origem vazio, o mesmo slot, ou pilha de destino cheia do mesmo item", () => {
    const max = ITEMS.racao.maxStack;
    expect(moveSlot(bag({}), 0, 1)).toBeUndefined();
    expect(moveSlot(bag({ 0: { item: "racao", count: 1 } }), 0, 0)).toBeUndefined();
    expect(moveSlot(bag({ 0: { item: "racao", count: 1 }, 1: { item: "racao", count: max } }), 0, 1)).toBeUndefined();
  });
});

describe("equipFromSlot", () => {
  it("equipa e libera o slot da mochila", () => {
    const outcome = equipFromSlot(bag({ 2: { item: SWORD, count: 1 } }), {}, 2);
    expect(outcome).toMatchObject({ kind: "done", equipment: { weapon: SWORD } });
    if (outcome.kind === "done") expect(outcome.inventory[2]).toBeNull();
  });

  it("com o slot de equipamento ocupado: o que estava equipado vai para o lugar do que entrou", () => {
    const outcome = equipFromSlot(bag({ 2: { item: SWORD, count: 1 } }), { weapon: SWORD }, 2);
    expect(outcome).toMatchObject({ kind: "done", equipment: { weapon: SWORD } });
    if (outcome.kind === "done") expect(outcome.inventory[2]).toEqual({ item: SWORD, count: 1 });
  });

  it("comida não se equipa; slot vazio não faz nada", () => {
    expect(equipFromSlot(bag({ 0: { item: "racao", count: 1 } }), {}, 0)).toEqual({ kind: "notEquippable" });
    expect(equipFromSlot(bag({}), {}, 0)).toEqual({ kind: "nothing" });
  });
});

describe("unequip", () => {
  it("para um slot vazio escolhido", () => {
    const outcome = unequip(bag({}), { weapon: SWORD }, "weapon", 7);
    expect(outcome).toMatchObject({ kind: "done", equipment: {} });
    if (outcome.kind === "done") expect(outcome.inventory[7]).toEqual({ item: SWORD, count: 1 });
  });

  it("sem slot escolhido, ou com ele ocupado por outro tipo de item: o primeiro slot livre", () => {
    const outcome = unequip(bag({ 0: { item: "racao", count: 2 } }), { weapon: SWORD }, "weapon", 0);
    expect(outcome.kind).toBe("done");
    if (outcome.kind === "done") {
      expect(outcome.inventory[0]).toEqual({ item: "racao", count: 2 });
      expect(outcome.inventory[1]).toEqual({ item: SWORD, count: 1 });
    }
  });

  it("para um slot com outra arma: as duas trocam", () => {
    const outcome = unequip(bag({ 4: { item: SWORD, count: 1 } }), { weapon: SWORD }, "weapon", 4);
    expect(outcome).toMatchObject({ kind: "done", equipment: { weapon: SWORD } });
  });

  it("mochila cheia: não tira", () => {
    const full = addItems(emptyInventory(), "pele_de_rato", INVENTORY_SLOTS * ITEMS.pele_de_rato.maxStack).inventory;
    expect(unequip(full, { weapon: SWORD }, "weapon")).toEqual({ kind: "noSpace" });
  });

  it("slot de equipamento vazio: nada", () => {
    expect(unequip(bag({}), {}, "weapon")).toEqual({ kind: "nothing" });
  });
});

describe("weaponStats", () => {
  it("com a espada, o golpe dela; sem arma, o soco", () => {
    expect(weaponStats({ weapon: SWORD })).toEqual(ITEMS.espada_ferro.equip.weapon);
    expect(weaponStats({})).toEqual(UNARMED_ATTACK);
  });
});

describe("restoreEquipment", () => {
  it("nunca gravado: o equipamento inicial (a espada)", () => {
    expect(restoreEquipment(null)).toEqual(STARTING_EQUIPMENT);
    expect(STARTING_EQUIPMENT.weapon).toBe(SWORD);
  });

  it("descarta item desconhecido ou no slot errado (banco antigo ou mexido)", () => {
    const saved = { weapon: "racao", helm: SWORD, ring: "nao_existe" } as unknown as Equipment;
    expect(restoreEquipment(saved)).toEqual({});
    expect(restoreEquipment({ weapon: SWORD })).toEqual({ weapon: SWORD });
  });
});

describe("equipmentToPile", () => {
  it("cada item equipado vira uma pilha de um", () => {
    expect(equipmentToPile({ weapon: SWORD })).toEqual([{ item: SWORD, count: 1 }]);
    expect(equipmentToPile({})).toEqual([]);
  });
});

describe("parsers", () => {
  it("parseMoveSlots só aceita dois slots inteiros no intervalo", () => {
    expect(parseMoveSlots({ from: 0, to: 11 }, 12)).toEqual({ from: 0, to: 11 });
    expect(parseMoveSlots({ from: 0, to: 12 }, 12)).toBeUndefined();
    expect(parseMoveSlots({ from: -1, to: 2 }, 12)).toBeUndefined();
    expect(parseMoveSlots({ from: "0", to: 2 }, 12)).toBeUndefined();
    expect(parseMoveSlots(null, 12)).toBeUndefined();
  });

  it("parseUnequip: slot de equipamento conhecido e destino opcional no intervalo", () => {
    expect(parseUnequip({ slot: "weapon" }, 12)).toEqual({ from: "weapon" });
    expect(parseUnequip({ slot: "weapon", to: 3 }, 12)).toEqual({ from: "weapon", to: 3 });
    expect(parseUnequip({ slot: "weapon", to: 12 }, 12)).toBeUndefined();
    expect(parseUnequip({ slot: "cabeca" }, 12)).toBeUndefined();
  });
});

describe("os 8 slots", () => {
  it("cada peça do conjunto vai para o slot dela", () => {
    const pieces = { elmo_ferro: "helm", peitoral_ferro: "chest", calca_ferro: "pants", bota_ferro: "boots", amuleto_runico: "amulet", anel_vitalidade: "ring" } as const;
    for (const [item, slot] of Object.entries(pieces)) {
      const outcome = equipFromSlot(bag({ 0: { item: item as keyof typeof pieces, count: 1 } }), {}, 0);
      expect(outcome).toMatchObject({ kind: "done", equipment: { [slot]: item } });
    }
  });

  it("armadura equipada soma aos status: vida, Defesa em %, Velocidade em %", () => {
    const stats = playerStats([], { chest: "peitoral_ferro", boots: "bota_ferro" });
    expect(stats.maxHp).toBe(BASE_STATS.maxHp + 30 + 10);
    expect(stats.defensePercent).toBe(4);
    expect(stats.speed).toBeCloseTo(BASE_STATS.speed * 1.12);
  });

  it("o conjunto inteiro de ferro dá 9% de Defesa", () => {
    const stats = playerStats([], { helm: "elmo_ferro", chest: "peitoral_ferro", pants: "calca_ferro", boots: "bota_ferro" });
    expect(stats.defensePercent).toBe(9);
  });
});
