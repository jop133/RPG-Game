import { describe, expect, it } from "vitest";
import { DEV, MOB_KINDS, TRAINING_DUMMY } from "./balance";
import type { CollisionGrid } from "./collision";
import { devGive, dropForeignGear, mobStats, parseDevCommand, spawnSpots, teleportRoom } from "./dev";
import { emptyInventory } from "./inventory";

// Grade de teste: "#" é parede, "." é chão; tiles de 32 px.
function gridOf(rows: string[]): CollisionGrid {
  return { width: rows[0]?.length ?? 0, height: rows.length, tileSize: 32, solid: rows.join("").split("").map((c) => c === "#") };
}

describe("parseDevCommand", () => {
  it("aceita os comandos do pedido, com os campos conferidos", () => {
    expect(parseDevCommand({ command: "set_god_mode", enabled: true })).toEqual({ command: "set_god_mode", enabled: true });
    expect(parseDevCommand({ command: "set_class", characterClass: "homem_fera" })).toEqual({ command: "set_class", characterClass: "homem_fera" });
    expect(parseDevCommand({ command: "give_item", item: "cajado_arcano", equip: true })).toEqual({ command: "give_item", item: "cajado_arcano", count: 1, equip: true });
    expect(parseDevCommand({ command: "teleport_to", target: "wolf_zone" })).toEqual({ command: "teleport_to", target: "wolf_zone" });
    expect(parseDevCommand({ command: "force_zone_effect", effect: "gnome" })).toEqual({ command: "force_zone_effect", effect: "gnome" });
  });

  it("spawn: tipo do jogo ou o boneco; quantidade limitada; IA ligada por padrão", () => {
    expect(parseDevCommand({ command: "spawn_mob", mob: "dummy" })).toEqual({ command: "spawn_mob", mob: "dummy", count: 1, aiEnabled: true, lowHp: false });
    expect(parseDevCommand({ command: "spawn_mob", mob: "lobo", count: 500, aiEnabled: false, angle: 1 })).toMatchObject({ count: DEV.maxSpawn, aiEnabled: false, angle: 1 });
    expect(parseDevCommand({ command: "spawn_mob", mob: "dragao" })).toBeUndefined();
  });

  it("recusa o que não é comando, campo errado e valor fora da lista", () => {
    expect(parseDevCommand(undefined)).toBeUndefined();
    expect(parseDevCommand({ command: "apagar_banco" })).toBeUndefined();
    expect(parseDevCommand({ command: "set_god_mode", enabled: "sim" })).toBeUndefined();
    expect(parseDevCommand({ command: "give_item", item: "espada_lendaria" })).toBeUndefined();
    expect(parseDevCommand({ command: "teleport_to", target: "lua" })).toBeUndefined();
    expect(parseDevCommand({ command: "set_class", characterClass: "paladino" })).toBeUndefined();
  });

  it("ouro: quantidade inteira e positiva; sem quantidade, DEV.gold", () => {
    expect(parseDevCommand({ command: "add_gold" })).toEqual({ command: "add_gold", amount: DEV.gold });
    expect(parseDevCommand({ command: "add_gold", amount: -50 })).toEqual({ command: "add_gold", amount: 1 });
  });
});

describe("teleportRoom", () => {
  it("cada destino na sala certa", () => {
    expect(teleportRoom("test_room")).toBe("sandbox");
    expect(teleportRoom("hub")).toBe("city");
    expect(teleportRoom("stash")).toBe("city");
    expect(teleportRoom("goblin_zone")).toBe("game");
    expect(teleportRoom("portal")).toBe("game");
  });
});

describe("mobStats", () => {
  it("mob do jogo pelos seus status; o boneco pelos dele", () => {
    expect(mobStats("goblin")).toBe(MOB_KINDS.goblin);
    expect(mobStats("dummy")).toBe(TRAINING_DUMMY);
  });
});

describe("spawnSpots", () => {
  const open = gridOf(Array.from({ length: 12 }, () => "............"));
  const at = { x: 3 * 32 + 16, y: 6 * 32 + 16 };

  it("o primeiro a DEV.spawnTiles tiles à frente; os outros um tile para cada lado", () => {
    const spots = spawnSpots(open, at, 0, 3, 8);
    expect(spots[0]).toEqual({ x: at.x + DEV.spawnTiles * 32, y: at.y });
    expect(spots[1]?.y).toBeCloseTo(at.y + 32);
    expect(spots[2]?.y).toBeCloseTo(at.y - 32);
  });

  it("com parede no caminho, recua até caber", () => {
    const walled = gridOf(Array.from({ length: 12 }, () => "......#....."));
    const [spot] = spawnSpots(walled, at, 0, 1, 8);
    expect(spot!.x).toBeLessThanOrEqual(6 * 32 - 8);
    expect(spot!.x).toBeGreaterThan(at.x);
  });
});

describe("devGive e dropForeignGear", () => {
  const bare = { inventory: emptyInventory(), equipment: {} };

  it("dá e equipa; a peça de antes volta para a mochila", () => {
    const first = devGive(bare, "elmo_ferro", 1, true, "barbaro");
    expect(first.gear.equipment.helm).toBe("elmo_ferro");
    expect(first.gear.inventory.every((s) => s === null)).toBe(true);
    const sword = devGive({ inventory: emptyInventory(), equipment: { weapon: "espada_ferro" } }, "cajado_arcano", 1, true, "mago");
    expect(sword.gear.equipment.weapon).toBe("cajado_arcano");
    expect(sword.gear.inventory.some((s) => s?.item === "espada_ferro")).toBe(true);
  });

  it("item de outra classe: fica na mochila, com o aviso", () => {
    const out = devGive(bare, "cajado_arcano", 1, true, "barbaro");
    expect(out.gear.equipment.weapon).toBeUndefined();
    expect(out.gear.inventory.some((s) => s?.item === "cajado_arcano")).toBe(true);
    expect(out.notice).toMatch(/Mago/);
  });

  it("sem equip: só na mochila, na quantidade pedida", () => {
    const out = devGive(bare, "racao", 3, false, "mago");
    expect(out.gear.inventory[0]).toEqual({ item: "racao", count: 3 });
  });

  it("trocar de classe tira do corpo o que a nova não usa", () => {
    const gear = { inventory: emptyInventory(), equipment: { weapon: "cajado_arcano" as const, helm: "elmo_ferro" as const } };
    const out = dropForeignGear(gear, "barbaro");
    expect(out.equipment).toEqual({ helm: "elmo_ferro" });
    expect(out.inventory.some((s) => s?.item === "cajado_arcano")).toBe(true);
  });
});
