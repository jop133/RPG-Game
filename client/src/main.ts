import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import {
  EXIT_RADIUS,
  EXTRACT_MS,
  HUNGER_MAX,
  INVENTORY_SLOTS,
  ITEMS,
  MOB_KINDS,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  mobStrikeArc,
  xpForNextLevel,
  type DeathCause,
  type ExtractionResult,
  type FirstKillMessage,
  type ItemId,
  type MobKind,
  type MoveInput,
  type Vec2,
} from "shared";
import mapUrl from "../../assets/maps/test.json?url";
import tilesetUrl from "../../assets/tilesets/placeholder.png";

// Só o que o cliente lê do estado do servidor. O formato real está em server/src/state.ts.
interface PlayerView extends Vec2 {
  hp: number;
  maxHp: number;
  attackSeq: number;
  attackAngle: number;
  // Só chegam para o próprio jogador; para os outros ficam undefined.
  hunger?: number;
  extractMs?: number;
  xp?: number;
  level?: number;
  essences?: { forEach(callback: (item: string) => void): void };
  inventory?: { forEach(callback: (slot: { item: string; count: number }, index: number) => void): void };
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
  loot: { forEach(callback: (pile: Vec2, id: string) => void): void };
  exits: { forEach(callback: (exit: Vec2, id: string) => void): void };
}

const SERVER_URL = `ws://${window.location.hostname}:2567`;

// Por aba (sessionStorage): sobrevive a recarregar a página, não a fechar a aba. Duas abas = dois jogadores.
const RECONNECTION_TOKEN_KEY = "rpg-extracao:reconnectionToken";
// Último nome usado, só para vir preenchido (localStorage: conveniência, não identidade).
const LAST_NAME_KEY = "rpg-extracao:lastName";
const SELF_COLOR = 0x4caf50;
const OTHER_COLOR = 0xe53935;
const MOB_COLORS: Record<MobKind, number> = { rato: 0x9e9e9e, goblin: 0xcddc39 };
const MOB_NAMES: Record<MobKind, string> = { rato: "um rato", goblin: "um goblin" };

// Ordem de desenho: aviso de golpe no chão, mobs por baixo dos jogadores, barras e golpes por cima de tudo.
const EXIT_DEPTH = 0.4;
const TELEGRAPH_DEPTH = 0.5;
const LOOT_DEPTH = 0.8;
const MOB_DEPTH = 1;
const PLAYER_DEPTH = 2;
const OVERLAY_DEPTH = 3;
const HUD_DEPTH = 10;

// Barra de fome fixa no canto superior esquerdo (não acompanha a câmera).
const HUD_MARGIN = 16;
const HUNGER_BAR = { width: 160, height: 10 };
const HUNGER_COLOR = 0xffb300;
const XP_COLOR = 0x7e57c2;
const TOAST_MS = 2500;
const LOOT_SIZE = 12;
const LOOT_COLOR = 0x8d6e63;
const EXIT_COLOR = 0x40c4ff;

