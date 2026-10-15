import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import {
  CITY_PORTAL_RADIUS,
  CLASS_IDS,
  CLASS_REQUIRED_CODE,
  GID_MASK,
  EXIT_RADIUS,
  EXTRACT_MS,
  HUNGER_MAX,
  INVENTORY_SLOTS,
  ITEMS,
  MOB_KINDS,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  PORTAL_LAYER,
  isAtPortal,
  mobStrikeArc,
  viewportSize,
  xpForNextLevel,
  type ClassId,
  type DeathCause,
  type ExtractionResult,
  type FirstKillMessage,
  type ItemId,
  type MobKind,
  type MoveInput,
  type TiledMap,
  type Vec2,
} from "shared";
import { openRegistration, type Registration } from "./registration";
import cityMapUrl from "../../assets/maps/city.json?url";
import labyrinthMapUrl from "../../assets/maps/dungeon_floor1.json?url";

// Só o que o cliente lê do estado do servidor. O formato real está em server/src/state.ts.
interface PlayerView extends Vec2 {
  name?: string;
  classId?: string;
  // Só no labirinto: a cidade não tem vida nem combate.
  hp?: number;
  maxHp?: number;
  attackSeq?: number;
  attackAngle?: number;
  // Só chegam para o próprio jogador; para os outros ficam undefined. Fome e extração, só no labirinto.
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
// O formato da cidade (server/src/state.ts, CityState) é o do labirinto sem mobs, pilhas e saídas.
interface ServerState {
  players: { forEach(callback: (player: PlayerView, sessionId: string) => void): void };
  mobs?: { forEach(callback: (mob: MobView, id: string) => void): void };
  loot?: { forEach(callback: (pile: Vec2, id: string) => void): void };
  exits?: { forEach(callback: (exit: Vec2, id: string) => void): void };
}

// Cada lugar é uma sala do servidor com o seu mapa.
type Place = "city" | "labyrinth";
const MAP_URLS: Record<Place, string> = { city: cityMapUrl, labyrinth: labyrinthMapUrl };
// Todas as folhas de tiles do projeto. No Tiled, o nome de cada tileset é o nome do arquivo sem ".png":
// é por esse nome que o mapa encontra a imagem, qualquer que seja o lugar.
// A chave de cada imagem é o caminho dentro de assets/tilesets, sem ".png" (ex.: "city/houses/casa-2").
// Fica de fora o que não vai para o jogo (ex.: "novos tilesets", as imagens originais, grandes).
const TILESET_URLS = Object.entries(
  import.meta.glob<string>(
    ["../../assets/tilesets/*.png", "../../assets/tilesets/city/**/*.png", "../../assets/tilesets/labyrinth/**/*.png"],
    {
      eager: true,
      query: "?url",
      import: "default",
    },
  ),
).map(([path, url]) => ({ key: imageKey(path), url }));

// Sprites das classes (64x64, 8 direções): chave "characters/<classe>/<direção>".
// Sprites das classes: parado ("characters/<classe>/<direção>", 64x64) e caminhada ("characters/<classe>/walk-<direção>",
// fita de 6 quadros de 96x96, gerada por tools/assets/process_ui.py a partir dos GIFs).
const CHARACTER_URLS = Object.entries(
  import.meta.glob<string>("../../assets/characters/*/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ key: path.slice(path.indexOf("characters/"), -".png".length), url }));
const IDLE_URLS = CHARACTER_URLS.filter(({ key }) => !key.includes("/walk-"));
// Sprites dos inimigos (64x64, 8 direções, parados): "mobs/<tipo>/<direção>". A pasta de cada um tem o nome do tipo
// (assets/tilesets/Inimigos/Lobo -> "lobo").
const MOB_URLS = Object.entries(
  import.meta.glob<string>("../../assets/tilesets/Inimigos/*/Idle/rotations/*.png", {
    eager: true,
    query: "?url",
    import: "default",
  }),
).map(([path, url]) => {
  const [, kind = "", direction = ""] = /Inimigos\/([^/]+)\/Idle\/rotations\/([^/]+)\.png$/.exec(path) ?? [];
  return { key: mobKey(kind.toLowerCase(), direction), url };
});
const MOB_FRAME = 64;
// Linha dos pés e altura do bicho em cada sprite (medidas nas imagens, em pixels de 64). Os pés ficam na base da
// caixa de colisão, como os do jogador; a altura põe a barra de vida acima da cabeça. Desenhados em 1:1, como as classes.
const MOB_ART: Record<MobKind, { feet: number; height: number }> = {
  goblin: { feet: 61, height: 59 },
  lobo: { feet: 62, height: 60 },
  gnomo: { feet: 61, height: 60 },
  slime: { feet: 58, height: 44 },
};
const WALK_URLS = CHARACTER_URLS.filter(({ key }) => key.includes("/walk-"));
// Mesma escala nos dois (personagem com ~60 px de altura); muda só a margem do quadro. O pivô fica nos pés:
// linha 61 de 64 parado, 78 de 96 andando. Assim os pés não pulam ao trocar de parado para andando.
const AVATAR_FEET = 61 / 64;
const WALK_FRAME = 96;
const WALK_FEET = 78 / 96;
const AVATAR_HEIGHT = 60;
const WALK_FPS = 10;
// O servidor manda posição 20x por segundo e a tela desenha 60x: entre um pacote e outro a posição não muda.
// "Andando" = mudou de posição nos últimos WALK_LINGER_MS; sem isso, a animação piscaria entre andar e parar.
const WALK_LINGER_MS = 150;
// Direção de cada oitavo de volta, a partir do leste, no sentido horário (y cresce para baixo).
const FACINGS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

function facingFor(dx: number, dy: number): string {
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return FACINGS[(octant + 8) % 8] ?? "south";
}

function mobKey(kind: string, facing: string): string {
  return `mobs/${kind}/${facing}`;
}

function characterKey(classId: string | undefined, facing: string, walking = false): string {
  const known = CLASS_IDS.find((id) => id === classId) ?? CLASS_IDS[0];
  return `characters/${known}/${walking ? "walk-" : ""}${facing}`;
}

// Personagem de um jogador: sprite da classe, virado para onde andou, parado ou andando, com o nome em cima.
interface Avatar {
  body: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  facing: string;
  lastX: number;
  lastY: number;
  lastMoveAt: number;
}

// Inimigo: sprite do tipo, virado para onde andou (ou, preparando o golpe, para onde vai bater).
interface MobSprite {
  body: Phaser.GameObjects.Image;
  facing: string;
  lastX: number;
  lastY: number;
}

// "../../assets/tilesets/city/props/poste.png" ou "../tilesets/city/props/poste.png" -> "city/props/poste".
function imageKey(path: string): string {
  return path.slice(path.lastIndexOf("tilesets/") + "tilesets/".length, -".png".length);
}
// Camadas de tiles cujo nome começa com isto são desenhadas por cima do jogador (copas, lanternas, toldos).
const ABOVE_LAYER = "above";

interface SceneData {
  place: Place;
  room: Room<unknown, ServerState>;
}

// VITE_SERVER_PORT permite apontar para um servidor de teste (ex.: 2568) sem mexer no do dono do projeto.
const SERVER_URL = `ws://${window.location.hostname}:${import.meta.env.VITE_SERVER_PORT ?? 2567}`;

// Por aba (sessionStorage): sobrevive a recarregar a página, não a fechar a aba. Duas abas = dois jogadores.
const RECONNECTION_TOKEN_KEY = "rpg-extracao:reconnectionToken";
// Nome com que esta aba entrou. As viagens (cidade ↔ labirinto) entram de novo com ele, sem perguntar.
const NAME_KEY = "rpg-extracao:name";
// Último nome usado, só para vir preenchido (localStorage: conveniência, não identidade).
const LAST_NAME_KEY = "rpg-extracao:lastName";
const MOB_NAMES: Record<MobKind, string> = { lobo: "um lobo", gnomo: "um gnomo", slime: "um slime", goblin: "um goblin" };

// Luz no chão em volta do que brilha (cristais, tochas, minério, cogumelos, portais). Só desenho: clareia o chão,
// não esconde nem revela nada do que o servidor manda. Chave = nome da imagem do objeto no mapa.
const GLOWS: Record<string, { color: number; radius: number; alpha: number }> = {
  "cristal-grande": { color: 0x4fc3f7, radius: 120, alpha: 0.45 },
  "cristal-medio": { color: 0x4fc3f7, radius: 85, alpha: 0.4 },
  "cristal-pequeno": { color: 0x4fc3f7, radius: 55, alpha: 0.35 },
  "rocha-minerio": { color: 0x4fc3f7, radius: 75, alpha: 0.35 },
  tocha: { color: 0x80d8ff, radius: 100, alpha: 0.5 },
  "cogumelos-a": { color: 0x26c6da, radius: 65, alpha: 0.35 },
  "cogumelos-b": { color: 0x26c6da, radius: 65, alpha: 0.35 },
  portal: { color: 0xb388ff, radius: 130, alpha: 0.5 },
};
const GLOW_KEY = "glow";
const GLOW_TEXTURE = 128;
// Portal de saída ativo: a mesma arte do portal da cidade, puxada para o azul da extração.
const EXIT_PORTAL_KEY = "city/portal";
const EXIT_PORTAL_TINT = 0x80d8ff;
const EXIT_GLOW = { color: 0x40c4ff, radius: 110, alpha: 0.5 };

// Ordem de desenho: aviso de golpe no chão, mobs por baixo dos jogadores, barras e golpes por cima de tudo.
const GLOW_DEPTH = 0.3;
const EXIT_DEPTH = 0.4;
const TELEGRAPH_DEPTH = 0.5;
const LOOT_DEPTH = 0.8;
// Y-sorting: jogadores, mobs, casas e enfeites ficam em SORT_DEPTH + y da base (em pixels). Quem está mais
// embaixo na tela é desenhado na frente: dá para passar atrás do telhado e na frente da porta.
const SORT_DEPTH = 10;
const ABOVE_DEPTH = 100_000;
const OVERLAY_DEPTH = 100_001;
const HUD_DEPTH = 200_000;

function sortDepth(baseY: number): number {
  return SORT_DEPTH + baseY;
}

// Barra de fome fixa no canto superior esquerdo (não acompanha a câmera).
const HUD_MARGIN = 16;
const HUNGER_BAR = { width: 160, height: 10 };
// Fundo escuro atrás dos textos do canto: sem ele, o texto branco some sobre fachadas claras.
const HUD_PANEL = { width: 230, height: 84, alpha: 0.45 };
const HUNGER_COLOR = 0xffb300;
const XP_COLOR = 0x7e57c2;
const TOAST_MS = 2500;
const LOOT_SIZE = 12;
const LOOT_COLOR = 0x8d6e63;
const EXIT_COLOR = 0x40c4ff;
const PORTAL_COLOR = 0xb388ff;

// Barra de inventário fixa, embaixo e no centro.
const SLOT_SIZE = 36;
const SLOT_GAP = 4;
const ITEM_COLORS: Record<ItemId, number> = {
  racao: 0xc8a165,
  pele_de_rato: 0x8d8d8d,
  dente_de_goblin: 0xf5f5dc,
  pele_de_lobo: 0x78909c,
  fragmento_de_cristal: 0x4fc3f7,
  gosma_de_slime: 0x81c784,
  essencia_rato: 0xb39ddb,
  essencia_lobo: 0x90caf9,
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

// Uma cena por visita a um lugar (ver `show`): ao trocar de sala, a cena anterior é jogada fora inteira.
class WorldScene extends Phaser.Scene {
  private place: Place = "city";
  private room?: Room<unknown, ServerState>;
  private keys?: MoveKeys;
  // Só na cidade: portais (lidos do mapa, como as paredes) e a tecla E.
  private portals: Vec2[] = [];
  private portalKey?: Phaser.Input.Keyboard.Key;
  private portalHint?: Phaser.GameObjects.Text;
  private avatars = new Map<string, Avatar>();
  private mobSprites = new Map<string, MobSprite>();
  private lootSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private pickupKey?: Phaser.Input.Keyboard.Key;
  private lastSentInput = "";
  private overlay?: Phaser.GameObjects.Graphics;
  private telegraphs?: Phaser.GameObjects.Graphics;
  private hud?: Phaser.GameObjects.Graphics;
  private exitsLayer?: Phaser.GameObjects.Graphics;
  // Portal e luz de cada saída ativa que este jogador vê.
  private exitSprites = new Map<string, Phaser.GameObjects.Image[]>();
  private extractLabel?: Phaser.GameObjects.Text;
  private levelLabel?: Phaser.GameObjects.Text;
  private essenceLabel?: Phaser.GameObjects.Text;
  private toast?: Phaser.GameObjects.Text;
  private toastUntil = 0;
  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  private slotLabels: Phaser.GameObjects.Text[] = [];
  private slotKeyLabels: Phaser.GameObjects.Text[] = [];
  // Quando este cliente viu cada mob começar a preparar: base para o aviso encher no ritmo certo.
  private windupStartedAt = new Map<string, number>();
  private lastAttackSeq = new Map<string, number>();
  private swings: Swing[] = [];

  init(data: SceneData) {
    this.place = data.place;
    this.room = data.room;
  }

  // Mapas e folhas de tiles ficam no cache do jogo: só a primeira visita baixa os arquivos.
  preload() {
    if (!this.cache.tilemap.exists(this.place)) this.load.tilemapTiledJSON(this.place, MAP_URLS[this.place]);
    for (const { key, url } of [...TILESET_URLS, ...IDLE_URLS, ...MOB_URLS]) if (!this.textures.exists(key)) this.load.image(key, url);
    for (const { key, url } of WALK_URLS) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, url, { frameWidth: WALK_FRAME, frameHeight: WALK_FRAME });
    }
  }

  create() {
    this.createWalkAnimations();
    const map = this.createMap();
    this.hud = this.add.graphics().setDepth(HUD_DEPTH).setScrollFactor(0);
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
    this.keys = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as MoveKeys;
    // Inventário nos dois lugares: o personagem leva o que extraiu para a cidade.
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const { x, y } = slotPosition(this.scale.width, this.scale.height, i);
      const key = SLOT_KEYS[i];
      if (key) {
        const phaserKey = this.input.keyboard?.addKey(key.code);
        if (phaserKey) this.slotKeys[i] = phaserKey;
        const keyLabel = this.add.text(x + SLOT_SIZE - 9, y + 2, key.label, { fontSize: "9px", color: "#9e9e9e" });
        this.slotKeyLabels[i] = keyLabel.setScrollFactor(0).setDepth(HUD_DEPTH + 1);
      }
      const label = this.add.text(x + 2, y + 2, "", { fontSize: "10px", color: "#ffffff" });
      this.slotLabels.push(label.setScrollFactor(0).setDepth(HUD_DEPTH + 1));
    }
    // A janela mudou de formato: o tamanho do jogo muda junto (ver viewportSize) e o HUD se reposiciona.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    const stopListening = () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopListening);
    this.events.once(Phaser.Scenes.Events.DESTROY, stopListening);
    const room = this.room;
    if (!room) return;
    room.onMessage("notice", (notice: { text: string }) => this.showToast(notice.text));
    if (this.place === "city") this.createCity(room, map);
    else this.createLabyrinth(room);
    this.layoutHud();
  }

  private onResize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.layoutHud();
  }

