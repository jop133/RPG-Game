import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import type { MoveInput, Vec2 } from "shared";

// Só o que o cliente lê do estado do servidor. O formato real está em server/src/state.ts.
interface ServerState {
  players: { forEach(callback: (player: Vec2, sessionId: string) => void): void };
}

const SERVER_URL = `ws://${window.location.hostname}:2567`;
const PLAYER_SIZE = 24;
const SELF_COLOR = 0x4caf50;
const OTHER_COLOR = 0xe53935;

type MoveKeys = Record<keyof MoveInput, Phaser.Input.Keyboard.Key>;

class GameScene extends Phaser.Scene {
  private room?: Room<unknown, ServerState>;
  private keys?: MoveKeys;
  private sprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private lastSentInput = "";

  async create() {
    this.keys = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as MoveKeys;
    const room = await new Client(SERVER_URL).joinOrCreate<ServerState>("game");
    // O join resolve antes do primeiro estado chegar; até lá, `players` não existe.
    room.onStateChange.once(() => {
      this.room = room;
    });
  }

  update() {
    if (!this.room || !this.keys) return;
    this.sendInputIfChanged(this.room, this.keys);
    this.syncSprites(this.room);
  }

  private sendInputIfChanged(room: Room<unknown, ServerState>, keys: MoveKeys) {
    const input: MoveInput = {
      up: keys.up.isDown,
      down: keys.down.isDown,
      left: keys.left.isDown,
      right: keys.right.isDown,
    };
    const serialized = JSON.stringify(input);
    if (serialized === this.lastSentInput) return;
    this.lastSentInput = serialized;
    room.send("input", input);
  }

  private syncSprites(room: Room<unknown, ServerState>) {
    const seen = new Set<string>();
    room.state.players.forEach((player, sessionId) => {
      seen.add(sessionId);
      const sprite = this.sprites.get(sessionId) ?? this.createSprite(sessionId, room.sessionId);
      sprite.setPosition(player.x, player.y);
    });
    for (const [sessionId, sprite] of this.sprites) {
      if (seen.has(sessionId)) continue;
      sprite.destroy();
      this.sprites.delete(sessionId);
    }
  }

  private createSprite(sessionId: string, ownSessionId: string) {
    const color = sessionId === ownSessionId ? SELF_COLOR : OTHER_COLOR;
    const sprite = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, color);
    this.sprites.set(sessionId, sprite);
    return sprite;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  scene: GameScene,
});
