import { readFileSync } from "node:fs";
import { Room, type Client } from "colyseus";
import {
  NO_INPUT,
  PLAYER_SIZE,
  SPAWN_LAYER,
  TICK_RATE,
  boxFits,
  moveWithCollision,
  movementDelta,
  parseCollisionGrid,
  parseMoveInput,
  parseSpawnPoints,
  pickSpawnPoint,
  type CollisionGrid,
  type MoveInput,
  type TiledMap,
  type Vec2,
} from "shared";
import { GameState, PlayerState } from "./state";

const MAP_FILE = new URL("../../assets/maps/test.json", import.meta.url);
const map = JSON.parse(readFileSync(MAP_FILE, "utf8")) as TiledMap;
const collisionGrid = parseCollisionGrid(map);
const spawnPoints = loadSpawnPoints(map, collisionGrid);

// Erro de mapa aparece ao subir o servidor, não quando um jogador nasce dentro da parede.
function loadSpawnPoints(tiledMap: TiledMap, grid: CollisionGrid): Vec2[] {
  const points = parseSpawnPoints(tiledMap);
  if (points.length === 0) {
    throw new Error(`O mapa não tem pontos de spawn. Crie uma camada de objetos "${SPAWN_LAYER}" com pontos.`);
  }
  const blocked = points.filter((p) => !boxFits(grid, p, PLAYER_SIZE / 2));
  if (blocked.length > 0) {
    const where = blocked.map((p) => `(${p.x}, ${p.y})`).join(", ");
    throw new Error(`Pontos de spawn encostando em parede: ${where}. O jogador nasceria preso.`);
  }
  return points;
}

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
    this.state.players.set(client.sessionId, new PlayerState(pickSpawnPoint(spawnPoints, Math.random())));
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
