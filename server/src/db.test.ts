import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { STASH_SLOTS, addItems, emptyInventory, restoreStash, startingInventory, STARTING_ITEMS } from "shared";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS, Store } from "./db";

// Banco de verdade (SQLite), em memória ou numa pasta temporária: testa a gravação, não regra de jogo.
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function tempFile(): string {
  const folder = mkdtempSync(join(tmpdir(), "rpg-db-"));
  folders.push(folder);
  return join(folder, "test.db");
}

const furs = addItems(emptyInventory(), "pele_de_lobo", 4).inventory;

describe("migração 6 (moedas e baú da linhagem)", () => {
  it("sobre um banco da versão 5: linhagem com 0 moedas e baú vazio; personagem e inventário preservados", () => {
    const file = tempFile();
    const old = new Database(file);
    MIGRATIONS.slice(0, 5).forEach((sql) => old.exec(sql));
    old.pragma("user_version = 5");
    old.prepare("INSERT INTO lineages (id, name) VALUES (1, 'Ana')").run();
    old.prepare("INSERT INTO characters (id, lineage_id, xp, class, inventory) VALUES (7, 1, 3, 'mago', ?)").run(JSON.stringify(furs));
    old.close();

    const store = new Store(file);
    const record = store.enter("ana");
    expect(record).toEqual({ characterId: 7, lineageId: 1, name: "Ana", classId: "mago" });
    expect(store.xp(7)).toBe(3);
    expect(store.inventory(7)).toEqual(furs);
    expect(store.coins(1)).toBe(0);
    expect(store.stash(1)).toEqual(restoreStash(null));
    store.close();
  });
});

describe("baú e moedas da linhagem", () => {
  it("o herdeiro de quem morreu encontra o mesmo baú e as mesmas moedas, mas não a mochila do morto", () => {
    const store = new Store(":memory:");
    const first = store.enter("Bia");
    const stash = addItems(restoreStash(null), "fragmento_de_cristal", 6).inventory;
    store.saveCityChange(first, { inventory: furs, coins: 42, stash });
    store.markDead(first.characterId, { kind: "mob", mob: "lobo" });

    const heir = store.enter("bia");
    expect(heir.characterId).not.toBe(first.characterId);
    expect(heir.lineageId).toBe(first.lineageId);
    expect(store.stash(heir.lineageId)).toEqual(stash);
    expect(store.stash(heir.lineageId)).toHaveLength(STASH_SLOTS);
    expect(store.coins(heir.lineageId)).toBe(42);
    expect(store.inventory(heir.characterId)).toEqual(startingInventory(STARTING_ITEMS));
    store.close();
  });

  it("gravar só a mochila (sem moedas nem baú) não mexe no que é da linhagem", () => {
    const store = new Store(":memory:");
    const record = store.enter("Caio");
    store.saveCityChange(record, { inventory: emptyInventory(), coins: 10, stash: addItems(restoreStash(null), "racao", 2).inventory });
    store.saveCityChange(record, { inventory: furs });
    expect(store.inventory(record.characterId)).toEqual(furs);
    expect(store.coins(record.lineageId)).toBe(10);
    expect(store.stash(record.lineageId)[0]).toEqual({ item: "racao", count: 2 });
    store.close();
  });

  it("linhagens diferentes não dividem baú nem moedas", () => {
    const store = new Store(":memory:");
    const ana = store.enter("Ana");
    const bia = store.enter("Bia");
    store.saveCityChange(ana, { inventory: emptyInventory(), coins: 5, stash: addItems(restoreStash(null), "racao", 1).inventory });
    expect(store.coins(bia.lineageId)).toBe(0);
    expect(store.stash(bia.lineageId)).toEqual(restoreStash(null));
    store.close();
  });
});
