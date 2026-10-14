import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import {
  HUNGER_MAX,
  MOB_KINDS,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  mobStrikeArc,
  type DeathCause,
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
  // Só chega para o próprio jogador; para os outros fica undefined.
  hunger?: number;
}
interface MobView extends Vec2 {
  kind: string;
  hp: number;
  windup: boolean;
  attackAngle: number;
}
interface ServerState {
  players: { forEach(callback: (player: PlayerView, sessionId: string) => void): void };
  mobs: { forEach(callback: (mob: MobView, id: string) => void): void };
}

const SERVER_URL = `ws://${window.location.hostname}:2567`;

// Por aba (sessionStorage): sobrevive a recarregar a página, não a fechar a aba. Duas abas = dois jogadores.
const RECONNECTION_TOKEN_KEY = "rpg-extracao:reconnectionToken";
const SELF_COLOR = 0x4caf50;
const OTHER_COLOR = 0xe53935;
const MOB_COLORS: Record<MobKind, number> = { rato: 0x9e9e9e, goblin: 0xcddc39 };
const MOB_NAMES: Record<MobKind, string> = { rato: "um rato", goblin: "um goblin" };

// Ordem de desenho: aviso de golpe no chão, mobs por baixo dos jogadores, barras e golpes por cima de tudo.
const TELEGRAPH_DEPTH = 0.5;
const MOB_DEPTH = 1;
const PLAYER_DEPTH = 2;
const OVERLAY_DEPTH = 3;
const HUD_DEPTH = 10;

// Barra de fome fixa na tela (não acompanha a câmera).
const HUD_MARGIN = 16;
const HUNGER_BAR = { width: 160, height: 10 };
const HUNGER_COLOR = 0xffb300;

const HP_BAR_HEIGHT = 3;
const HP_BAR_GAP = 4;
const SWING_VISIBLE_MS = 150;
const SWING_RADIUS = PLAYER_ATTACK.range + PLAYER_SIZE / 2;
const SWING_HALF_ARC = (PLAYER_ATTACK.arcDegrees * Math.PI) / 180 / 2;
const TELEGRAPH_COLOR = 0xff1744;

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
  private telegraphs?: Phaser.GameObjects.Graphics;
  private hud?: Phaser.GameObjects.Graphics;
  // Quando este cliente viu cada mob começar a preparar: base para o aviso encher no ritmo certo.
  private windupStartedAt = new Map<string, number>();
  private lastAttackSeq = new Map<string, number>();
  private swings: Swing[] = [];

  preload() {
    this.load.tilemapTiledJSON("map", mapUrl);
    this.load.image("tiles", tilesetUrl);
  }

  async create() {
    this.createMap();
    this.overlay = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.telegraphs = this.add.graphics().setDepth(TELEGRAPH_DEPTH);
    this.hud = this.add.graphics().setDepth(HUD_DEPTH).setScrollFactor(0);
    const hungerLabelY = this.scale.height - HUD_MARGIN - HUNGER_BAR.height - 16;
    this.add.text(HUD_MARGIN, hungerLabelY, "Fome", { fontSize: "12px", color: "#ffffff" }).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.keys = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as MoveKeys;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.sendAttack(pointer));
    const room = await connect(new Client(SERVER_URL));
    if (!room) return;
    sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken);
    // O Colyseus troca o token a cada reconexão; o guardado precisa acompanhar.
    room.onReconnect(() => sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken));
    room.onMessage("death", (cause: DeathCause) => {
      this.room = undefined;
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
      showEndScreen("Você morreu", describeDeath(cause));
    });
    // O join resolve antes do primeiro estado chegar; até lá, `players` não existe.
    room.onStateChange.once(() => {
      this.room = room;
    });
  }

  update(time: number) {
    if (!this.room || !this.keys || !this.overlay || !this.telegraphs || !this.hud) return;
    this.sendInputIfChanged(this.room, this.keys);
    this.syncPlayerSprites(this.room);
    this.syncMobSprites(this.room);
    this.collectSwings(this.room, time);
    this.drawOverlay(this.room, this.overlay, time);
    this.drawTelegraphs(this.room, this.telegraphs, time);
    this.drawHud(this.room, this.hud);
  }

  private drawHud(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    g.clear();
    let hunger: number | undefined;
    room.state.players.forEach((player, sessionId) => {
      if (sessionId === room.sessionId) hunger = player.hunger;
    });
    if (hunger === undefined) return;
    const top = this.scale.height - HUD_MARGIN - HUNGER_BAR.height;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width, HUNGER_BAR.height);
    g.fillStyle(HUNGER_COLOR, 1);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width * (hunger / HUNGER_MAX), HUNGER_BAR.height);
  }

  // Aviso do golpe do mob: contorno = área atingida; preenchimento cresce até a borda no tempo da preparação.
  private drawTelegraphs(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics, time: number) {
    g.clear();
    const preparing = new Set<string>();
    room.state.mobs.forEach((mob, id) => {
      if (!mob.windup) return;
      preparing.add(id);
      const startedAt = this.windupStartedAt.get(id) ?? time;
      this.windupStartedAt.set(id, startedAt);
      const stats = MOB_KINDS[mob.kind as MobKind];
      const arc = mobStrikeArc(stats);
      const half = (arc.degrees * Math.PI) / 180 / 2;
      const progress = Math.min(1, (time - startedAt) / stats.windupMs);
      g.lineStyle(2, TELEGRAPH_COLOR, 0.8);
      g.slice(mob.x, mob.y, arc.range, mob.attackAngle - half, mob.attackAngle + half);
      g.strokePath();
      g.fillStyle(TELEGRAPH_COLOR, 0.35);
      g.slice(mob.x, mob.y, arc.range * progress, mob.attackAngle - half, mob.attackAngle + half);
      g.fillPath();
    });
    for (const id of this.windupStartedAt.keys()) if (!preparing.has(id)) this.windupStartedAt.delete(id);
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

// Volta ao personagem desta aba, se houver um; senão entra com um novo.
// Se a volta falhar (morreu enquanto estava fora, ou a sala acabou), avisa em vez de começar outro calado.
async function connect(client: Client): Promise<Room<unknown, ServerState> | undefined> {
  const token = sessionStorage.getItem(RECONNECTION_TOKEN_KEY);
  if (!token) return client.joinOrCreate<ServerState>("game");
  try {
    return await client.reconnect<ServerState>(token);
  } catch {
    sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
    showEndScreen("Seu personagem se foi", "Ele morreu ou a partida acabou enquanto você estava fora.");
    return undefined;
  }
}

function describeDeath(cause: DeathCause): string {
  if (cause.kind === "starvation") return "Morreu de fome.";
  if (cause.kind === "mob") return `Morto por ${MOB_NAMES[cause.mob]}.`;
  return "Morto por outro jogador.";
}

// O personagem acabou. Sem cidade ainda (passo 9), "novo personagem" só recarrega e entra de novo.
function showEndScreen(heading: string, detail: string) {
  const screen = document.createElement("div");
  screen.style.cssText =
    "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:12px;background:rgba(0,0,0,0.8);color:#fff;font-family:sans-serif;";
  const title = document.createElement("h1");
  title.textContent = heading;
  title.style.margin = "0";
  const reason = document.createElement("p");
  reason.textContent = detail;
  reason.style.margin = "0";
  const again = document.createElement("button");
  again.textContent = "Novo personagem";
  again.style.cssText = "padding:8px 16px;font-size:16px;cursor:pointer;";
  again.addEventListener("click", () => window.location.reload());
  screen.append(title, reason, again);
  document.body.append(screen);
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