// Barra de inventário fixa, embaixo e no centro.
const SLOT_SIZE = 36;
const SLOT_GAP = 4;
const ITEM_COLORS: Record<ItemId, number> = {
  racao: 0xc8a165,
  pele_de_rato: 0x8d8d8d,
  dente_de_goblin: 0xf5f5dc,
  essencia_rato: 0xb39ddb,
  essencia_goblin: 0x9ccc65,
  essencia_goblin_rara: 0xffd54f,
};
// Tecla de cada slot, na ordem: 1–9, 0, - e = (12 slots, só 10 teclas de número).
const SLOT_KEYS = [
  { code: Phaser.Input.Keyboard.KeyCodes.ONE, label: "1" },
  { code: Phaser.Input.Keyboard.KeyCodes.TWO, label: "2" },
  { code: Phaser.Input.Keyboard.KeyCodes.THREE, label: "3" },
  { code: Phaser.Input.Keyboard.KeyCodes.FOUR, label: "4" },
  { code: Phaser.Input.Keyboard.KeyCodes.FIVE, label: "5" },
  { code: Phaser.Input.Keyboard.KeyCodes.SIX, label: "6" },
  { code: Phaser.Input.Keyboard.KeyCodes.SEVEN, label: "7" },
  { code: Phaser.Input.Keyboard.KeyCodes.EIGHT, label: "8" },
  { code: Phaser.Input.Keyboard.KeyCodes.NINE, label: "9" },
  { code: Phaser.Input.Keyboard.KeyCodes.ZERO, label: "0" },
  { code: Phaser.Input.Keyboard.KeyCodes.MINUS, label: "-" },
  { code: Phaser.Input.Keyboard.KeyCodes.PLUS, label: "=" },
];

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
  private lootSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private pickupKey?: Phaser.Input.Keyboard.Key;
  private lastSentInput = "";
  private overlay?: Phaser.GameObjects.Graphics;
  private telegraphs?: Phaser.GameObjects.Graphics;
  private hud?: Phaser.GameObjects.Graphics;
  private exitsLayer?: Phaser.GameObjects.Graphics;
  private extractLabel?: Phaser.GameObjects.Text;
  private levelLabel?: Phaser.GameObjects.Text;
  private essenceLabel?: Phaser.GameObjects.Text;
  private toast?: Phaser.GameObjects.Text;
  private toastUntil = 0;
  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  private slotLabels: Phaser.GameObjects.Text[] = [];
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
    this.exitsLayer = this.add.graphics().setDepth(EXIT_DEPTH);
    this.extractLabel = this.add
      .text(this.scale.width / 2, HUD_MARGIN, "", { fontSize: "16px", color: "#40c4ff" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.add.text(HUD_MARGIN, HUD_MARGIN, "Fome", { fontSize: "12px", color: "#ffffff" }).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.levelLabel = this.add
      .text(HUD_MARGIN, HUD_MARGIN + 34, "", { fontSize: "12px", color: "#ffffff" })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.essenceLabel = this.add
      .text(HUD_MARGIN, HUD_MARGIN + 62, "", { fontSize: "12px", color: "#ffffff" })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.toast = this.add
      .text(this.scale.width / 2, this.scale.height / 3, "", { fontSize: "18px", color: "#ffd54f", align: "center" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    // Antes de registrar as teclas do jogo: o Phaser as captura e o campo de nome não conseguiria recebê-las.
    const room = await connect(new Client(SERVER_URL));
    if (!room) return;
    this.keys = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as MoveKeys;
    this.pickupKey = this.input.keyboard?.addKey("F");
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const { x, y } = slotPosition(this.scale.width, this.scale.height, i);
      const key = SLOT_KEYS[i];
      if (key) {
        const phaserKey = this.input.keyboard?.addKey(key.code);
        if (phaserKey) this.slotKeys[i] = phaserKey;
        this.add.text(x + SLOT_SIZE - 9, y + 2, key.label, { fontSize: "9px", color: "#9e9e9e" }).setScrollFactor(0).setDepth(HUD_DEPTH + 1);
      }
      const label = this.add.text(x + 2, y + 2, "", { fontSize: "10px", color: "#ffffff" });
      this.slotLabels.push(label.setScrollFactor(0).setDepth(HUD_DEPTH + 1));
    }
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.sendAttack(pointer));
    sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken);
    // O Colyseus troca o token a cada reconexão; o guardado precisa acompanhar.
    room.onReconnect(() => sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken));
    room.onMessage("extracted", (result: ExtractionResult) => {
      this.room = undefined;
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
      showEndScreen("Você extraiu", describeLoot(result));
    });
    room.onMessage("firstKill", (info: FirstKillMessage) => {
      const levelUp = info.leveledUp ? `
Subiu para o nível ${info.level}!` : "";
      this.showToast(`Primeira morte: ${MOB_NAMES[info.mob]} (+XP)${levelUp}`);
    });
    room.onMessage("notice", (notice: { text: string }) => this.showToast(notice.text));
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

  // Aviso curto no centro da tela.
  private showToast(text: string) {
    this.lastToastText = text;
    this.toastUntil = this.time.now + TOAST_MS;
  }

  private lastToastText = "";

  update(time: number) {
    if (!this.room || !this.keys || !this.overlay || !this.telegraphs || !this.hud) return;
    this.sendInputIfChanged(this.room, this.keys);
    this.slotKeys.forEach((key, slot) => {
      if (Phaser.Input.Keyboard.JustDown(key)) this.room?.send("use", { slot });
    });
    if (this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) this.room.send("pickup");
    const room = this.room;
    syncSprites(room.state.players, this.playerSprites, (_, id) => this.createPlayerSprite(id, room.sessionId));
    syncSprites(room.state.mobs, this.mobSprites, (mob) => this.createMobSprite(mob.kind as MobKind));
    syncSprites(room.state.loot, this.lootSprites, () => this.createLootSprite());
    this.collectSwings(this.room, time);
    this.drawOverlay(this.room, this.overlay, time);
    this.drawTelegraphs(this.room, this.telegraphs, time);
    this.drawHud(this.room, this.hud);
    if (this.exitsLayer) this.drawExits(this.room, this.exitsLayer);
  }

  // Portal ativo: anel no chão do tamanho exato da área em que a extração conta.
  private drawExits(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    g.clear();
    room.state.exits.forEach((exit) => {
      g.fillStyle(EXIT_COLOR, 0.15);
      g.fillCircle(exit.x, exit.y, EXIT_RADIUS);
      g.lineStyle(2, EXIT_COLOR, 0.9);
      g.strokeCircle(exit.x, exit.y, EXIT_RADIUS);
    });
  }

  private drawHud(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    g.clear();
    let hunger: number | undefined;
    room.state.players.forEach((player, sessionId) => {
      if (sessionId === room.sessionId) hunger = player.hunger;
    });
    let extractMs = 0;
    room.state.players.forEach((player, sessionId) => {
      if (sessionId === room.sessionId) extractMs = player.extractMs ?? 0;
    });
    const label = extractMs > 0 ? `Extraindo… ${((EXTRACT_MS - extractMs) / 1000).toFixed(1)} s` : "";
    if (this.extractLabel && this.extractLabel.text !== label) this.extractLabel.setText(label);
    this.drawProgress(room, g);
    if (hunger === undefined) return;
    const top = HUD_MARGIN + 16;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width, HUNGER_BAR.height);
    g.fillStyle(HUNGER_COLOR, 1);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width * (hunger / HUNGER_MAX), HUNGER_BAR.height);
    this.drawInventory(room, g);
  }

  // Nível e barra de XP até o próximo nível; e o aviso de primeira morte enquanto durar.
  private drawProgress(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    let xp = 0;
    let level = 1;
    room.state.players.forEach((player, sessionId) => {
      if (sessionId !== room.sessionId) return;
      xp = player.xp ?? 0;
      level = player.level ?? 1;
    });
    const next = xpForNextLevel(level);
    const levelText = next === undefined ? `Nível ${level} (máximo)` : `Nível ${level}  ·  XP ${xp}/${next}`;
    if (this.levelLabel && this.levelLabel.text !== levelText) this.levelLabel.setText(levelText);
    const top = HUD_MARGIN + 50;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width, 6);
    g.fillStyle(XP_COLOR, 1);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width * (next === undefined ? 1 : Math.min(1, xp / next)), 6);
    const toastText = this.time.now < this.toastUntil ? this.lastToastText : "";
    const names: string[] = [];
    room.state.players.forEach((player, sessionId) => {
      if (sessionId === room.sessionId) player.essences?.forEach((item) => names.push(ITEMS[item as ItemId].name.replace("Essência ", "")));
    });
    const essenceText = `Essências (${names.length}/${level})${names.length > 0 ? ": " + names.join(", ") : ""}`;
    if (this.essenceLabel && this.essenceLabel.text !== essenceText) this.essenceLabel.setText(essenceText);
    if (this.toast && this.toast.text !== toastText) this.toast.setText(toastText);
  }

  private drawInventory(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    let inventory: PlayerView["inventory"];
    room.state.players.forEach((player, sessionId) => {
      if (sessionId === room.sessionId) inventory = player.inventory;
    });
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const { x, y } = slotPosition(this.scale.width, this.scale.height, i);
      g.fillStyle(0x000000, 0.6);
      g.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
    }
    inventory?.forEach((slot, i) => {
      const label = this.slotLabels[i];
      const text = slot.count > 0 ? `${ITEMS[slot.item as ItemId].name.slice(0, 3)}
${slot.count}` : "";
      if (label && label.text !== text) label.setText(text);
      if (slot.count === 0) return;
      const { x, y } = slotPosition(this.scale.width, this.scale.height, i);
      g.fillStyle(ITEM_COLORS[slot.item as ItemId], 1);
      g.fillRect(x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, SLOT_SIZE / 2 - 3, SLOT_SIZE / 2 - 3);
    });
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
    room.state.players.forEach((player) => drawHpBar(g, player, PLAYER_SIZE, player.hp / (player.maxHp || PLAYER_MAX_HP)));
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

  private createPlayerSprite(sessionId: string, ownSessionId: string) {
    const isSelf = sessionId === ownSessionId;
    const sprite = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, isSelf ? SELF_COLOR : OTHER_COLOR);
    sprite.setDepth(PLAYER_DEPTH);
    if (isSelf) this.cameras.main.startFollow(sprite, true);
    return sprite;
  }

  private createMobSprite(kind: MobKind) {
    const size = MOB_KINDS[kind].size;
    return this.add.rectangle(0, 0, size, size, MOB_COLORS[kind]).setDepth(MOB_DEPTH);
  }

  private createLootSprite() {
    return this.add.rectangle(0, 0, LOOT_SIZE, LOOT_SIZE, LOOT_COLOR).setStrokeStyle(1, 0x000000).setDepth(LOOT_DEPTH);
  }
}

