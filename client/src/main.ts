import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import {
  CITY_PORTAL_RADIUS,
  CLASS_IDS,
  CLASS_REQUIRED_CODE,
  GID_MASK,
  EXIT_RADIUS,
  EXTRACT_MS,
  ITEMS,
  MOB_KINDS,
  EXIT_LIGHT_RADIUS,
  FIRST_KILL_XP,
  INTERACTION_LAYER,
  REGION_LAYER,
  LIGHT_LAYER,
  PLAYER_ATTACK,
  PLAYER_LIGHT_RADIUS,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  PORTAL_LAYER,
  interactionAt,
  isAtPortal,
  isInteractionId,
  isStationId,
  lightRadius,
  mobStrikeArc,
  playerStats,
  viewportSize,
  xpForNextLevel,
  type InteractionId,
  type InteractionPoint,
  type ClassId,
  type DeathCause,
  type ExtractionResult,
  type FirstKillMessage,
  type ItemId,
  type LightKind,
  type MobKind,
  type MoveInput,
  type TiledMap,
  type Vec2,
} from "shared";
import {
  FloatingNumbers,
  ScreenShake,
  applyFlash,
  drawSwing,
  newReaction,
  recoilOffset,
  startReaction,
  swingDuration,
  type HitReaction,
  type NumberKind,
  type Swing,
} from "./juice";
import { LightIndex, StaticCuller } from "./culling";
import { Hud } from "./hud";
import { Lighting, mergeNearby, phaseAt, type Light, type LightLook } from "./lighting";
import { Particles } from "./particles";
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
  // Moedas da linhagem; o baú, só na cidade.
  coins?: number;
  stash?: { forEach(callback: (slot: { item: string; count: number }, index: number) => void): void };
  // Só na cidade, para o Bestiário: tipos mortos pela linhagem e por este personagem.
  bestiary?: { forEach(callback: (kind: string) => void): void };
  kills?: { forEach(callback: (kind: string) => void): void };
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
  players: {
    forEach(callback: (player: PlayerView, sessionId: string) => void): void;
    get(sessionId: string): PlayerView | undefined;
  };
  mobs?: { forEach(callback: (mob: MobView, id: string) => void): void };
  loot?: { forEach(callback: (pile: Vec2, id: string) => void): void };
  exits?: { forEach(callback: (exit: Vec2, id: string) => void): void };
}