  // Posições do HUD que dependem do tamanho da tela. Roda ao criar a cena e quando a janela muda de formato.
  private layoutHud() {
    const { width, height } = this.scale;
    this.toast?.setPosition(width / 2, height / 3);
    this.portalHint?.setPosition(width / 2, HUD_MARGIN);
    this.extractLabel?.setPosition(width / 2, HUD_MARGIN);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const { x, y } = slotPosition(width, height, i);
      this.slotLabels[i]?.setPosition(x + 2, y + 2);
      this.slotKeyLabels[i]?.setPosition(x + SLOT_SIZE - 9, y + 2);
    }
  }

  // Portais desenhados a partir do mapa (são fixos, como as paredes). Quem decide se entrou é o servidor.
  private createCity(room: Room<unknown, ServerState>, map: Phaser.Tilemaps.Tilemap) {
    this.portals = (map.getObjectLayer(PORTAL_LAYER)?.objects ?? []).map((o) => ({ x: o.x ?? 0, y: o.y ?? 0 }));
    const g = this.add.graphics().setDepth(EXIT_DEPTH);
    for (const portal of this.portals) {
      g.fillStyle(PORTAL_COLOR, 0.2);
      g.fillCircle(portal.x, portal.y, CITY_PORTAL_RADIUS);
      g.lineStyle(2, PORTAL_COLOR, 0.9);
      g.strokeCircle(portal.x, portal.y, CITY_PORTAL_RADIUS);
    }
    this.portalHint = this.add
      .text(this.scale.width / 2, HUD_MARGIN, "", { fontSize: "16px", color: "#b388ff" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.portalKey = this.input.keyboard?.addKey("E");
    room.onMessage("toLabyrinth", () => {
      this.room = undefined;
      void goToLabyrinth();
    });
  }

  private createLabyrinth(room: Room<unknown, ServerState>) {
    this.overlay = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.telegraphs = this.add.graphics().setDepth(TELEGRAPH_DEPTH);
    this.exitsLayer = this.add.graphics().setDepth(EXIT_DEPTH);
    this.extractLabel = this.add
      .text(this.scale.width / 2, HUD_MARGIN, "", { fontSize: "16px", color: "#40c4ff" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.add.text(HUD_MARGIN, HUD_MARGIN, "Fome", { fontSize: "12px", color: "#ffffff" }).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.pickupKey = this.input.keyboard?.addKey("F");
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.sendAttack(pointer));
    room.onMessage("extracted", (result: ExtractionResult) => {
      this.room = undefined;
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
      showEndScreen("Você extraiu", describeLoot(result), "Voltar à cidade");
    });
    room.onMessage("firstKill", (info: FirstKillMessage) => {
      const levelUp = info.leveledUp ? `
Subiu para o nível ${info.level}!` : "";
      this.showToast(`Primeira morte: ${MOB_NAMES[info.mob]} (+XP)${levelUp}`);
    });
    room.onMessage("death", (cause: DeathCause) => {
      this.room = undefined;
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
      showEndScreen("Você morreu", describeDeath(cause), "Novo personagem");
    });
  }

  // Aviso curto no centro da tela.
  private showToast(text: string) {
    this.lastToastText = text;
    this.toastUntil = this.time.now + TOAST_MS;
  }

  private lastToastText = "";

  update(time: number) {
    const room = this.room;
    if (!room || !this.keys || !this.hud) return;
    this.sendInputIfChanged(room, this.keys);
    this.slotKeys.forEach((key, slot) => {
      if (Phaser.Input.Keyboard.JustDown(key)) room.send("use", { slot });
    });
    this.syncAvatars(room, time);
    this.drawHud(room, this.hud);
    if (this.place === "city") this.updateCity(room);
    else this.updateLabyrinth(room, time);
  }

  // E dentro do portal pede para entrar no labirinto. A dica é só visual; o servidor confere de novo.
  private updateCity(room: Room<unknown, ServerState>) {
    let atPortal = false;
    room.state.players.forEach((player, sessionId) => {
      if (sessionId === room.sessionId) atPortal = isAtPortal(player, this.portals);
    });
    const hint = atPortal ? "E: entrar no labirinto" : "";
    if (this.portalHint && this.portalHint.text !== hint) this.portalHint.setText(hint);
    if (this.portalKey && Phaser.Input.Keyboard.JustDown(this.portalKey)) room.send("enterPortal");
  }

  private updateLabyrinth(room: Room<unknown, ServerState>, time: number) {
    if (!this.overlay || !this.telegraphs) return;
    if (this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) room.send("pickup");
    if (room.state.mobs) this.syncMobs(room.state.mobs);
    if (room.state.loot) syncSprites(room.state.loot, this.lootSprites, () => this.createLootSprite());
    this.collectSwings(room, time);
    this.drawOverlay(room, this.overlay, time);
    this.drawTelegraphs(room, this.telegraphs, time);
    if (this.exitsLayer) this.drawExits(room, this.exitsLayer);
  }

  // Portal ativo: anel no chão do tamanho exato da área em que a extração conta, e o portal em pé com a base no
  // meio do anel (quem está dentro do anel fica na frente dele).
  private drawExits(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    g.clear();
    const seen = new Set<string>();
    room.state.exits?.forEach((exit, id) => {
      g.fillStyle(EXIT_COLOR, 0.15);
      g.fillCircle(exit.x, exit.y, EXIT_RADIUS);
      g.lineStyle(2, EXIT_COLOR, 0.9);
      g.strokeCircle(exit.x, exit.y, EXIT_RADIUS);
      seen.add(id);
      if (this.exitSprites.has(id)) return;
      const portal = this.add.image(exit.x, exit.y, EXIT_PORTAL_KEY).setOrigin(0.5, 1).setTint(EXIT_PORTAL_TINT);
      this.exitSprites.set(id, [portal.setDepth(sortDepth(exit.y)), this.addGlow(exit.x, exit.y, EXIT_GLOW)]);
    });
    for (const [id, images] of this.exitSprites) {
      if (seen.has(id)) continue;
      for (const image of images) image.destroy();
      this.exitSprites.delete(id);
    }
  }

  private drawHud(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics) {
    g.clear();
    g.fillStyle(0x000000, HUD_PANEL.alpha);
    g.fillRect(HUD_MARGIN / 2, HUD_MARGIN / 2, HUD_PANEL.width, HUD_PANEL.height);
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
    this.drawInventory(room, g);
    // Fome só existe no labirinto.
    if (hunger === undefined) return;
    const top = HUD_MARGIN + 16;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width, HUNGER_BAR.height);
    g.fillStyle(HUNGER_COLOR, 1);
    g.fillRect(HUD_MARGIN, top, HUNGER_BAR.width * (hunger / HUNGER_MAX), HUNGER_BAR.height);
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
    room.state.mobs?.forEach((mob, id) => {
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
    let self: Vec2 | undefined;
    this.room?.state.players.forEach((player, sessionId) => {
      if (sessionId === this.room?.sessionId) self = { x: player.x, y: player.y };
    });
    if (!this.room || !self || !pointer.leftButtonDown()) return;
    const target = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.room.send("attack", { angle: Math.atan2(target.y - self.y, target.x - self.x) });
  }

  // Golpe novo = attackSeq mudou desde o último frame. Vale para o próprio jogador e para os outros.
  private collectSwings(room: Room<unknown, ServerState>, time: number) {
    room.state.players.forEach((player, sessionId) => {
      const seq = player.attackSeq ?? 0;
      const previous = this.lastAttackSeq.get(sessionId);
      this.lastAttackSeq.set(sessionId, seq);
      if (previous === undefined || seq === previous) return;
      this.swings.push({ x: player.x, y: player.y, angle: player.attackAngle ?? 0, untilMs: time + SWING_VISIBLE_MS });
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
    // Barra de vida do jogador acima da cabeça do sprite.
    room.state.players.forEach((player) => {
      const top = player.y + PLAYER_SIZE / 2 - AVATAR_HEIGHT - HP_BAR_GAP - HP_BAR_HEIGHT;
      drawHpBar(g, player.x, top, PLAYER_SIZE, (player.hp ?? 0) / (player.maxHp || PLAYER_MAX_HP));
    });
    room.state.mobs?.forEach((mob) => {
      const kind = mob.kind as MobKind;
      const stats = MOB_KINDS[kind];
      const top = mob.y + stats.size / 2 - MOB_ART[kind].height - HP_BAR_GAP - HP_BAR_HEIGHT;
      drawHpBar(g, mob.x, top, PLAYER_SIZE, mob.hp / stats.maxHp);
    });
  }

  // Só desenho: quem decide o que é parede é o servidor.
  private createMap(): Phaser.Tilemaps.Tilemap {
    const map = this.make.tilemap({ key: this.place });
    // Só os tilesets de uma imagem (folha de tiles). As coleções de imagens (casas, enfeites) o Phaser também lista
    // em map.tilesets, uma entrada por imagem; elas viram objetos em createMapObjects.
    const data = (this.cache.tilemap.get(this.place) as { data?: TiledMap } | undefined)?.data;
    const sheets = new Set(data?.tilesets.filter((t) => t.image !== undefined).map((t) => t.name));
    const tilesets = map.tilesets.filter((tileset) => sheets.has(tileset.name)).map((tileset) => {
      const tiles = map.addTilesetImage(tileset.name, tileset.name);
      if (!tiles) throw new Error(`Não consegui carregar o tileset "${tileset.name}" (falta assets/tilesets/${tileset.name}.png?).`);
      return tiles;
    });
    for (const layer of map.layers) {
      const created = map.createLayer(layer.name, tilesets);
      if (layer.name.startsWith(ABOVE_LAYER)) created?.setDepth(ABOVE_DEPTH);
    }
    this.createMapObjects();
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    return map;
  }

  // Casas, enfeites e portal: objetos do mapa com imagem própria (coleção de imagens no Tiled).
  // No Tiled, x,y é o canto de baixo-esquerdo da imagem; a profundidade segue a base, como a dos jogadores.
  private createMapObjects() {
    const data = (this.cache.tilemap.get(this.place) as { data?: TiledMap } | undefined)?.data;
    if (!data) return;
    const keys = new Map<number, string>();
    for (const tileset of data.tilesets) {
      for (const tile of tileset.tiles ?? []) if (tile.image) keys.set(tileset.firstgid + tile.id, imageKey(tile.image));
    }
    for (const layer of data.layers) {
      for (const object of layer.objects ?? []) {
        const key = object.gid === undefined ? undefined : keys.get(object.gid & GID_MASK);
        if (!key) continue;
        const image = this.add.image(object.x, object.y, key).setOrigin(0, 1).setDepth(sortDepth(object.y));
        if (object.width && object.height) image.setDisplaySize(object.width, object.height);
        const glow = GLOWS[key.slice(key.lastIndexOf("/") + 1)];
        if (glow) this.addGlow(object.x + image.displayWidth / 2, object.y - Math.min(image.displayHeight * 0.3, 24), glow);
      }
    }
  }

  // Mancha de luz no chão: um degradê radial branco (gerado uma vez), tingido e somado à cor do chão.
  private addGlow(x: number, y: number, glow: { color: number; radius: number; alpha: number }) {
    const texture = this.textures.exists(GLOW_KEY) ? undefined : this.textures.createCanvas(GLOW_KEY, GLOW_TEXTURE, GLOW_TEXTURE);
    const ctx = texture?.getContext();
    if (texture && ctx) {
      const half = GLOW_TEXTURE / 2;
      const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.4, "rgba(255,255,255,0.45)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GLOW_TEXTURE, GLOW_TEXTURE);
      texture.refresh();
    }
    return this.add
      .image(x, y, GLOW_KEY)
      .setScale((glow.radius * 2) / GLOW_TEXTURE)
      .setTint(glow.color)
      .setAlpha(glow.alpha)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(GLOW_DEPTH);
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

  // Uma animação por fita de caminhada, com a mesma chave da textura. As animações são do jogo todo: cria uma vez.
  private createWalkAnimations() {
    for (const { key } of WALK_URLS) {
      if (this.anims.exists(key)) continue;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, {}), frameRate: WALK_FPS, repeat: -1 });
    }
  }

  // Cria, move e tira os personagens conforme o estado. Direção e andar/parar são só visuais: saem de quanto
  // e para onde o jogador andou desde o último quadro.
  private syncAvatars(room: Room<unknown, ServerState>, time: number) {
    const seen = new Set<string>();
    room.state.players.forEach((player, sessionId) => {
      seen.add(sessionId);
      let avatar = this.avatars.get(sessionId);
      if (!avatar) {
        avatar = this.createAvatar(player, sessionId === room.sessionId);
        this.avatars.set(sessionId, avatar);
      }
      const dx = player.x - avatar.lastX;
      const dy = player.y - avatar.lastY;
      if (Math.hypot(dx, dy) > 0.5) {
        avatar.facing = facingFor(dx, dy);
        avatar.lastMoveAt = time;
      }
      avatar.lastX = player.x;
      avatar.lastY = player.y;
      const feet = player.y + PLAYER_SIZE / 2;
      this.animateAvatar(avatar, player.classId, time - avatar.lastMoveAt < WALK_LINGER_MS);
      avatar.body.setPosition(player.x, feet).setDepth(sortDepth(feet));
      avatar.label.setPosition(player.x, feet - AVATAR_HEIGHT - HP_BAR_GAP - HP_BAR_HEIGHT - 2);
    });
    for (const [sessionId, avatar] of this.avatars) {
      if (seen.has(sessionId)) continue;
      avatar.body.destroy();
      avatar.label.destroy();
      this.avatars.delete(sessionId);
    }
  }

  // Andando: toca a caminhada da direção (trocar de direção no meio do passo continua do mesmo quadro).
  // Parado: sprite parado da última direção.
  private animateAvatar(avatar: Avatar, classId: string | undefined, walking: boolean) {
    const body = avatar.body;
    if (walking) {
      const key = characterKey(classId, avatar.facing, true);
      if (body.anims.currentAnim?.key === key && body.anims.isPlaying) return;
      const frame = body.anims.isPlaying ? (body.anims.currentFrame?.index ?? 1) - 1 : 0;
      body.setOrigin(0.5, WALK_FEET).play({ key, startFrame: frame });
      return;
    }
    if (body.anims.isPlaying) body.stop();
    const idle = characterKey(classId, avatar.facing);
    if (body.texture.key !== idle) body.setTexture(idle).setOrigin(0.5, AVATAR_FEET);
  }

  private createAvatar(player: PlayerView, isSelf: boolean): Avatar {
    const feet = player.y + PLAYER_SIZE / 2;
    const body = this.add.sprite(player.x, feet, characterKey(player.classId, "south")).setOrigin(0.5, AVATAR_FEET);
    const label = this.add
      .text(player.x, feet - AVATAR_HEIGHT, player.name ?? "", {
        fontFamily: "Palatino Linotype, Georgia, serif",
        fontSize: "12px",
        color: isSelf ? "#f0d48a" : "#f2e6cf",
        stroke: "#140d08",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(OVERLAY_DEPTH);
    if (isSelf) this.cameras.main.startFollow(body, true);
    return { body, label, facing: "south", lastX: player.x, lastY: player.y, lastMoveAt: -Infinity };
  }

  // Como syncAvatars, para os inimigos. A direção é só visual: preparando o golpe, olha para onde vai bater
  // (attackAngle, o mesmo do aviso no chão); senão, para onde andou desde o último quadro.
  private syncMobs(mobs: { forEach(callback: (mob: MobView, id: string) => void): void }) {
    const seen = new Set<string>();
    mobs.forEach((mob, id) => {
      seen.add(id);
      const kind = mob.kind as MobKind;
      let sprite = this.mobSprites.get(id);
      if (!sprite) {
        const body = this.add.image(mob.x, mob.y, mobKey(kind, "south")).setOrigin(0.5, MOB_ART[kind].feet / MOB_FRAME);
        sprite = { body, facing: "south", lastX: mob.x, lastY: mob.y };
        this.mobSprites.set(id, sprite);
      }
      const dx = mob.x - sprite.lastX;
      const dy = mob.y - sprite.lastY;
      if (mob.windup) sprite.facing = facingFor(Math.cos(mob.attackAngle), Math.sin(mob.attackAngle));
      else if (Math.hypot(dx, dy) > 0.5) sprite.facing = facingFor(dx, dy);
      sprite.lastX = mob.x;
      sprite.lastY = mob.y;
      const feet = mob.y + MOB_KINDS[kind].size / 2;
      const key = mobKey(kind, sprite.facing);
      if (sprite.body.texture.key !== key) sprite.body.setTexture(key);
      sprite.body.setPosition(mob.x, feet).setDepth(sortDepth(feet));
    });
    for (const [id, sprite] of this.mobSprites) {
      if (seen.has(id)) continue;
      sprite.body.destroy();
      this.mobSprites.delete(id);
    }
  }

  private createLootSprite() {
    return this.add.rectangle(0, 0, LOOT_SIZE, LOOT_SIZE, LOOT_COLOR).setStrokeStyle(1, 0x000000).setDepth(LOOT_DEPTH);
  }
}

// Deixa os desenhos iguais à coleção que o servidor mandou: cria o que chegou, move o que já existe
// e destrói o que saiu (foi pego ou saiu do raio de visão).
// halfHeight: com ele, a profundidade segue a base da entidade (Y-sorting); sem ele, fica a de criação.
function syncSprites<T extends Vec2>(
  collection: { forEach(callback: (entity: T, id: string) => void): void },
  sprites: Map<string, Phaser.GameObjects.Rectangle>,
  create: (entity: T, id: string) => Phaser.GameObjects.Rectangle,
  halfHeight?: (entity: T) => number,
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
    if (halfHeight) sprite.setDepth(sortDepth(entity.y + halfHeight(entity)));
  });
  for (const [id, sprite] of sprites) {
    if (seen.has(id)) continue;
    sprite.destroy();
    sprites.delete(id);
  }
}

function slotPosition(screenWidth: number, screenHeight: number, index: number): Vec2 {
  const total = INVENTORY_SLOTS * SLOT_SIZE + (INVENTORY_SLOTS - 1) * SLOT_GAP;
  return {
    x: (screenWidth - total) / 2 + index * (SLOT_SIZE + SLOT_GAP),
    y: screenHeight - HUD_MARGIN - SLOT_SIZE,
  };
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

// Fim da run (morte, extração ou personagem perdido). O botão leva à cidade com o mesmo nome:
// se o personagem ainda vive (extraiu), volta a ele; se morreu, entra um herdeiro da mesma linhagem.
function showEndScreen(heading: string, detail: string, button: string) {
  const screen = overlayScreen();
  const title = document.createElement("h1");
  title.textContent = heading;
  title.style.margin = "0";
  const reason = document.createElement("p");
  reason.textContent = detail;
  reason.style.margin = "0";
  const again = document.createElement("button");
  again.textContent = button;
  again.style.cssText = "padding:8px 16px;font-size:16px;cursor:pointer;";
  again.addEventListener("click", () => {
    screen.remove();
    void goToCity();
  });
  screen.append(title, reason, again);
  document.body.append(screen);
}

function drawHpBar(g: Phaser.GameObjects.Graphics, centerX: number, top: number, width: number, fraction: number) {
  const left = centerX - width / 2;
  g.fillStyle(0x000000, 0.6);
  g.fillRect(left, top, width, HP_BAR_HEIGHT);
  g.fillStyle(fraction > 0.3 ? 0x66bb6a : 0xef5350, 1);
  g.fillRect(left, top, width * fraction, HP_BAR_HEIGHT);
}

const client = new Client(SERVER_URL);
// O jogo ocupa a janela inteira. O tamanho em pixels do mundo segue o formato da janela com a mesma meia-diagonal
// (SCREEN_HALF_DIAGONAL), e o Phaser amplia a imagem para preencher: monitor maior não vê mais longe.
const initialSize = viewportSize(window.innerWidth, window.innerHeight);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: initialSize.width, height: initialSize.height },
});
window.addEventListener("resize", () => {
  // Espera um quadro: no próprio evento o layout novo da página ainda não terminou, e o Phaser mediria o
  // tamanho antigo do #app (o jogo ficava com tarja preta). getParentBounds força a medida nova.
  requestAnimationFrame(() => {
    const size = viewportSize(window.innerWidth, window.innerHeight);
    game.scale.getParentBounds();
    game.scale.setGameSize(size.width, size.height);
  });
});
let currentScene: string | undefined;
let sceneCount = 0;

// Troca de lugar: uma cena nova para cada sala, e a anterior sai inteira (desenhos, teclas, estado).
function show(data: SceneData) {
  if (currentScene) game.scene.remove(currentScene);
  currentScene = `world-${++sceneCount}`;
  game.scene.add(currentScene, WorldScene, true, data);
}

// O join resolve antes do primeiro estado chegar; até lá, `players` não existe.
function firstState(room: Room<unknown, ServerState>): Promise<void> {
  return new Promise((resolve) => room.onStateChange.once(() => resolve()));
}

// Entra na cidade com o nome desta aba. Sem nome, ou se o servidor recusar, pergunta até ele aceitar.
// O nome identifica a linhagem; o servidor valida e pode recusar.
// Entra na cidade com o nome desta aba. Sem nome (ou recusado), a ficha de registro pede o nome.
// Personagem novo (sem classe) é recusado com CLASS_REQUIRED_CODE: a ficha pede a classe e entra de novo com ela.
// O nome identifica a linhagem; nome e classe são validados e gravados pelo servidor.
async function goToCity() {
  let name = sessionStorage.getItem(NAME_KEY) ?? undefined;
  let error = "";
  let registration: Registration | undefined;
  const openForm = () => {
    // As teclas do jogo ficam capturadas pelo Phaser mesmo depois que a cena sai; sem isso, W/A/S/D não chegariam ao campo.
    game.input.keyboard?.clearCaptures();
    return (registration ??= openRegistration());
  };
  for (;;) {
    name ??= await openForm().askName(error, localStorage.getItem(LAST_NAME_KEY) ?? "");
    try {
      await enterCity(name);
      await registration?.close();
      return;
    } catch (e) {
      if (!isClassRequired(e)) {
        error = errorMessage(e);
        name = undefined;
        sessionStorage.removeItem(NAME_KEY);
        continue;
      }
    }
    const classId = await openForm().askClass(name);
    try {
      await enterCity(name, classId);
      await registration?.close();
      return;
    } catch (e) {
      error = errorMessage(e);
      name = undefined;
      sessionStorage.removeItem(NAME_KEY);
    }
  }
}

async function enterCity(name: string, classId?: ClassId) {
  const room = await client.joinOrCreate<ServerState>("city", classId ? { name, classId } : { name });
  sessionStorage.setItem(NAME_KEY, name);
  localStorage.setItem(LAST_NAME_KEY, name);
  await firstState(room);
  show({ place: "city", room });
}

function isClassRequired(e: unknown): boolean {
  return (e as { code?: unknown } | undefined)?.code === CLASS_REQUIRED_CODE;
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Não foi possível entrar.";
}

// Saiu pelo portal da cidade: entra numa run aberta com vaga (ou numa nova), com o mesmo nome.
async function goToLabyrinth() {
  try {
    const room = await client.joinOrCreate<ServerState>("game", { name: sessionStorage.getItem(NAME_KEY) });
    await enterLabyrinth(room);
  } catch (e) {
    showEndScreen("Não deu para entrar no labirinto", e instanceof Error ? e.message : "", "Voltar à cidade");
  }
}

async function enterLabyrinth(room: Room<unknown, ServerState>) {
  sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken);
  // O Colyseus troca o token a cada reconexão; o guardado precisa acompanhar.
  room.onReconnect(() => sessionStorage.setItem(RECONNECTION_TOKEN_KEY, room.reconnectionToken));
  await firstState(room);
  show({ place: "labyrinth", room });
}

// Ao abrir: se esta aba tem um personagem no labirinto (recarregou ou caiu), volta a ele; senão, cidade.
// Se a volta falhar (morreu enquanto estava fora, ou a run acabou), avisa em vez de seguir calado.
async function start() {
  const token = sessionStorage.getItem(RECONNECTION_TOKEN_KEY);
  if (!token) return goToCity();
  try {
    await enterLabyrinth(await client.reconnect<ServerState>(token));
  } catch {
    sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
    showEndScreen("Seu personagem se foi", "Ele morreu ou a partida acabou enquanto você estava fora.", "Ir para a cidade");
  }
}

void start();
