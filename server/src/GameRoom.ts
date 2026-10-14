import { StateView } from "@colyseus/schema";
import { Room, type Client } from "colyseus";
import {
  AREAS,
  MOB_KINDS,
  NO_INPUT,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  TICK_RATE,
  VIEW_RADIUS,
  applyDamage,
  isInSwing,
  isOffCooldown,
  moveWithCollision,
  movementDelta,
  parseAttackAngle,
  parseMoveInput,
  pickSpawnPoint,
  planMobSpawns,
  shouldSee,
  startIdle,
  stepWander,
  type Area,
  type MobKind,
  type MoveInput,
  type Vec2,
  type WanderState,
} from "shared";
import { loadLevel } from "./level";
import { GameState, MobState, PlayerState } from "./state";

const level = loadLevel(new URL("../../assets/maps/test.json", import.meta.url));

// O que o servidor precisa saber de um mob para movê-lo, e que o cliente não precisa ver.
interface MobBrain {
  kind: MobKind;
  area: Area;
  wander: WanderState;
}

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  state = new GameState();

  // Fora do state de propósito: teclas apertadas não são replicadas para os outros jogadores.
  private moveInputs = new Map<string, MoveInput>();
  private lastAttackMs = new Map<string, number>();
  private mobBrains = new Map<string, MobBrain>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.onMessage("attack", (client, message) => this.handleAttack(client.sessionId, message));
    this.spawnMobs();
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new PlayerState({ ...this.entryPoint(), hp: PLAYER_MAX_HP, attackSeq: 0, attackAngle: 0 });
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, NO_INPUT);
    client.view = new StateView();
    client.view.add(player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    this.lastAttackMs.delete(client.sessionId);
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
      player.hp = applyDamage(player.hp, PLAYER_ATTACK.damage);
      if (player.hp === 0) this.respawnPlayer(player);
    });
  }

  // PROVISÓRIO até o passo 5 (morte de verdade): vida zero só manda o jogador de volta à entrada.
  private respawnPlayer(player: PlayerState) {
    const point = this.entryPoint();
    player.x = point.x;
    player.y = point.y;
    player.hp = PLAYER_MAX_HP;
  }

  // Uma vez, quando a sala nasce: cada área recebe os mobs de AREAS em tiles de chão sorteados.
  private spawnMobs() {
    let nextId = 1;
    for (const area of level.areas) {
      const cells = level.floorCells.get(area.name) ?? [];
      const counts = AREAS[area.name]?.mobs ?? {};
      for (const { kind, position } of planMobSpawns(cells, counts, Math.random)) {
        const id = `mob-${nextId++}`;
        this.state.mobs.set(id, new MobState({ kind, ...position, hp: MOB_KINDS[kind].maxHp }));
        this.mobBrains.set(id, { kind, area, wander: startIdle(Math.random) });
      }
    }
  }

  private tick(dtMs: number) {
    this.movePlayers(dtMs);
    this.moveMobs(dtMs);
    this.updateViews();
  }

  private moveMobs(dtMs: number) {
    this.state.mobs.forEach((mob, id) => {
      const brain = this.mobBrains.get(id);
      if (!brain) return;
      const next = stepWander(
        { position: { x: mob.x, y: mob.y }, wander: brain.wander },
        brain.area,
        level.grid,
        MOB_KINDS[brain.kind],
        dtMs,
        Math.random,
      );
      mob.x = next.position.x;
      mob.y = next.position.y;
      brain.wander = next.wander;
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
