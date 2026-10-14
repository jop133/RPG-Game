import { StateView } from "@colyseus/schema";
import { Room, type Client } from "colyseus";
import {
  AREAS,
  NO_INPUT,
  PLAYER_SIZE,
  TICK_RATE,
  VIEW_RADIUS,
  moveWithCollision,
  movementDelta,
  parseMoveInput,
  pickSpawnPoint,
  planMobSpawns,
  shouldSee,
  type MoveInput,
  type Vec2,
} from "shared";
import { loadLevel } from "./level";
import { GameState, MobState, PlayerState } from "./state";

const level = loadLevel(new URL("../../assets/maps/test.json", import.meta.url));

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  state = new GameState();

  // Fora do state de propósito: teclas apertadas não são replicadas para os outros jogadores.
  private moveInputs = new Map<string, MoveInput>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.spawnMobs();
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new PlayerState(pickSpawnPoint(level.playerEntryPoints, Math.random()));
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, NO_INPUT);
    client.view = new StateView();
    client.view.add(player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
  }

  // Uma vez, quando a sala nasce: cada área recebe os mobs de AREAS em tiles de chão sorteados.
  private spawnMobs() {
    let nextId = 1;
    for (const [areaName, config] of Object.entries(AREAS)) {
      const cells = level.floorCells.get(areaName) ?? [];
      for (const { kind, position } of planMobSpawns(cells, config.mobs, Math.random)) {
        this.state.mobs.set(`mob-${nextId++}`, new MobState({ kind, ...position }));
      }
    }
  }

  private tick(dtMs: number) {
    this.movePlayers(dtMs);
    this.updateViews();
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