// Cada lugar é uma sala do servidor com o seu mapa.
type Place = "city" | "labyrinth";
const MAP_URLS: Record<Place, string> = { city: cityMapUrl, labyrinth: labyrinthMapUrl };
// Todas as folhas de tiles do projeto. No Tiled, o nome de cada tileset é o nome do arquivo sem ".png":
// é por esse nome que o mapa encontra a imagem, qualquer que seja o lugar.
// A chave de cada imagem é o caminho dentro de assets/tilesets, sem ".png" (ex.: "city/houses/house_01").
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
// Sprites dos inimigos (tools/assets/process_mobs.py): parado "mobs/<tipo>/<direção>" (64x64, 8 direções) e
// caminhada "mobs/<tipo>/walk-<direção>" (fita de quadros 96x96), só nas direções que têm arte: o lobo e o goblin
// andam nas 8, o gnomo só nas 4 cardeais, o slime não tem caminhada. Só se carrega o que existe (nada de 404).
const MOB_URLS = Object.entries(
  import.meta.glob<string>("../../assets/mobs/*/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ key: path.slice(path.indexOf("mobs/"), -".png".length), url }));
const MOB_IDLE_URLS = MOB_URLS.filter(({ key }) => !key.includes("/walk-"));
const MOB_WALK_URLS = MOB_URLS.filter(({ key }) => key.includes("/walk-"));
const MOB_FRAME = 64;
// Linha dos pés parado (de 64) e andando (de 96, mediana dos quadros), altura do bicho e largura da sombra, medidas
// nas imagens. O pivô fica nos pés nas duas folhas (como nas classes): trocar de parado para andando não pula.
// A altura põe a barra de vida acima da cabeça. Desenhados em 1:1. Slime não anda: sem walkFeet.
const MOB_ART: Record<MobKind, { feet: number; walkFeet?: number; height: number; shadow: number }> = {
  goblin: { feet: 61, walkFeet: 77, height: 59, shadow: 28 },
  lobo: { feet: 62, walkFeet: 78, height: 60, shadow: 36 },
  gnomo: { feet: 61, walkFeet: 78, height: 60, shadow: 24 },
  slime: { feet: 58, height: 44, shadow: 40 },
};
// Diagonal sem caminhada (gnomo): anda com a da cardeal do lado para onde vai. Parado ou preparando golpe, o sprite
// parado tem as 8 direções e é ele que aparece.
const WALK_FALLBACK: Record<string, string> = {
  "north-east": "east",
  "south-east": "east",
  "north-west": "west",
  "south-west": "west",
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
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  facing: string;
  lastX: number;
  lastY: number;
  lastMoveAt: number;
  reaction: HitReaction;
  // Última vida vista: a diferença é o dano (ou a cura) que aparece em número. Undefined na cidade.
  lastHp?: number;
}

// Inimigo: sprite do tipo, virado para onde andou (ou, preparando o golpe, para onde vai bater).
interface MobSprite {
  body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  facing: string;
  lastX: number;
  lastY: number;
  lastMoveAt: number;
  reaction: HitReaction;
  lastHp: number;
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

// Luz de cada lugar (só desenho; ver client/src/lighting.ts). Ambiente = a escuridão onde não chega luz.
// Cidade: noite azulada, clara o bastante para ver a cidade. Labirinto: caverna escura; cada jogador carrega luz
// (PLAYER_LIGHT_RADIUS).
const AMBIENT: Record<Place, number> = { city: 0x2d3248, labyrinth: 0x0c101a };
const VIGNETTE_ALPHA: Record<Place, number> = { city: 0.55, labyrinth: 0.7 };
// Cor, força e jeito de cada tipo de luz da camada "luzes". O raio vem de LIGHT_RADIUS (balance.ts): no labirinto é
// ele que decide o que o servidor manda, então o desenho não pode mudar.
const LIGHT_LOOKS: Record<LightKind, LightLook> = {
  "cristal-grande": { color: 0x00e5ff, intensity: 0.85, effect: "steady" },
  "cristal-medio": { color: 0x00e5ff, intensity: 0.75, effect: "steady" },
  "cristal-pequeno": { color: 0x00e5ff, intensity: 0.65, effect: "steady" },
  minerio: { color: 0x00e5ff, intensity: 0.65, effect: "steady" },
  cogumelos: { color: 0x00e5ff, intensity: 0.55, effect: "pulse" },
  tocha: { color: 0x6fa8ff, intensity: 0.9, effect: "flicker" },
  portal: { color: 0xa855f7, intensity: 1, effect: "pulse" },
  poste: { color: 0xff9d42, intensity: 0.85, effect: "flicker" },
  chafariz: { color: 0xff9d42, intensity: 0.5, effect: "flicker" },
  janela: { color: 0xff9d42, intensity: 0.6, effect: "flicker" },
  braseiro: { color: 0xff7a2e, intensity: 0.95, effect: "flicker" },
  forja: { color: 0xff5f1f, intensity: 1, effect: "flicker" },
  vela: { color: 0xffc46b, intensity: 0.55, effect: "flicker" },
  runa: { color: 0x4fe3ff, intensity: 0.75, effect: "pulse" },
  garras: { color: 0xff5a1f, intensity: 0.6, effect: "flicker" },
  acido: { color: 0x6dff4a, intensity: 0.7, effect: "pulse" },
};
const PLAYER_LIGHT: LightLook = { color: 0xfff0dc, intensity: 1, effect: "steady" };
const EXIT_LIGHT: LightLook = { color: 0x40c4ff, intensity: 1, effect: "pulse" };
// Portal de saída ativo: a mesma arte do portal da cidade, puxada para o azul da extração.
const EXIT_PORTAL_KEY = "city/portal";
// Dica de cada ponto de interação da cidade (portas da rua, portas de dentro e móveis).
const INTERACTION_HINTS: Record<InteractionId, string> = {
  guild: "[E] Entrar no Salão da Guilda",
  inn: "[E] Entrar na Estalagem",
  blacksmith: "[E] Entrar na Forja do Ferreiro",
  "guild-exit": "[E] Sair para a Cidade",
  "inn-exit": "[E] Sair para a Cidade",
  "blacksmith-exit": "[E] Sair para a Cidade",
  "guild-counter": "[E] Balcão de Recepção: vender loot",
  "guild-bestiary": "[E] Mesa de Pesquisa: Bestiário e Rank",
  "inn-counter": "[E] Balcão de Comida: suprimentos",
  "inn-chest": "[E] Baú da Linhagem",
  "blacksmith-counter": "[E] Balcão do Ferreiro: equipamentos",
  "blacksmith-anvil": "[E] Forja: receitas",
};
// Troca de lugar pela porta: escurece, o servidor muda o jogador de lugar e clareia. Sem resposta (fora da porta,
// no servidor), clareia depois de DOOR_TIMEOUT_MS.
const DOOR_FADE_MS = 120;
const DOOR_TIMEOUT_MS = 700;
const DOOR_JUMP_PX = 256;
const EXIT_PORTAL_TINT = 0x80d8ff;

// Sombra nos pés: elipse escura no chão, embaixo de jogadores, mobs e enfeites em pé.
const SHADOW_ALPHA = 0.45;
const AVATAR_SHADOW = { width: 26, height: 9 };
// Enfeites deitados no chão ficam sem sombra; prédios também (a base deles já é desenhada na arte).
const FLAT_PROPS = new Set(["esqueleto", "ossada", "cogumelos-a", "cogumelos-b"]);
const BUILDING = /^(house_|landmark_)/;

// Ordem de desenho: sombras e aviso de golpe no chão, mobs por baixo dos jogadores, luz por cima do mundo,
// barras, nomes e golpes por cima da luz, HUD por cima de tudo.
const SHADOW_DEPTH = 0.2;
const EXIT_DEPTH = 0.4;
const TELEGRAPH_DEPTH = 0.5;
const LOOT_DEPTH = 0.8;
// Y-sorting: jogadores, mobs, casas e enfeites ficam em SORT_DEPTH + y da base (em pixels). Quem está mais
// embaixo na tela é desenhado na frente: dá para passar atrás do telhado e na frente da porta.
const SORT_DEPTH = 10;
const ABOVE_DEPTH = 100_000;
const LIGHT_DEPTH = 100_000.5;
const OVERLAY_DEPTH = 100_001;

function sortDepth(baseY: number): number {
  return SORT_DEPTH + baseY;
}

const LOOT_SIZE = 12;
const LOOT_COLOR = 0x8d6e63;
const EXIT_COLOR = 0x40c4ff;
const PORTAL_COLOR = 0xb388ff;

// Tecla de cada slot, na ordem: 1–9, 0, - e = (12 slots, só 10 teclas de número).
const SLOT_KEYS = [
  Phaser.Input.Keyboard.KeyCodes.ONE,
  Phaser.Input.Keyboard.KeyCodes.TWO,
  Phaser.Input.Keyboard.KeyCodes.THREE,
  Phaser.Input.Keyboard.KeyCodes.FOUR,
  Phaser.Input.Keyboard.KeyCodes.FIVE,
  Phaser.Input.Keyboard.KeyCodes.SIX,
  Phaser.Input.Keyboard.KeyCodes.SEVEN,
  Phaser.Input.Keyboard.KeyCodes.EIGHT,
  Phaser.Input.Keyboard.KeyCodes.NINE,
  Phaser.Input.Keyboard.KeyCodes.ZERO,
  Phaser.Input.Keyboard.KeyCodes.MINUS,
  Phaser.Input.Keyboard.KeyCodes.PLUS,
];

const HP_BAR_HEIGHT = 3;
const HP_BAR_GAP = 4;
// Impacto (só desenho). Tremor quando você leva um golpe forte; tremor leve quando o golpe do bárbaro acerta
// (é a classe "pesada"). Flash branco em quem apanha; avermelhado em você.
const SHAKE_MIN_DAMAGE = 12;
const SHAKE_PER_DAMAGE = 0.45;
const BARBARIAN_HIT_SHAKE = 2.5;
const HIT_FLASH_COLOR = 0xffffff;
const SELF_FLASH_COLOR = 0xff8a80;
// Golpe que "acabou de sair": janela para ligar um mob sumido (morto no mesmo tick) ao golpe que o matou.
const RECENT_SWING_MS = 300;
const NUMBER_GAP = 8;

// Partículas (só desenho). Gotas ao atingir um mob: sangue escuro; ácido no slime.
const BLOOD_COLORS = [0x5d0a0a, 0x8b0000, 0x6d1010];
const ACID_COLORS = [0x76ff03, 0x64dd17, 0xb2ff59];
// Esporos por segundo em cada luz deste tipo que esteja na tela; espiral por segundo em cada portal.
const SPORE_RATE: Record<string, number> = {
  "cristal-grande": 1.4,
  "cristal-medio": 0.9,
  "cristal-pequeno": 0.5,
  minerio: 0.6,
  cogumelos: 1.0,
};
const SPORE_COLOR = 0x80f8ff;
const SPIRAL_RATE = 12;
const SPIRAL_COLORS: Record<string, number> = { portal: 0xe0aaff, saida: 0x80d8ff };
// A luz do portal fica no meio da arte; a espiral nasce perto do pé dele.
const SPIRAL_START_BELOW: Record<string, number> = { portal: 30, saida: 0 };
const SWING_RADIUS = PLAYER_ATTACK.range + PLAYER_SIZE / 2;
const SWING_HALF_ARC = (PLAYER_ATTACK.arcDegrees * Math.PI) / 180 / 2;
const TELEGRAPH_COLOR = 0xff1744;

type MoveKeys = Record<keyof MoveInput, Phaser.Input.Keyboard.Key>;

// Uma cena por visita a um lugar (ver `show`): ao trocar de sala, a cena anterior é jogada fora inteira.
class WorldScene extends Phaser.Scene {
  private place: Place = "city";
  private room?: Room<unknown, ServerState>;
  private keys?: MoveKeys;
  // Só na cidade: portais e portas dos prédios (lidos do mapa, como as paredes) e a tecla E.
  private portals: Vec2[] = [];
  private interactions: InteractionPoint[] = [];
  // Cidade e interiores (camada "regioes"): a câmera fica presa ao lugar onde o jogador está.
  private regions: { name: string; rect: Phaser.Geom.Rectangle }[] = [];
  private region = "";
  private doorAskedAt: number | undefined;
  private lastSelf: Vec2 | undefined;
  private portalKey?: Phaser.Input.Keyboard.Key;
  private avatars = new Map<string, Avatar>();
  private mobSprites = new Map<string, MobSprite>();
  private lootSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private pickupKey?: Phaser.Input.Keyboard.Key;
  private lastSentInput = "";
  private overlay?: Phaser.GameObjects.Graphics;
  private telegraphs?: Phaser.GameObjects.Graphics;
  private exitsLayer?: Phaser.GameObjects.Graphics;
  // Portal de cada saída ativa que este jogador vê.
  private exitSprites = new Map<string, Phaser.GameObjects.Image>();
  private lighting?: Lighting;
  // Luzes fixas do mapa (camada "luzes"); as que se mexem (jogadores, saídas) entram a cada quadro.
  private mapLights?: LightIndex<Light>;
  // Enfeites, prédios e sombras deles: só os perto da câmera ficam visíveis (mapas grandes).
  private culler = new StaticCuller();
  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  // Quando este cliente viu cada mob começar a preparar: base para o aviso encher no ritmo certo.
  private windupStartedAt = new Map<string, number>();
  private lastAttackSeq = new Map<string, number>();
  private swings: Swing[] = [];
  private numbers?: FloatingNumbers;
  private shake = new ScreenShake();
  private particles?: Particles;
  private lastOwnSwingAt = -Infinity;

  init(data: SceneData) {
    this.place = data.place;
    this.room = data.room;
  }

  // Mapas e folhas de tiles ficam no cache do jogo: só a primeira visita baixa os arquivos.
  preload() {
    if (!this.cache.tilemap.exists(this.place)) this.load.tilemapTiledJSON(this.place, MAP_URLS[this.place]);
    for (const { key, url } of [...TILESET_URLS, ...IDLE_URLS, ...MOB_IDLE_URLS]) if (!this.textures.exists(key)) this.load.image(key, url);
    for (const { key, url } of [...WALK_URLS, ...MOB_WALK_URLS]) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, url, { frameWidth: WALK_FRAME, frameHeight: WALK_FRAME });
    }
  }

  create() {
    this.createWalkAnimations();
    const map = this.createMap();
    this.mapLights = new LightIndex(this.readMapLights());
    this.lighting = new Lighting(this, AMBIENT[this.place], LIGHT_DEPTH, VIGNETTE_ALPHA[this.place]);
    this.numbers = new FloatingNumbers(this, OVERLAY_DEPTH + 1);
    // Entre a camada de luz (LIGHT_DEPTH) e a vinheta (LIGHT_DEPTH + 0.1): brilham no escuro, a vinheta ainda os cobre.
    this.particles = new Particles(this, LIGHT_DEPTH + 0.05);
    this.keys = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as MoveKeys;
    // Teclas dos slots nos dois lugares: o personagem leva o inventário para a cidade. Clicar no slot do HUD faz o mesmo.
    SLOT_KEYS.forEach((key, i) => {
      const phaserKey = this.input.keyboard?.addKey(key);
      if (phaserKey) this.slotKeys[i] = phaserKey;
    });
    // A janela mudou de formato: o tamanho do jogo muda junto (ver viewportSize). O HUD (HTML) se ajusta sozinho.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    const stopListening = () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopListening);
    this.events.once(Phaser.Scenes.Events.DESTROY, stopListening);
    const room = this.room;
    if (!room) return;
    room.onMessage("notice", (notice: { text: string }) => hud.notice(notice.text));
    if (this.place === "city") this.createCity(room, map);
    else this.createLabyrinth(room);
    activeScene = this;
    hud.show();
  }

  // Clique num slot do HUD: o mesmo pedido da tecla do slot. Quem decide se dá para usar é o servidor.
  useSlot(slot: number) {
    this.room?.send("use", { slot });
  }

  // Cliques nas janelas dos prédios (vender, comprar, baú). Quem decide é o servidor.
  send(type: string, message: unknown) {
    this.room?.send(type, message);
  }

  private onResize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.lighting?.resize(gameSize.width, gameSize.height);
  }

  // Portais desenhados a partir do mapa (são fixos, como as paredes). Quem decide se entrou é o servidor.
  private createCity(room: Room<unknown, ServerState>, map: Phaser.Tilemaps.Tilemap) {
    this.portals = (map.getObjectLayer(PORTAL_LAYER)?.objects ?? []).map((o) => ({ x: o.x ?? 0, y: o.y ?? 0 }));
    this.interactions = (map.getObjectLayer(INTERACTION_LAYER)?.objects ?? []).flatMap((o) =>
      o.name && isInteractionId(o.name) ? [{ id: o.name, x: o.x ?? 0, y: o.y ?? 0 }] : [],
    );
    this.regions = (map.getObjectLayer(REGION_LAYER)?.objects ?? []).map((o) => ({
      name: o.name,
      rect: new Phaser.Geom.Rectangle(o.x ?? 0, o.y ?? 0, o.width ?? 0, o.height ?? 0),
    }));
    const g = this.add.graphics().setDepth(EXIT_DEPTH);
    for (const portal of this.portals) {
      g.fillStyle(PORTAL_COLOR, 0.2);
      g.fillCircle(portal.x, portal.y, CITY_PORTAL_RADIUS);
      g.lineStyle(2, PORTAL_COLOR, 0.9);
      g.strokeCircle(portal.x, portal.y, CITY_PORTAL_RADIUS);
    }
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
    this.pickupKey = this.input.keyboard?.addKey("F");
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.sendAttack(pointer));
    room.onMessage("extracted", (result: ExtractionResult) => {
      this.room = undefined;
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
      hud.hide();
      showEndScreen("Você extraiu", describeLoot(result), "Voltar à cidade");
    });
    room.onMessage("firstKill", (info: FirstKillMessage) => {
      const levelUp = info.leveledUp ? `
Subiu para o nível ${info.level}!` : "";
      hud.notice(`Primeira morte: ${MOB_NAMES[info.mob]} (+XP)${levelUp}`);
      const self = room.state.players.get(room.sessionId);
      if (self) this.popNumber(self.x, self.y + PLAYER_SIZE / 2 - AVATAR_HEIGHT, `+${FIRST_KILL_XP} XP`, "xp");
    });
    room.onMessage("death", (cause: DeathCause) => {
      this.room = undefined;
      sessionStorage.removeItem(RECONNECTION_TOKEN_KEY);
      hud.hide();
      showEndScreen("Você morreu", describeDeath(cause), "Novo personagem");
    });
  }

  update(time: number, delta: number) {
    this.culler.update(this.cameras.main.worldView);
    this.numbers?.update(time, delta);
    this.particles?.update(time, delta);
    this.shake.update(this.cameras.main, delta);
    const room = this.room;
    if (!room || !this.keys) return;
    this.sendInputIfChanged(room, this.keys);
    this.slotKeys.forEach((key, slot) => {
      if (Phaser.Input.Keyboard.JustDown(key)) room.send("use", { slot });
    });
    this.syncAvatars(room, time);
    this.updateHud(room, time);
    if (this.place === "city") this.updateCity(room, time);
    else this.updateLabyrinth(room, time);
    const lights = this.currentLights(room);
    this.lighting?.draw(lights, time);
    this.emitAmbient(lights, time, delta);
  }

  // Esporos perto do que brilha e espiral nos portais, só para luzes na tela. Cada luz solta, em média,
  // a taxa do tipo por segundo (sorteio a cada quadro).
  private emitAmbient(lights: readonly Light[], time: number, delta: number) {
    if (!this.particles) return;
    const view = this.cameras.main.worldView;
    const dt = delta / 1000;
    for (const light of lights) {
      if (!light.kind || !view.contains(light.x, light.y)) continue;
      const spores = SPORE_RATE[light.kind];
      if (spores && Math.random() < spores * dt) {
        const spread = light.radius * 0.35;
        const x = light.x + Phaser.Math.FloatBetween(-spread, spread);
        this.particles.spore(x, light.y + Phaser.Math.FloatBetween(-10, 20), SPORE_COLOR, time);
      }
      const spiralColor = SPIRAL_COLORS[light.kind];
      if (spiralColor !== undefined && Math.random() < SPIRAL_RATE * dt) {
        this.particles.spiral(light.x, light.y + (SPIRAL_START_BELOW[light.kind] ?? 0), spiralColor, time);
      }
    }
  }

  // Luzes deste quadro: as do mapa e, no labirinto, a de cada jogador e a de cada saída ativa que chegaram do servidor.
  private currentLights(room: Room<unknown, ServerState>): Light[] {
    const fixed = this.mapLights?.around(this.cameras.main.worldView) ?? [];
    if (this.place === "city") return [...fixed];
    const moving: Light[] = [];
    room.state.players.forEach((player) => {
      moving.push({ x: player.x, y: player.y, radius: PLAYER_LIGHT_RADIUS, look: PLAYER_LIGHT, phase: 0 });
    });
    room.state.exits?.forEach((exit) => {
      const phase = phaseAt(exit.x, exit.y);
      moving.push({ x: exit.x, y: exit.y, radius: EXIT_LIGHT_RADIUS, look: EXIT_LIGHT, phase, kind: "saida" });
    });
    return [...fixed, ...moving];
  }

  private readMapLights(): Light[] {
    const data = (this.cache.tilemap.get(this.place) as { data?: TiledMap } | undefined)?.data;
    const layer = data?.layers.find((l) => l.type === "objectgroup" && l.name === LIGHT_LAYER);
    // Lanternas do mesmo tipo quase coladas (poste duplo) viram uma luz só.
    return mergeNearby(
      (layer?.objects ?? []).flatMap((object) => {
        const radius = lightRadius(object.name ?? "");
        if (radius === undefined) return [];
        const look = LIGHT_LOOKS[object.name as LightKind];
        return [{ x: object.x, y: object.y, radius, look, phase: phaseAt(object.x, object.y), kind: object.name }];
      }),
    );
  }

  // E dentro do portal pede para entrar no labirinto; numa porta, pede para entrar ou sair do prédio; num móvel,
  // abre (ou fecha) a janela dele. Afastou-se do móvel, a janela fecha. Dica e janela são só visuais; o servidor
  // confere onde o jogador está a cada pedido.
  private updateCity(room: Room<unknown, ServerState>, time: number) {
    const self = room.state.players.get(room.sessionId);
    if (!self) return;
    this.followRegion(self, time);
    const atPortal = isAtPortal(self, this.portals);
    const spot = atPortal ? undefined : interactionAt(self, this.interactions);
    if (hud.station && hud.station !== spot) hud.closeBuilding();
    const open = spot !== undefined && hud.station === spot;
    hud.hint(atPortal ? "[E] Entrar no labirinto" : spot && !open ? INTERACTION_HINTS[spot] : "");
    if (!this.portalKey || !Phaser.Input.Keyboard.JustDown(this.portalKey)) return;
    if (atPortal) room.send("enterPortal");
    else if (spot && isStationId(spot)) hud.toggleStation(spot);
    else if (spot && this.doorAskedAt === undefined) {
      this.doorAskedAt = time;
      this.cameras.main.fadeOut(DOOR_FADE_MS, 0, 0, 0);
      room.send("door");
    }
  }

  // Câmera presa à região (cidade ou interior) onde o jogador está; quando ele muda de lugar pela porta, clareia.
  private followRegion(self: Vec2, time: number) {
    const cam = this.cameras.main;
    const jumped = this.lastSelf !== undefined && Math.hypot(self.x - this.lastSelf.x, self.y - this.lastSelf.y) > DOOR_JUMP_PX;
    this.lastSelf = { x: self.x, y: self.y };
    const here = this.regions.find((r) => r.rect.contains(self.x, self.y));
    if (here && here.name !== this.region) {
      this.region = here.name;
      cam.setBounds(here.rect.x, here.rect.y, here.rect.width, here.rect.height);
    }
    if (this.doorAskedAt !== undefined && (jumped || time - this.doorAskedAt > DOOR_TIMEOUT_MS)) {
      this.doorAskedAt = undefined;
      cam.fadeIn(DOOR_FADE_MS * 2, 0, 0, 0);
    }
  }

  private updateLabyrinth(room: Room<unknown, ServerState>, time: number) {
    if (!this.overlay || !this.telegraphs) return;
    if (this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) room.send("pickup");
    if (room.state.mobs) this.syncMobs(room, room.state.mobs, time);
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
      this.exitSprites.set(id, portal.setDepth(sortDepth(exit.y)));
    });
    for (const [id, portal] of this.exitSprites) {
      if (seen.has(id)) continue;
      portal.destroy();
      this.exitSprites.delete(id);
    }
  }

  // Dados do próprio jogador para o HUD (HTML). Na cidade não há vida nem fome: o HUD mostra cheias.
  private updateHud(room: Room<unknown, ServerState>, time: number) {
    const self = room.state.players.get(room.sessionId);
    if (!self) return;
    const essences: ItemId[] = [];
    self.essences?.forEach((item) => essences.push(item as ItemId));
    const inventory: { item: string; count: number }[] = [];
    self.inventory?.forEach((slot, i) => (inventory[i] = { item: slot.item, count: slot.count }));
    const stash: { item: string; count: number }[] = [];
    self.stash?.forEach((slot, i) => (stash[i] = { item: slot.item, count: slot.count }));
    const bestiary: string[] = [];
    self.bestiary?.forEach((kind) => bestiary.push(kind));
    const kills: string[] = [];
    self.kills?.forEach((kind) => kills.push(kind));
    const level = self.level ?? 1;
    const maxHp = self.maxHp ?? playerStats(essences).maxHp;
    hud.update(
      {
        name: self.name ?? "",
        classId: self.classId ?? "",
        level,
        xp: self.xp ?? 0,
        nextLevelXp: xpForNextLevel(level),
        essences,
        hp: self.hp ?? maxHp,
        maxHp,
        hunger: self.hunger,
        coins: self.coins ?? 0,
        inventory,
        stash,
        bestiary,
        kills,
      },
      time,
    );
    if (this.place !== "labyrinth") return;
    const extractMs = self.extractMs ?? 0;
    hud.hint(extractMs > 0 ? `Extraindo… ${((EXTRACT_MS - extractMs) / 1000).toFixed(1)} s` : "");
  }

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
      if (sessionId === room.sessionId) this.lastOwnSwingAt = time;
      const classId = player.classId ?? "";
      const seed = Math.floor(Math.random() * 1e9);
      this.swings.push({ x: player.x, y: player.y, angle: player.attackAngle ?? 0, classId, startMs: time, seed });
    });
    this.swings = this.swings.filter((swing) => time - swing.startMs < swingDuration(swing.classId));
  }

  private drawOverlay(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics, time: number) {
    g.clear();
    for (const swing of this.swings) drawSwing(g, swing, time, SWING_RADIUS, SWING_HALF_ARC);
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
        const box = { left: object.x, top: object.y - image.displayHeight, right: object.x + image.displayWidth, bottom: object.y };
        this.culler.add(image, box);
        const name = key.slice(key.lastIndexOf("/") + 1);
        if (!FLAT_PROPS.has(name) && !BUILDING.test(name)) {
          this.culler.add(this.addPropShadow(object.x + image.displayWidth / 2, object.y, image.displayWidth), box);
        }
      }
    }
  }

  // Sombra de enfeite em pé: elipse achatada na base, mais estreita que a imagem.
  private addPropShadow(x: number, baseY: number, imageWidth: number): Phaser.GameObjects.Ellipse {
    const width = Math.min(imageWidth * 0.7, 110);
    return this.add.ellipse(x, baseY - 3, width, width * 0.28, 0x000000, SHADOW_ALPHA).setDepth(SHADOW_DEPTH);
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
    for (const { key } of [...WALK_URLS, ...MOB_WALK_URLS]) {
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
      const isSelf = sessionId === room.sessionId;
      if (player.hp !== undefined) {
        if (avatar.lastHp !== undefined && player.hp !== avatar.lastHp) {
          this.onPlayerHp(room, player, avatar, player.hp - avatar.lastHp, isSelf, time);
        }
        avatar.lastHp = player.hp;
      }
      this.animateAvatar(avatar, player.classId, time - avatar.lastMoveAt < WALK_LINGER_MS);
      const recoil = recoilOffset(avatar.reaction, time);
      avatar.body.setPosition(player.x + recoil.x, feet + recoil.y).setDepth(sortDepth(feet));
      applyFlash(avatar.body, avatar.reaction, time, isSelf ? SELF_FLASH_COLOR : HIT_FLASH_COLOR);
      avatar.shadow.setPosition(player.x, feet - 1).setScale(stepSquash(avatar.body));
      avatar.label.setPosition(player.x, feet - AVATAR_HEIGHT - HP_BAR_GAP - HP_BAR_HEIGHT - 2);
    });
    for (const [sessionId, avatar] of this.avatars) {
      if (seen.has(sessionId)) continue;
      avatar.body.destroy();
      avatar.shadow.destroy();
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
    const { width, height } = AVATAR_SHADOW;
    const shadow = this.add.ellipse(player.x, feet - 1, width, height, 0x000000, SHADOW_ALPHA).setDepth(SHADOW_DEPTH);
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
    const reaction = newReaction();
    return { body, shadow, label, facing: "south", lastX: player.x, lastY: player.y, lastMoveAt: -Infinity, reaction };
  }

  // Como syncAvatars, para os inimigos. A direção é só visual: preparando o golpe, olha para onde vai bater
  // (attackAngle, o mesmo do aviso no chão); senão, para onde andou desde o último quadro.
  private syncMobs(
    room: Room<unknown, ServerState>,
    mobs: { forEach(callback: (mob: MobView, id: string) => void): void },
    time: number,
  ) {
    const seen = new Set<string>();
    mobs.forEach((mob, id) => {
      seen.add(id);
      const kind = mob.kind as MobKind;
      let sprite = this.mobSprites.get(id);
      if (!sprite) {
        const art = MOB_ART[kind];
        const body = this.add.sprite(mob.x, mob.y, mobKey(kind, "south")).setOrigin(0.5, art.feet / MOB_FRAME);
        const shadow = this.add.ellipse(mob.x, mob.y, art.shadow, art.shadow * 0.32, 0x000000, SHADOW_ALPHA).setDepth(SHADOW_DEPTH);
        const reaction = newReaction();
        sprite = { body, shadow, facing: "south", lastX: mob.x, lastY: mob.y, lastMoveAt: -Infinity, reaction, lastHp: mob.hp };
        this.mobSprites.set(id, sprite);
      }
      const dx = mob.x - sprite.lastX;
      const dy = mob.y - sprite.lastY;
      if (mob.windup) sprite.facing = facingFor(Math.cos(mob.attackAngle), Math.sin(mob.attackAngle));
      else if (Math.hypot(dx, dy) > 0.5) sprite.facing = facingFor(dx, dy);
      if (Math.hypot(dx, dy) > 0.5) sprite.lastMoveAt = time;
      sprite.lastX = mob.x;
      sprite.lastY = mob.y;
      const feet = mob.y + MOB_KINDS[kind].size / 2;
      if (mob.hp < sprite.lastHp) this.onMobHit(room, mob, sprite, sprite.lastHp - mob.hp, time);
      sprite.lastHp = mob.hp;
      // Andando = mudou de lugar nos últimos WALK_LINGER_MS e não está parado preparando o golpe.
      const walking = time - sprite.lastMoveAt < WALK_LINGER_MS && !mob.windup;
      this.animateMob(sprite, kind, walking);
      const recoil = recoilOffset(sprite.reaction, time);
      sprite.body.setPosition(mob.x + recoil.x, feet + recoil.y).setDepth(sortDepth(feet));
      applyFlash(sprite.body, sprite.reaction, time, HIT_FLASH_COLOR);
      // A sombra pulsa com o passo da caminhada; quem não tem caminhada (slime) pulsa no ritmo do relógio.
      const squash = sprite.body.anims.isPlaying ? stepSquash(sprite.body) : 1 - 0.1 * Math.abs(Math.sin(time / 90));
      sprite.shadow.setPosition(mob.x, feet - 1).setScale(walking ? squash : 1);
    });
    for (const [id, sprite] of this.mobSprites) {
      if (seen.has(id)) continue;
      // O servidor tira o mob no mesmo tick do golpe final, então a vida nunca chega a 0 aqui. Se ele sumiu logo
      // depois de um golpe que o alcançava, foi morto: o número é a vida que restava.
      if (this.swingReached(sprite.lastX, sprite.lastY, time)) {
        this.popNumber(sprite.lastX, sprite.body.y - sprite.body.displayHeight * sprite.body.originY, `${sprite.lastHp}`, "dealt");
        const kind = sprite.body.texture.key.split("/")[1] as MobKind;
        if (MOB_KINDS[kind]) this.splatter({ x: sprite.lastX, y: sprite.lastY }, kind, { x: 0, y: -1 }, time);
      }
      sprite.body.destroy();
      sprite.shadow.destroy();
      this.mobSprites.delete(id);
    }
  }

  // Vida de um jogador mudou: número em cima dele, flash e recuo. Em você, golpe forte treme a tela.
  private onPlayerHp(
    room: Room<unknown, ServerState>,
    player: PlayerView,
    avatar: Avatar,
    change: number,
    isSelf: boolean,
    time: number,
  ) {
    const top = player.y + PLAYER_SIZE / 2 - AVATAR_HEIGHT;
    if (change > 0) {
      if (isSelf) this.popNumber(player.x, top, `+${change}`, "heal");
      return;
    }
    const damage = -change;
    this.popNumber(player.x, top, `${damage}`, isSelf ? "taken" : "dealt");
    const away = awayFromNearest(player, mobPositions(room));
    startReaction(avatar.reaction, time, away.x, away.y);
    if (isSelf && damage >= SHAKE_MIN_DAMAGE) this.shake.kick(damage * SHAKE_PER_DAMAGE);
  }

  // Mob levou dano: número, flash e recuo para longe do jogador mais perto. Golpe do bárbaro que acerta treme leve.
  private onMobHit(room: Room<unknown, ServerState>, mob: MobView, sprite: MobSprite, damage: number, time: number) {
    const kind = mob.kind as MobKind;
    const top = mob.y + MOB_KINDS[kind].size / 2 - MOB_ART[kind].height;
    this.popNumber(mob.x, top, `${damage}`, "dealt");
    const players: Vec2[] = [];
    room.state.players.forEach((player) => players.push(player));
    const away = awayFromNearest(mob, players);
    startReaction(sprite.reaction, time, away.x, away.y);
    this.splatter(mob, kind, away, time);
    const self = room.state.players.get(room.sessionId);
    if (self?.classId === "barbaro" && time - this.lastOwnSwingAt < RECENT_SWING_MS && this.swingReached(mob.x, mob.y, time)) {
      this.shake.kick(BARBARIAN_HIT_SHAKE);
    }
  }

  // Andando: a caminhada da direção (ou da cardeal ao lado, se a diagonal não tem arte), continuando do mesmo quadro
  // ao virar. Parado, preparando golpe ou sem caminhada nenhuma (slime): o sprite parado da direção, nas 8.
  private animateMob(sprite: MobSprite, kind: MobKind, walking: boolean) {
    const body = sprite.body;
    const art = MOB_ART[kind];
    const walk = walking && art.walkFeet !== undefined ? this.mobWalkKey(kind, sprite.facing) : undefined;
    if (walk && art.walkFeet !== undefined) {
      if (body.anims.currentAnim?.key === walk && body.anims.isPlaying) return;
      const frame = body.anims.isPlaying ? (body.anims.currentFrame?.index ?? 1) - 1 : 0;
      body.setOrigin(0.5, art.walkFeet / WALK_FRAME).play({ key: walk, startFrame: frame });
      return;
    }
    if (body.anims.isPlaying) body.stop();
    const idle = mobKey(kind, sprite.facing);
    if (body.texture.key !== idle) body.setTexture(idle).setOrigin(0.5, art.feet / MOB_FRAME);
  }

  private mobWalkKey(kind: MobKind, facing: string): string | undefined {
    for (const direction of [facing, WALK_FALLBACK[facing]]) {
      const key = direction && mobKey(kind, `walk-${direction}`);
      if (key && this.anims.exists(key)) return key;
    }
    return undefined;
  }

  // Gotas saltando do meio do corpo do mob, para longe de quem bateu, na frente dele.
  private splatter(mob: Vec2, kind: MobKind, away: Vec2, time: number) {
    const feet = mob.y + MOB_KINDS[kind].size / 2;
    const colors = kind === "slime" ? ACID_COLORS : BLOOD_COLORS;
    this.particles?.burst(mob.x, feet - MOB_ART[kind].height / 2, colors, away.x, away.y, sortDepth(feet) + 1, time);
  }

  // Algum golpe recente alcançava este ponto (raio do golpe mais a metade do maior mob)?
  private swingReached(x: number, y: number, time: number): boolean {
    const reach = SWING_RADIUS + TILE_HALF;
    return this.swings.some((swing) => time - swing.startMs < RECENT_SWING_MS && Math.hypot(swing.x - x, swing.y - y) <= reach);
  }

  private popNumber(x: number, top: number, label: string, kind: NumberKind) {
    this.numbers?.spawn(x, top - NUMBER_GAP, label, kind, this.time.now);
  }

  private createLootSprite() {
    return this.add.rectangle(0, 0, LOOT_SIZE, LOOT_SIZE, LOOT_COLOR).setStrokeStyle(1, 0x000000).setDepth(LOOT_DEPTH);
  }
}

