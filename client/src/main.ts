import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import {
  MOB_KINDS,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  type MobKind,
  type MoveInput,
  type Vec2,
} from "shared";
import mapUrl from "../../assets/maps/test.json?url";
import tilesetUrl from "../../assets/tilesets/placeholder.png";

// Só o que o cliente lê do estado do servidor. O formato real está em server/src/state.ts.
interface PlayerView extends Vec2 {
  hp: number;
  attackSeq: number;
  attackAngle: number;
}
interface MobView extends Vec2 {
  kind: string;
  hp: number;
}
interface ServerState {
  players: { forEach(callback: (player: PlayerView, sessionId: string) => void): void };
  mobs: { forEach(callback: (mob: MobView, id: string) => void): void };
}

const SERVER_URL = `ws://${window.location.hostname}:2567`;
const SELF_COLOR = 0x4caf50;
const OTHER_COLOR = 0xe53935;
const MOB_COLORS: Record<MobKind, number> = { rato: 0x9e9e9e, goblin: 0xcddc39 };

// Ordem de desenho: mobs por baixo dos jogadores, barras e golpes por cima de tudo.
const MOB_DEPTH = 1;
const PLAYER_DEPTH = 2;
const OVERLAY_DEPTH = 3;

const HP_BAR_HEIGHT = 3;
const HP_BAR_GAP = 4;
const SWING_VISIBLE_MS = 150;
const SWING_RADIUS = PLAYER_ATTACK.range + PLAYER_SIZE / 2;
const SWING_HALF_ARC = (PLAYER_ATTACK.arcDegrees * Math.PI) / 180 / 2;

type MoveKeys = Record<keyof MoveInput, Phaser.Input.Keyboard.Key>;

interface Swing {
  x: number;
  y: number;
  angle: number;
  untilMs: number;
}

class GameScene extends Phaser.Scene {
  private room?: Room<unknown, ServerState>;
  private keys?: MoveKeys;
  private playerSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private mobSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private lastSentInput = "";
  private overlay?: Phaser.GameObjects.Graphics;
  private lastAttackSeq = new Map<string, number>();
  private swings: Swing[] = [];

  preload() {
    this.load.tilemapTiledJSON("map", mapUrl);
    this.load.image("tiles", tilesetUrl);
  }

  async create() {
    this.createMap();
    this.overlay = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.keys = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as MoveKeys;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.sendAttack(pointer));
    const room = await new Client(SERVER_URL).joinOrCreate<ServerState>("game");
    // O join resolve antes do primeiro estado chegar; até lá, `players` não existe.
    room.onStateChange.once(() => {
      this.room = room;
    });
  }

  update(time: number) {
    if (!this.room || !this.keys || !this.overlay) return;
    this.sendInputIfChanged(this.room, this.keys);
    this.syncPlayerSprites(this.room);
    this.syncMobSprites(this.room);
    this.collectSwings(this.room, time);
    this.drawOverlay(this.room, this.overlay, time);
  }

  // Só a direção do clique vai para o servidor; ele decide se o golpe saiu e quem foi atingido.
  private sendAttack(pointer: Phaser.Input.Pointer) {
    const self = this.room && this.playerSprites.get(this.room.sessionId);
    if (!this.room || !self || !pointer.leftButtonDown()) return;
    const target = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.room.send("attack", { angle: Math.atan2(target.y - self.y, target.x - self.x) });
  }

  // Golpe novo = attackSeq mudou desde o último frame. Vale para o próprio jogador e para os outros.
  private collectSwings(room: Room<unknown, ServerState>, time: number) {
    room.state.players.forEach((player, sessionId) => {
      const previous = this.lastAttackSeq.get(sessionId);
      this.lastAttackSeq.set(sessionId, player.attackSeq);
      if (previous === undefined || player.attackSeq === previous) return;
      this.swings.push({ x: player.x, y: player.y, angle: player.attackAngle, untilMs: time + SWING_VISIBLE_MS });
    });
    this.swings = this.swings.filter((swing) => swing.untilMs > time);
  }

  private drawOverlay(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics, time: number) {
    g.clear();
    for (const swing of this.swings) {
      g.fillStyle(0xffffff, 0.35 * ((swing.untilMs - time) / SWING_VISIBLE_MS));
      g.slice(swing.x, swing.y, SWING_RADIUS, swing.angle - SWING_HALF_ARC, swing.angle + SWING_HALF_ARC);
      g.fillPath();
    }
    room.state.players.forEach((player) => drawHpBar(g, player, PLAYER_SIZE, player.hp / PLAYER_MAX_HP));
    room.state.mobs.forEach((mob) => {
      const stats = MOB_KINDS[mob.kind as MobKind];
      drawHpBar(g, mob, stats.size, mob.hp / stats.maxHp);
    });
  }

  // Só desenho: quem decide o que é parede é o servidor.
  private createMap() {
    const map = this.make.tilemap({ key: "map" });
    const tileset = map.tilesets[0];
    if (!tileset) throw new Error("Mapa sem tileset.");
    const tiles = map.addTilesetImage(tileset.name, "tiles");
    if (!tiles) throw new Error(`Não consegui carregar o tileset "${tileset.name}".`);
    for (const layer of map.layers) map.createLayer(layer.name, tiles);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
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

  private syncPlayerSprites(room: Room<unknown, ServerState>) {
    const seen = new Set<string>();
    room.state.players.forEach((player, sessionId) => {
      seen.add(sessionId);
      const sprite = this.playerSprites.get(sessionId) ?? this.createPlayerSprite(sessionId, room.sessionId);
      sprite.setPosition(player.x, player.y);
    });
    for (const [sessionId, sprite] of this.playerSprites) {
      if (seen.has(sessionId)) continue;
      sprite.destroy();
      this.playerSprites.delete(sessionId);
    }
  }

  private createPlayerSprite(sessionId: string, ownSessionId: string) {
    const isSelf = sessionId === ownSessionId;
    const sprite = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, isSelf ? SELF_COLOR : OTHER_COLOR);
    sprite.setDepth(PLAYER_DEPTH);
    if (isSelf) this.cameras.main.startFollow(sprite, true);
    this.playerSprites.set(sessionId, sprite);
    return sprite;
  }

  private syncMobSprites(room: Room<unknown, ServerState>) {
    const seen = new Set<string>();
    room.state.mobs.forEach((mob, id) => {
      seen.add(id);
      const sprite = this.mobSprites.get(id) ?? this.createMobSprite(id, mob.kind as MobKind);
      sprite.setPosition(mob.x, mob.y);
    });
    for (const [id, sprite] of this.mobSprites) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.mobSprites.delete(id);
    }
  }

  private createMobSprite(id: string, kind: MobKind) {
    const size = MOB_KINDS[kind].size;
    const sprite = this.add.rectangle(0, 0, size, size, MOB_COLORS[kind]);
    sprite.setDepth(MOB_DEPTH);
    this.mobSprites.set(id, sprite);
    return sprite;
  }
}

function drawHpBar(g: Phaser.GameObjects.Graphics, at: Vec2, width: number, fraction: number) {
  const left = at.x - width / 2;
  const top = at.y - width / 2 - HP_BAR_GAP - HP_BAR_HEIGHT;
  g.fillStyle(0x000000, 0.6);
  g.fillRect(left, top, width, HP_BAR_HEIGHT);
  g.fillStyle(fraction > 0.3 ? 0x66bb6a : 0xef5350, 1);
  g.fillRect(left, top, width * fraction, HP_BAR_HEIGHT);
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  pixelArt: true,
  scene: GameScene,
});
