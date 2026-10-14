import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { DeathCause, ItemStack } from "shared";

export interface CharacterRecord {
  characterId: number;
  lineageId: number;
  name: string;
}

// Cada migração roda uma vez, em ordem. O número da última aplicada fica em PRAGMA user_version.
// Nunca editar uma migração já publicada: acrescentar uma nova no fim.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE lineages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    lineage_id INTEGER NOT NULL REFERENCES lineages(id),
    alive INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    died_at TEXT,
    death_cause TEXT
  );
  -- Uma linhagem tem no máximo um personagem vivo; os mortos ficam como histórico.
  CREATE UNIQUE INDEX one_living_character ON characters(lineage_id) WHERE alive = 1;
  -- O que a linhagem já extraiu. Sem uso por enquanto: base para baú e loja (passo 9).
  CREATE TABLE lineage_credit (
    lineage_id INTEGER NOT NULL REFERENCES lineages(id),
    item TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (lineage_id, item)
  );
  `,
];

export class Store {
  private db: Database.Database;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    const applied = this.db.pragma("user_version", { simple: true }) as number;
    MIGRATIONS.slice(applied).forEach((sql, i) => {
      this.db.transaction(() => {
        this.db.exec(sql);
        this.db.pragma(`user_version = ${applied + i + 1}`);
      })();
    });
  }

  // Entra com um nome: acha (ou cria) a linhagem e o personagem vivo dela (ou cria um herdeiro).
  enter(name: string): CharacterRecord {
    return this.db.transaction(() => {
      this.db.prepare("INSERT INTO lineages (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name);
      const lineage = this.db.prepare("SELECT id, name FROM lineages WHERE name = ?").get(name) as {
        id: number;
        name: string;
      };
      const living = this.db
        .prepare("SELECT id FROM characters WHERE lineage_id = ? AND alive = 1")
        .get(lineage.id) as { id: number } | undefined;
      const characterId =
        living?.id ?? Number(this.db.prepare("INSERT INTO characters (lineage_id) VALUES (?)").run(lineage.id).lastInsertRowid);
      return { characterId, lineageId: lineage.id, name: lineage.name };
    })();
  }

  markDead(characterId: number, cause: DeathCause) {
    this.db
      .prepare("UPDATE characters SET alive = 0, died_at = datetime('now'), death_cause = ? WHERE id = ?")
      .run(JSON.stringify(cause), characterId);
  }

  creditExtraction(lineageId: number, items: ItemStack[]) {
    const add = this.db.prepare(
      "INSERT INTO lineage_credit (lineage_id, item, count) VALUES (?, ?, ?) " +
        "ON CONFLICT(lineage_id, item) DO UPDATE SET count = count + excluded.count",
    );
    this.db.transaction(() => {
      for (const stack of items) add.run(lineageId, stack.item, stack.count);
    })();
  }

  credit(lineageId: number): ItemStack[] {
    return this.db
      .prepare("SELECT item, count FROM lineage_credit WHERE lineage_id = ? ORDER BY item")
      .all(lineageId) as ItemStack[];
  }

  close() {
    this.db.close();
  }
}