// Deixa os desenhos iguais à coleção que o servidor mandou: cria o que chegou, move o que já existe
// e destrói o que saiu (morreu, foi pego ou saiu do raio de visão).
function syncSprites<T extends Vec2>(
  collection: { forEach(callback: (entity: T, id: string) => void): void },
  sprites: Map<string, Phaser.GameObjects.Rectangle>,
  create: (entity: T, id: string) => Phaser.GameObjects.Rectangle,
) {
  const seen = new Set<string>();
  collection.forEach((entity, id) => {
    seen.add(id);
    let sprite = sprites.get(id);
    if (!sprite) {
      sprite = create(entity, id);
      sprites.set(id, sprite);
    }
    sprite.setPosition(entity.x, entity.y);
  });
  for (const [id, sprite] of sprites) {
    if (seen.has(id)) continue;
    sprite.destroy();
    sprites.delete(id);
  }
}

// Volta ao personagem desta aba, se houver um; senão entra com um novo.
// Se a volta falhar (morreu enquanto estava fora, ou a sala acabou), avisa em vez de começar outro calado.
async function connect(client: Client): Promise<Room<unknown, ServerState> | undefined> {
  const token = sessionStorage.getItem(RECONNECTION_TOKEN_KEY);
  if (!token) return joinWithName(client);
  try {
    return await client.reconnect<ServerState>(token);
  } catch {
    sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
    showEndScreen("Seu personagem se foi", "Ele morreu ou a partida acabou enquanto você estava fora.");
    return undefined;
  }
}

