import { readFileSync } from "node:fs";
import { Room, type Client } from "colyseus";
import {
  NO_INPUT,
  PLAYER_SIZE,
  TICK_RATE,
  moveWithCollision,
  movementDelta,
  parseCollisionGrid,
  parseMoveInput,
  type MoveInput,
  type TiledMap,
} from "shared";
import { GameState, PlayerState } from "./state";

const MAP_FILE = new URL("../../assets/maps/test.json", import.meta.url);
const collisionGrid = parseCollisionGrid(JSON.parse(readFileSync(MAP_FILE, "utf8")) as TiledMap);

// Provisório: no passo 2b o ponto de spawn vem do mapa do Tiled.
const SPAWN_POINT = { x: 400, y: 300 };

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  state = new GameState();

  // Fora do state de propósito: teclas apertadas não são replicadas para os outros jogadores.
  private moveInputs = new Map<string, MoveInput>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    this.state.players.set(client.sessionId, new PlayerState(SPAWN_POINT));
    this.moveInputs.set(client.sessionId, NO_INPUT);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
  }

  private tick(dtMs: number) {
    this.state.players.forEach((player, sessionId) => {
      const delta = movementDelta(this.moveInputs.get(sessionId) ?? NO_INPUT, dtMs);
      const next = moveWithCollision(collisionGrid, player, delta, PLAYER_SIZE / 2);
      player.x = next.x;
      player.y = next.y;
    });
  }
}
