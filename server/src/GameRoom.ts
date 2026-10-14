import { fileURLToPath } from "node:url";
import { StateView } from "@colyseus/schema";
import { CloseCode, Room, ServerError, type Client } from "colyseus";
import {
  AREAS,
  EXITS_ACTIVE,
  HUNGER_MAX,
  INVENTORY_SLOTS,
  MOB_KINDS,
  NO_INPUT,
  PICKUP_RADIUS,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  STARTING_ITEMS,
  TICK_RATE,
  VIEW_RADIUS,
  applyDamage,
  isInArc,
  isInSwing,
  inventoryToPile,
  isInsideExit,
  isOffCooldown,
  mobStrikeArc,
  moveWithCollision,
  movementDelta,
  nearestWithin,
  parseAttackAngle,
  parseMoveInput,
  parsePlayerName,
  parseSlotIndex,
  pickActiveExits,
  pickSpawnPoint,
  planMobSpawns,
  rollDrops,
  shouldSee,
  startIdle,
  startingInventory,
  starvationDamage,
  stepExtraction,
  stepMob,
  takeFromPile,
  tickHunger,
  useSlot,
  type Area,
  type DeathCause,
  type ExtractionResult,
  type Inventory,
  type ItemStack,
  type MobKind,
  type MobMind,
  type MoveInput,
  type Vec2,
} from "shared";
import { type CharacterRecord, Store } from "./db";
import { loadLevel } from "./level";
import { ExitState, GameState, ItemSlotState, LootState, MobState, OWNER_TAG, PlayerState } from "./state";

const level = loadLevel(new URL("../../assets/maps/test.json", import.meta.url));

// DB_FILE permite um banco separado (ex.: servidores de teste não tocam no banco de verdade).
const store = new Store(process.env.DB_FILE ?? fileURLToPath(new URL("../../data/rpg-extracao.db", import.meta.url)));

// Personagens dentro de alguma sala agora (conectados ou esperando reconexão), neste processo.
// Impede o mesmo personagem de entrar duas vezes (ex.: o mesmo nome em duas abas).
const charactersInside = new Set<number>();