function slotPosition(screenWidth: number, screenHeight: number, index: number): Vec2 {
  const total = INVENTORY_SLOTS * SLOT_SIZE + (INVENTORY_SLOTS - 1) * SLOT_GAP;
  return {
    x: (screenWidth - total) / 2 + index * (SLOT_SIZE + SLOT_GAP),
    y: screenHeight - HUD_MARGIN - SLOT_SIZE,
  };
}

// Pede o nome até o servidor aceitar. O nome identifica a linhagem; o servidor valida e pode recusar.
async function joinWithName(client: Client): Promise<Room<unknown, ServerState>> {
  let error = "";
  for (;;) {
    const name = await askName(error);
    try {
      const room = await client.joinOrCreate<ServerState>("game", { name });
      localStorage.setItem(LAST_NAME_KEY, name);
      return room;
    } catch (e) {
      error = e instanceof Error ? e.message : "Não foi possível entrar.";
    }
  }
}

function askName(error: string): Promise<string> {
  return new Promise((resolve) => {
    const screen = overlayScreen();
    const title = document.createElement("h1");
    title.textContent = "RPG de Extração";
    title.style.margin = "0";
    const label = document.createElement("label");
    label.textContent = "Nome da sua linhagem";
    const input = document.createElement("input");
    input.maxLength = 20;
    input.value = localStorage.getItem(LAST_NAME_KEY) ?? "";
    input.style.cssText = "padding:6px 8px;font-size:16px;";
    const message = document.createElement("p");
    message.textContent = error;
    message.style.cssText = "margin:0;color:#ef5350;min-height:1em;";
    const enter = document.createElement("button");
    enter.textContent = "Entrar";
    enter.style.cssText = "padding:8px 16px;font-size:16px;cursor:pointer;";
    const submit = () => {
      screen.remove();
      resolve(input.value);
    };
    enter.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    screen.append(title, label, input, enter, message);
    document.body.append(screen);
    input.focus();
  });
}

function overlayScreen(): HTMLDivElement {
  const screen = document.createElement("div");
  screen.style.cssText =
    "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:12px;background:rgba(0,0,0,0.8);color:#fff;font-family:sans-serif;";
  return screen;
}

function describeLoot(result: ExtractionResult): string {
  if (result.items.length === 0) return "Saiu de mãos vazias.";
  return "Levou: " + result.items.map((stack) => `${ITEMS[stack.item].name} ×${stack.count}`).join(", ") + ".";
}

function describeDeath(cause: DeathCause): string {
  if (cause.kind === "starvation") return "Morreu de fome.";
  if (cause.kind === "mob") return `Morto por ${MOB_NAMES[cause.mob]}.`;
  return "Morto por outro jogador.";
}

// Fim da run (morte, extração ou personagem perdido). Sem cidade ainda (passo 9), o botão recarrega e pede o nome:
// se o personagem ainda vive (extraiu), volta a ele; se morreu, entra um herdeiro da mesma linhagem.
function showEndScreen(heading: string, detail: string) {
  const screen = overlayScreen();
  const title = document.createElement("h1");
  title.textContent = heading;
  title.style.margin = "0";
  const reason = document.createElement("p");
  reason.textContent = detail;
  reason.style.margin = "0";
  const again = document.createElement("button");
  again.textContent = "Entrar de novo";
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
