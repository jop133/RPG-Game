import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
  FIRST_KILL_XP,
  parseClassId,
  restoreInventory,
  restoreStash,
  type ClassId,
  type DeathCause,
  type Inventory,
  type ItemId,
  type MobKind,
  type Stash,
} from "shared";

export interface CharacterRecord {
  characterId: number;
  lineageId: number;
  name: string;
  // Escolhida uma vez, na ficha de registro. undefined = personagem novo que ainda não escolheu.
  classId: ClassId | undefined;
}

// Cada migração roda uma vez, em ordem. O número da última aplicada fica em PRAGMA user_version.
// Nunca editar uma migração já publicada: acrescentar uma nova no fim.
// Exportada só para o teste da migração (db.test.ts) montar um banco de uma versão antiga.
export const MIGRATIONS: string[] = [
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
  `
  ALTER TABLE characters ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
  -- Primeiras mortes de cada tipo por personagem: o que dá XP. O herdeiro começa do zero.
  CREATE TABLE character_kills (
    character_id INTEGER NOT NULL REFERENCES characters(id),
    mob_kind TEXT NOT NULL,
    killed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (character_id, mob_kind)
  );
  -- Bestiário: tipos que alguém da linhagem já matou. Sobrevive à morte.
  CREATE TABLE bestiary (
    lineage_id INTEGER NOT NULL REFERENCES lineages(id),
    mob_kind TEXT NOT NULL,
    first_killed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (lineage_id, mob_kind)
  );
  `,
  `
  -- Essências equipadas do personagem (JSON com ids de item). Somem com ele na morte.
  ALTER TABLE characters ADD COLUMN essences TEXT NOT NULL DEFAULT '[]';
  `,
  `
  -- Inventário do personagem (JSON: um item por slot, ou null). NULL = nunca gravado: recebe o kit inicial.
  -- No labirinto só é gravado na extração: se o servidor cair no meio de uma run, ela "não aconteceu".
  ALTER TABLE characters ADD COLUMN inventory TEXT;
  -- O crédito da linhagem era provisório (não havia para onde voltar). O que se extrai agora fica no inventário.
  DROP TABLE lineage_credit;
  `,
  `
  -- Classe do personagem (mago, elfo, barbaro, homem_fera). NULL = ainda não escolheu (o primeiro da linhagem
  -- ou um herdeiro escolhe na ficha de registro). Depois de escolhida, não muda.
  ALTER TABLE characters ADD COLUMN class TEXT;
  `,
  `
  -- Moedas e baú são da linhagem: sobrevivem à morte do personagem (o herdeiro herda). Baú: JSON como o
  -- inventário, com STASH_SLOTS slots; NULL = nunca usado (vazio).
  ALTER TABLE lineages ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lineages ADD COLUMN stash TEXT;
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
        .prepare("SELECT id, class FROM characters WHERE lineage_id = ? AND alive = 1")
        .get(lineage.id) as { id: number; class: string | null } | undefined;
      const characterId =
        living?.id ?? Number(this.db.prepare("INSERT INTO characters (lineage_id) VALUES (?)").run(lineage.id).lastInsertRowid);
      return { characterId, lineageId: lineage.id, name: lineage.name, classId: parseClassId(living?.class) };
    })();
  }

  // Só grava se o personagem ainda não tem classe: a escolha é uma vez só.
  setClass(characterId: number, classId: ClassId) {
    this.db.prepare("UPDATE characters SET class = ? WHERE id = ? AND class IS NULL").run(classId, characterId);
  }

  xp(characterId: number): number {
    return (this.db.prepare("SELECT xp FROM characters WHERE id = ?").get(characterId) as { xp: number }).xp;
  }

  // Registra que o personagem matou um mob deste tipo. Primeira vez dele: ganha XP. Sempre entra no bestiário.
  recordKill(record: CharacterRecord, kind: MobKind): { firstForCharacter: boolean; xp: number } {
    return this.db.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO bestiary (lineage_id, mob_kind) VALUES (?, ?)").run(record.lineageId, kind);
      const inserted = this.db
        .prepare("INSERT OR IGNORE INTO character_kills (character_id, mob_kind) VALUES (?, ?)")
        .run(record.characterId, kind).changes;
      if (inserted > 0) {
        this.db.prepare("UPDATE characters SET xp = xp + ? WHERE id = ?").run(FIRST_KILL_XP, record.characterId);
      }
      return { firstForCharacter: inserted > 0, xp: this.xp(record.characterId) };
    })();
  }

  bestiary(lineageId: number): MobKind[] {
    const rows = this.db.prepare("SELECT mob_kind FROM bestiary WHERE lineage_id = ? ORDER BY mob_kind").all(lineageId);
    return (rows as { mob_kind: MobKind }[]).map((row) => row.mob_kind);
  }

  // Tipos que este personagem já matou (os que já deram XP de primeira morte a ele).
  characterKills(characterId: number): MobKind[] {
    const rows = this.db.prepare("SELECT mob_kind FROM character_kills WHERE character_id = ? ORDER BY mob_kind").all(characterId);
    return (rows as { mob_kind: MobKind }[]).map((row) => row.mob_kind);
  }

  essences(characterId: number): ItemId[] {
    const row = this.db.prepare("SELECT essences FROM characters WHERE id = ?").get(characterId) as { essences: string };
    return JSON.parse(row.essences) as ItemId[];
  }

  setEssences(characterId: number, essences: readonly ItemId[]) {
    this.db.prepare("UPDATE characters SET essences = ? WHERE id = ?").run(JSON.stringify(essences), characterId);
  }

  markDead(characterId: number, cause: DeathCause) {
    this.db
      .prepare("UPDATE characters SET alive = 0, died_at = datetime('now'), death_cause = ? WHERE id = ?")
      .run(JSON.stringify(cause), characterId);
  }

  inventory(characterId: number): Inventory {
    const row = this.db.prepare("SELECT inventory FROM characters WHERE id = ?").get(characterId) as {
      inventory: string | null;
    };
    return restoreInventory(row.inventory === null ? null : (JSON.parse(row.inventory) as Inventory));
  }

  setInventory(characterId: number, inventory: Inventory) {
    this.db.prepare("UPDATE characters SET inventory = ? WHERE id = ?").run(JSON.stringify(inventory), characterId);
  }

  coins(lineageId: number): number {
    return (this.db.prepare("SELECT coins FROM lineages WHERE id = ?").get(lineageId) as { coins: number }).coins;
  }

  stash(lineageId: number): Stash {
    const row = this.db.prepare("SELECT stash FROM lineages WHERE id = ?").get(lineageId) as { stash: string | null };
    return restoreStash(row.stash === null ? null : (JSON.parse(row.stash) as Stash));
  }

  // Venda, compra ou baú, na cidade: a mochila do personagem e as moedas/o baú da linhagem gravados juntos, para uma
  // queda no meio não deixar item duplicado nem sumido.
  saveCityChange(record: CharacterRecord, change: { inventory: Inventory; coins?: number; stash?: Stash }) {
    this.db.transaction(() => {
      this.setInventory(record.characterId, change.inventory);
      if (change.coins !== undefined) {
        this.db.prepare("UPDATE lineages SET coins = ? WHERE id = ?").run(change.coins, record.lineageId);
      }
      if (change.stash !== undefined) {
        this.db.prepare("UPDATE lineages SET stash = ? WHERE id = ?").run(JSON.stringify(change.stash), record.lineageId);
      }
    })();
  }

  close() {
    this.db.close();
  }
}
