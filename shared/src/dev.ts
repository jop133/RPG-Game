import { DEV, ITEMS, MOB_KINDS, TRAINING_DUMMY, type ItemId, type MobKind } from "./balance";
import type { StationId } from "./city";
import { parseClassId, type ClassId } from "./classes";
import { boxFits, type CollisionGrid } from "./collision";
import { EQUIP_SLOTS, canEquip, equipFromSlot, equipSlotOf, wrongClassNotice, type Equipment } from "./equipment";
import { addItems, type Inventory } from "./inventory";
import type { MobStats } from "./mobs";
import type { Vec2 } from "./movement";
import type { ZoneId } from "./zones";

// Ferramentas de desenvolvimento (Sala de Testes, painel F2, window.__DEV__). O servidor só aceita os comandos com
// DEV_TOOLS=1; aqui fica só o formato deles e as contas puras.

// O que se pode spawnar: os mobs do jogo e o Boneco de Treino (só de dev; fora do bestiário).
export type SpawnKind = MobKind | "dummy";

export function isSpawnKind(raw: unknown): raw is SpawnKind {
  return raw === "dummy" || (typeof raw === "string" && Object.hasOwn(MOB_KINDS, raw));
}

// Os status de qualquer mob no estado, inclusive o boneco.
export function mobStats(kind: string): MobStats {
  return Object.hasOwn(MOB_KINDS, kind) ? MOB_KINDS[kind as MobKind] : TRAINING_DUMMY;
}

// Nomes das zonas nos comandos (os do pedido) e a zona do jogo de cada um.
export const DEV_ZONES = { goblin: "goblin", slime: "slime", wolf: "lobo", gnome: "gnomo" } as const satisfies Record<string, ZoneId>;
export type DevZoneName = keyof typeof DEV_ZONES;

// Para onde o teleporte leva. test_room: a Sala de Testes; hub: a praça da cidade; *_zone: o meio de cada zona do
// labirinto; portal: ao lado de uma saída do labirinto; blacksmith/guild/food/stash: o móvel da loja na cidade.
export const DEV_TELEPORTS = [
  "test_room",
  "hub",
  "goblin_zone",
  "slime_zone",
  "wolf_zone",
  "gnome_zone",
  "portal",
  "blacksmith",
  "guild",
  "food",
  "stash",
] as const;
export type DevTeleport = (typeof DEV_TELEPORTS)[number];

// As lojas da cidade (openShop) e o móvel de cada uma.
export const DEV_SHOPS = {
  blacksmith: "blacksmith-counter",
  guild: "guild-counter",
  food: "inn-counter",
  stash: "inn-chest",
} as const satisfies Record<string, StationId>;
export type DevShop = keyof typeof DEV_SHOPS;

// Em que sala cada destino fica: a cidade, o labirinto ou a Sala de Testes.
export type DevRoom = "city" | "game" | "sandbox";
export function teleportRoom(target: DevTeleport): DevRoom {
  if (target === "test_room") return "sandbox";
  if (target === "hub" || Object.hasOwn(DEV_SHOPS, target)) return "city";
  return "game";
}

// O conjunto de ferro inteiro, com amuleto e anel (give_all_gear).
export const IRON_GEAR: readonly ItemId[] = ["elmo_ferro", "peitoral_ferro", "calca_ferro", "bota_ferro", "amuleto_runico", "anel_vitalidade"];

export type DevCommand =
  | { command: "enter_test_room" }
  | { command: "set_god_mode"; enabled: boolean }
  | { command: "set_mob_ai"; enabled: boolean }
  | { command: "set_class"; characterClass: ClassId }
  | { command: "give_item"; item: ItemId; count: number; equip: boolean }
  | { command: "give_all_gear" }
  | { command: "clear_bag" }
  | { command: "add_gold"; amount: number }
  | { command: "heal" }
  | { command: "spawn_mob"; mob: SpawnKind; count: number; aiEnabled: boolean; lowHp: boolean; angle?: number }
  | { command: "clear_mobs" }
  | { command: "test_drops" }
  | { command: "teleport_to"; target: DevTeleport }
  | { command: "force_zone_effect"; effect: DevZoneName | "none" };

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === "object" && raw !== null;
const whole = (raw: unknown, min: number, max: number, fallback: number) =>
  typeof raw === "number" && Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;