// Deixa os desenhos iguais à coleção que o servidor mandou: cria o que chegou, move o que já existe
// e destrói o que saiu (foi pego ou saiu do raio de visão).
// halfHeight: com ele, a profundidade segue a base da entidade (Y-sorting); sem ele, fica a de criação.
const TILE_HALF = 16;

function mobPositions(room: Room<unknown, ServerState>): Vec2[] {
  const positions: Vec2[] = [];
  room.state.mobs?.forEach((mob) => positions.push(mob));
  return positions;
}

// Direção para longe de quem está mais perto (para o recuo). Sem ninguém por perto, (0, 0): sem recuo.
function awayFromNearest(from: Vec2, others: readonly Vec2[]): Vec2 {
  let best: Vec2 | undefined;
  let bestDistance = Infinity;
  for (const other of others) {
    const d = Math.hypot(other.x - from.x, other.y - from.y);
    if (d > 0 && d < bestDistance) {
      best = other;
      bestDistance = d;
    }
  }
  return best ? { x: from.x - best.x, y: from.y - best.y } : { x: 0, y: 0 };
}

// Sombra encolhe um pouco nos quadros em que o pé está no ar. Uma volta da fita são dois passos (pés no chão na
// metade e no fim): 6 quadros nas classes e no goblin, 4 no lobo e no gnomo.
function stepSquash(body: Phaser.GameObjects.Sprite): number {
  const anim = body.anims.currentAnim;
  if (!body.anims.isPlaying || !anim) return 1;
  const frame = body.anims.currentFrame?.index ?? 0;
  return 1 - 0.12 * Math.abs(Math.sin((frame * 2 * Math.PI) / anim.frames.length));
}

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
// O HUD é um só para a página (HTML); cada cena que entra numa sala passa a ser a "ativa" e recebe os cliques.
let activeScene: WorldScene | undefined;
const hud = new Hud(
  (slot) => activeScene?.useSlot(slot),
  (type, message) => activeScene?.send(type, message),
);
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