// O que o servidor precisa saber de um mob para movê-lo, e que o cliente não precisa ver.
interface MobBrain {
  kind: MobKind;
  area: Area;
  homeCells: Vec2[];
  mind: MobMind;
}

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  state = new GameState();

  // Fora do state de propósito: teclas apertadas não são replicadas para os outros jogadores.
  private moveInputs = new Map<string, MoveInput>();
  private lastAttackMs = new Map<string, number>();
  // A verdade do inventário. PlayerState.inventory só espelha isto para o dono ver.
  private inventories = new Map<string, Inventory>();
  // Conteúdo das pilhas no chão, por id. O cliente só recebe a posição (LootState).
  private lootPiles = new Map<string, ItemStack[]>();
  private nextLootId = 1;
  // Portais ativos desta run (sorteados uma vez) e contagem de extração de cada jogador.
  private activeExits: Vec2[] = [];
  private extractProgress = new Map<string, number>();
  // Quem é cada sessão no banco.
  private characters = new Map<string, CharacterRecord>();
  private mobBrains = new Map<string, MobBrain>();
  // Mortes do tick (ou do golpe) atual. Resolvidas depois dos laços, para não remover jogador no meio de um forEach.
  private deaths = new Map<string, DeathCause>();
  // Jogadores com a conexão caída: o personagem continua no mundo esperando eles voltarem.
  private reconnections = new Map<string, ReturnType<Room["allowReconnection"]>>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.onMessage("attack", (client, message) => this.handleAttack(client.sessionId, message));
    this.onMessage("use", (client, message) => this.handleUse(client.sessionId, message));
    this.onMessage("pickup", (client) => this.handlePickup(client.sessionId));
    this.spawnMobs();
    this.openExits();
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  // Porta de entrada: valida o nome e acha (ou cria) o personagem. Recusa quem já está no labirinto.
  onAuth(_client: Client, options: unknown): CharacterRecord {
    const name = parsePlayerName((options as { name?: unknown } | undefined)?.name);
    if (!name) throw new ServerError(400, "Nome inválido: use de 2 a 20 letras, números, espaço, - ou _.");
    const record = store.enter(name);
    if (charactersInside.has(record.characterId)) {
      throw new ServerError(409, `${record.name} já está no labirinto.`);
    }
    charactersInside.add(record.characterId);
    return record;
  }

  onJoin(client: Client) {
    this.characters.set(client.sessionId, client.auth as CharacterRecord);
    const player = new PlayerState({
      ...this.entryPoint(),
      hp: PLAYER_MAX_HP,
      attackSeq: 0,
      attackAngle: 0,
      hunger: HUNGER_MAX,
      extractMs: 0,
    });
    for (let i = 0; i < INVENTORY_SLOTS; i++) player.inventory.push(new ItemSlotState({ item: "", count: 0 }));
    this.setInventory(client.sessionId, player, startingInventory(STARTING_ITEMS));
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, NO_INPUT);
    client.view = new StateView();
    // Com OWNER_TAG: o próprio jogador recebe também os campos privados (a fome).
    client.view.add(player, OWNER_TAG);
  }

  // Queda de conexão (não intencional): o personagem fica parado no mundo, vulnerável, e a fome continua (regra 6).
  // Sem prazo: sem comida, a fome mata o personagem em poucos minutos, e a morte cancela a espera.
  onDrop(client: Client) {
    this.moveInputs.set(client.sessionId, NO_INPUT);
    const reconnection = this.allowReconnection(client, "manual");
    this.reconnections.set(client.sessionId, reconnection);
    const forget = () => this.reconnections.delete(client.sessionId);
    reconnection.then(forget, forget);
  }

  onLeave(client: Client) {
    this.removePlayer(client.sessionId);
  }

  private removePlayer(sessionId: string) {
    this.state.players.delete(sessionId);
    this.moveInputs.delete(sessionId);
    this.lastAttackMs.delete(sessionId);
    this.inventories.delete(sessionId);
    this.extractProgress.delete(sessionId);
    const record = this.characters.get(sessionId);
    if (record) charactersInside.delete(record.characterId);
    this.characters.delete(sessionId);
  }

  private openExits() {
    this.activeExits = pickActiveExits(level.exitCandidates, EXITS_ACTIVE, Math.random);
    this.activeExits.forEach((exit, i) => this.state.exits.set(`exit-${i + 1}`, new ExitState(exit)));
  }

  // Só conta para quem está conectado: um corpo largado num portal não extrai sozinho.
  private updateExtraction(dtMs: number) {
    const done: string[] = [];
    this.state.players.forEach((player, sessionId) => {
      const connected = this.clients.getById(sessionId) !== undefined;
      const inside = connected && isInsideExit(player, this.activeExits);
      const step = stepExtraction(this.extractProgress.get(sessionId) ?? 0, inside, dtMs);
      this.extractProgress.set(sessionId, step.progressMs);
      player.extractMs = step.progressMs;
      if (step.done) done.push(sessionId);
    });
    for (const sessionId of done) this.extractPlayer(sessionId);
  }

  // Extraiu: sai da sala levando tudo o que carregava. Ninguém deixa pilha ao extrair.
  private extractPlayer(sessionId: string) {
    const client = this.clients.getById(sessionId);
    const inventory = this.inventories.get(sessionId);
    const result: ExtractionResult = { items: inventory ? inventoryToPile(inventory) : [] };
    const record = this.characters.get(sessionId);
    if (record) store.creditExtraction(record.lineageId, result.items);
    client?.send("extracted", result);
    this.removePlayer(sessionId);
    client?.leave(CloseCode.CONSENTED);
  }

  private setInventory(sessionId: string, player: PlayerState, inventory: Inventory) {
    this.inventories.set(sessionId, inventory);
    inventory.forEach((slot, i) => {
      const view = player.inventory[i];
      if (!view) return;
      view.item = slot?.item ?? "";
      view.count = slot?.count ?? 0;
    });
  }

  // O jogador escolhe o slot (tecla do número). O servidor confere o que há nele e aplica o efeito.
  private handleUse(sessionId: string, message: unknown) {
    const slot = parseSlotIndex(message);
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    const result = slot !== undefined && player && inventory && useSlot(inventory, slot, player.hunger);
    if (!player || !result) return;
    player.hunger = result.hunger;
    this.setInventory(sessionId, player, result.inventory);
  }

  // Toda perda de vida de jogador passa por aqui, para a morte nunca ser esquecida em algum caminho.
  private damagePlayer(sessionId: string, player: PlayerState, amount: number, cause: DeathCause) {
    if (player.hp === 0) return;
    player.hp = applyDamage(player.hp, amount);
    if (player.hp === 0) this.deaths.set(sessionId, cause);
  }

  // Morte definitiva: avisa o jogador com a causa, tira o personagem da sala e desconecta.
  private resolveDeaths() {
    for (const [sessionId, cause] of this.deaths) {
      const client = this.clients.getById(sessionId);
      // O que ele carregava fica no chão, para quem pegar (aliado ou não).
      const body = this.state.players.get(sessionId);
      const inventory = this.inventories.get(sessionId);
      if (body && inventory) this.dropPile(body, inventoryToPile(inventory));
      const record = this.characters.get(sessionId);
      if (record) store.markDead(record.characterId, cause);
      client?.send("death", cause);
      this.removePlayer(sessionId);
      // CONSENTED: saída intencional. Sem código, o SDK trataria como queda de rede e tentaria reconectar o morto.
      client?.leave(CloseCode.CONSENTED);
      // Morreu desconectado: cancela a espera; ele não volta para um personagem morto.
      this.reconnections.get(sessionId)?.reject(new Error("morreu"));
    }
    this.deaths.clear();
  }

  private entryPoint(): Vec2 {
    return pickSpawnPoint(level.playerEntryPoints, Math.random());
  }

  // O cliente só diz para onde golpeou. Recarga, quem foi atingido e dano são decididos aqui.
  private handleAttack(sessionId: string, message: unknown) {
    const angle = parseAttackAngle(message);
    const attacker = this.state.players.get(sessionId);
    const now = this.clock.currentTime;
    if (angle === undefined || !attacker || !isOffCooldown(this.lastAttackMs.get(sessionId), now)) return;
    this.lastAttackMs.set(sessionId, now);
    attacker.attackSeq += 1;
    attacker.attackAngle = angle;
    this.hitMobs(attacker, angle);
    this.hitPlayers(sessionId, attacker, angle);
    this.resolveDeaths();
  }

  private hitMobs(attacker: Vec2, angle: number) {
    const dead: string[] = [];
    this.state.mobs.forEach((mob, id) => {
      if (!isInSwing(attacker, angle, mob, MOB_KINDS[mob.kind as MobKind].size / 2)) return;
      mob.hp = applyDamage(mob.hp, PLAYER_ATTACK.damage);
      if (mob.hp === 0) dead.push(id);
    });
    for (const id of dead) {
      const mob = this.state.mobs.get(id);
      if (mob) this.dropPile(mob, rollDrops(mob.kind as MobKind, Math.random));
      this.state.mobs.delete(id);
      this.mobBrains.delete(id);
    }
  }

  private dropPile(at: Vec2, items: ItemStack[]) {
    if (items.length === 0) return;
    const id = `loot-${this.nextLootId++}`;
    this.lootPiles.set(id, items);
    this.state.loot.set(id, new LootState({ x: at.x, y: at.y }));
  }

  // F: pega da pilha mais próxima o que couber no inventário. O que não couber fica no chão.
  private handlePickup(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    if (!player || !inventory) return;
    const positions = new Map<string, Vec2>();
    this.state.loot.forEach((pile, id) => positions.set(id, pile));
    const id = nearestWithin(player, positions, PICKUP_RADIUS);
    const pile = id && this.lootPiles.get(id);
    if (!id || !pile) return;
    const result = takeFromPile(inventory, pile);
    this.setInventory(sessionId, player, result.inventory);
    if (result.pile.length > 0) {
      this.lootPiles.set(id, result.pile);
    } else {
      this.lootPiles.delete(id);
      this.state.loot.delete(id);
    }
  }

  // Fogo amigo: o golpe acerta qualquer outro jogador no arco.
  private hitPlayers(attackerId: string, attacker: Vec2, angle: number) {
    this.state.players.forEach((player, sessionId) => {
      if (sessionId === attackerId || !isInSwing(attacker, angle, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, PLAYER_ATTACK.damage, { kind: "player" });
    });
  }

  // Uma vez, quando a sala nasce: cada área recebe os mobs de AREAS em tiles de chão sorteados.
  private spawnMobs() {
    let nextId = 1;
    for (const area of level.areas) {
      const cells = level.floorCells.get(area.name) ?? [];
      const counts = AREAS[area.name]?.mobs ?? {};
      for (const { kind, position } of planMobSpawns(cells, counts, Math.random)) {
        const id = `mob-${nextId++}`;
        this.state.mobs.set(id, new MobState({ kind, ...position, hp: MOB_KINDS[kind].maxHp, windup: false, attackAngle: 0 }));
        this.mobBrains.set(id, { kind, area, homeCells: cells, mind: { mode: "wander", wander: startIdle(Math.random) } });
      }
    }
  }

  private tick(dtMs: number) {
    this.movePlayers(dtMs);
    this.starvePlayers(dtMs);
    this.moveMobs(dtMs);
    this.resolveDeaths();
    this.updateExtraction(dtMs);
    this.updateViews();
  }

  private moveMobs(dtMs: number) {
    const players = new Map<string, Vec2>();
    this.state.players.forEach((player, sessionId) => players.set(sessionId, { x: player.x, y: player.y }));
    this.state.mobs.forEach((mob, id) => {
      const brain = this.mobBrains.get(id);
      if (!brain) return;
      const stats = MOB_KINDS[brain.kind];
      const world = { grid: level.grid, home: brain.area, homeCells: brain.homeCells, stats, players };
      const next = stepMob({ position: { x: mob.x, y: mob.y }, mind: brain.mind }, world, dtMs, Math.random);
      mob.x = next.position.x;
      mob.y = next.position.y;
      mob.windup = next.mind.mode === "windup";
      if (next.mind.mode === "windup") mob.attackAngle = next.mind.angle;
      brain.mind = next.mind;
      if (next.strike !== undefined) this.mobStrike(next.position, next.strike, brain.kind);
    });
  }

  // Golpe do mob: acerta todos os jogadores no arco travado, não só o alvo. Mob não fere mob.
  private mobStrike(origin: Vec2, angle: number, kind: MobKind) {
    const stats = MOB_KINDS[kind];
    const arc = mobStrikeArc(stats);
    this.state.players.forEach((player, sessionId) => {
      if (!isInArc(origin, angle, arc, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, stats.attackDamage, { kind: "mob", mob: kind });
    });
  }

  // Fome é tick do servidor (regra 6): cai para todos, e quem está zerado perde vida.
  private starvePlayers(dtMs: number) {
    this.state.players.forEach((player, sessionId) => {
      player.hunger = tickHunger(player.hunger, dtMs);
      const damage = starvationDamage(player.hunger, dtMs);
      if (damage > 0) this.damagePlayer(sessionId, player, damage, { kind: "starvation" });
    });
  }

  private movePlayers(dtMs: number) {
    this.state.players.forEach((player, sessionId) => {
      const delta = movementDelta(this.moveInputs.get(sessionId) ?? NO_INPUT, dtMs);
      const next = moveWithCollision(level.grid, player, delta, PLAYER_SIZE / 2);
      player.x = next.x;
      player.y = next.y;
    });
  }

  // O próprio jogador entra na visão no onJoin e nunca sai; aqui só os outros e os mobs.
  private updateViews() {
    for (const client of this.clients) {
      const view = client.view;
      const self = this.state.players.get(client.sessionId);
      if (!view || !self) continue;
      this.state.players.forEach((other, sessionId) => {
        if (sessionId !== client.sessionId) updateVisibility(view, self, other);
      });
      this.state.mobs.forEach((mob) => updateVisibility(view, self, mob));
      this.state.loot.forEach((pile) => updateVisibility(view, self, pile));
      this.state.exits.forEach((exit) => updateVisibility(view, self, exit));
    }
  }
}

function updateVisibility(view: StateView, observer: Vec2, entity: PlayerState | MobState | LootState | ExitState) {
  const seen = view.has(entity);
  const see = shouldSee(observer, entity, VIEW_RADIUS, seen);
  if (see && !seen) view.add(entity);
  if (!see && seen) view.remove(entity);
}
