import { StateView } from "@colyseus/schema";
import { CloseCode, Room, type Client } from "colyseus";
import {
  AREAS,
  HUNGER_MAX,
  MOB_KINDS,
  NO_INPUT,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  TICK_RATE,
  VIEW_RADIUS,
  applyDamage,
  isInArc,
  isInSwing,
  isOffCooldown,
  mobStrikeArc,
  moveWithCollision,
  movementDelta,
  parseAttackAngle,
  parseMoveInput,
  pickSpawnPoint,
  planMobSpawns,
  shouldSee,
  startIdle,
  starvationDamage,
  stepMob,
  tickHunger,
  type Area,
  type DeathCause,
  type MobKind,
  type MobMind,
  type MoveInput,
  type Vec2,
} from "shared";
import { loadLevel } from "./level";
import { GameState, MobState, OWNER_TAG, PlayerState } from "./state";

const level = loadLevel(new URL("../../assets/maps/test.json", import.meta.url));

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
    this.spawnMobs();
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new PlayerState({
      ...this.entryPoint(),
      hp: PLAYER_MAX_HP,
      attackSeq: 0,
      attackAngle: 0,
      hunger: HUNGER_MAX,
    });
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
      this.state.mobs.delete(id);
      this.mobBrains.delete(id);
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
    }
  }
}

function updateVisibility(view: StateView, observer: Vec2, entity: PlayerState | MobState) {
  const seen = view.has(entity);
  const see = shouldSee(observer, entity, VIEW_RADIUS, seen);
  if (see && !seen) view.add(entity);
  if (!see && seen) view.remove(entity);
}