// Mensagem "dev_command" do cliente -> comando conferido, ou undefined se não for um comando válido.
export function parseDevCommand(raw: unknown): DevCommand | undefined {
  if (!isRecord(raw) || typeof raw.command !== "string") return undefined;
  switch (raw.command) {
    case "enter_test_room":
    case "give_all_gear":
    case "clear_bag":
    case "heal":
    case "clear_mobs":
    case "test_drops":
      return { command: raw.command };
    case "set_god_mode":
    case "set_mob_ai":
      return typeof raw.enabled === "boolean" ? { command: raw.command, enabled: raw.enabled } : undefined;
    case "set_class": {
      const characterClass = parseClassId(raw.characterClass);
      return characterClass ? { command: "set_class", characterClass } : undefined;
    }
    case "give_item": {
      if (typeof raw.item !== "string" || !Object.hasOwn(ITEMS, raw.item)) return undefined;
      return { command: "give_item", item: raw.item as ItemId, count: whole(raw.count, 1, 99, 1), equip: raw.equip === true };
    }
    case "add_gold":
      return { command: "add_gold", amount: whole(raw.amount, 1, 1_000_000, DEV.gold) };
    case "spawn_mob": {
      if (!isSpawnKind(raw.mob)) return undefined;
      const angle = typeof raw.angle === "number" && Number.isFinite(raw.angle) ? raw.angle : undefined;
      return {
        command: "spawn_mob",
        mob: raw.mob,
        count: whole(raw.count, 1, DEV.maxSpawn, 1),
        aiEnabled: raw.aiEnabled !== false,
        lowHp: raw.lowHp === true,
        ...(angle === undefined ? {} : { angle }),
      };
    }
    case "teleport_to":
      return typeof raw.target === "string" && (DEV_TELEPORTS as readonly string[]).includes(raw.target)
        ? { command: "teleport_to", target: raw.target as DevTeleport }
        : undefined;
    case "force_zone_effect":
      return raw.effect === "none" || (typeof raw.effect === "string" && Object.hasOwn(DEV_ZONES, raw.effect))
        ? { command: "force_zone_effect", effect: raw.effect as DevZoneName | "none" }
        : undefined;
    default:
      return undefined;
  }
}

// Onde nascem `count` mobs pedidos por dev: a DEV.spawnTiles tiles à frente de `origin` na direção `angle`, os
// seguintes um tile para cada lado, alternando. Ponto em parede: recua pela mesma linha até caber (no pior caso,
// em cima de quem pediu).
export function spawnSpots(grid: CollisionGrid, origin: Vec2, angle: number, count: number, half: number): Vec2[] {
  const ts = grid.tileSize;
  const ahead = { x: Math.cos(angle), y: Math.sin(angle) };
  const side = { x: -ahead.y, y: ahead.x };
  const spots: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1);
    let distance = DEV.spawnTiles * ts;
    let spot = origin;
    for (; distance > 0; distance -= ts / 4) {
      const at = {
        x: origin.x + ahead.x * distance + side.x * offset * ts,
        y: origin.y + ahead.y * distance + side.y * offset * ts,
      };
      if (boxFits(grid, at, half)) {
        spot = at;
        break;
      }
    }
    spots.push(spot);
  }
  return spots;
}

// Mochila e equipamento de um personagem, como as salas guardam.
export interface DevGear {
  inventory: Inventory;
  equipment: Equipment;
}

// give_item: põe `count` de `item` na mochila (o que não couber some) e, com `equip`, equipa (a peça que estava no
// slot volta para a mochila). Item de outra classe fica na mochila, com o aviso de sempre.
export function devGive(gear: DevGear, item: ItemId, count: number, equip: boolean, classId: ClassId | undefined): { gear: DevGear; notice?: string } {
  const added = addItems(gear.inventory, item, count);
  if (added.leftover === count) return { gear, notice: "Mochila cheia." };
  const next = { inventory: added.inventory, equipment: gear.equipment };
  if (!equip || !equipSlotOf(item)) return { gear: next };
  const slot = next.inventory.findIndex((stack) => stack?.item === item);
  const outcome = equipFromSlot(next.inventory, next.equipment, slot, classId);
  if (outcome.kind === "done") return { gear: { inventory: outcome.inventory, equipment: outcome.equipment } };
  if (outcome.kind === "wrongClass") return { gear: next, notice: wrongClassNotice(item) };
  return { gear: next, notice: outcome.kind === "noSpace" ? "Mochila cheia: não há onde guardar." : undefined };
}

// Troca de classe: o que a classe nova não pode usar sai do corpo para a mochila (sem espaço, fica equipado).
export function dropForeignGear(gear: DevGear, classId: ClassId): DevGear {
  let { inventory } = gear;
  const equipment = { ...gear.equipment };
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    if (!item || canEquip(item, classId)) continue;
    const added = addItems(inventory, item, 1);
    if (added.leftover > 0) continue;
    inventory = added.inventory;
    delete equipment[slot];
  }
  return { inventory, equipment };
}
