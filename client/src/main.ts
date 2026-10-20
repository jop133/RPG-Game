import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import {
  CITY_PORTAL_RADIUS,
  CLASS_IDS,
  CLASS_REQUIRED_CODE,
  GID_MASK,
  STASH_SLOTS,
  EXIT_RADIUS,
  EXTRACT_MS,
  ITEMS,
  MOB_KINDS,
  EXIT_LIGHT_RADIUS,
  FIRST_KILL_XP,
  INTERACTION_LAYER,
  REGION_LAYER,
  LIGHT_LAYER,
  PLAYER_LIGHT_RADIUS,
  PLAYER_MAX_HP,
  PLAYER_SIZE,
  PORTAL_LAYER,
  interactionAt,
  isAtPortal,
  isBuildingId,
  isInteractionId,
  objectSortLine,
  isStationId,
  lightRadius,
  mobStrikeArc,
  playerStats,
  viewportSize,
  weaponStats,
  wrongClassNotice,
  canEquip,
  equipSlotOf,
  parseClassId,
  feetInside,
  swampArea,
  AREAS,
  TORCH,
  ZONE_EFFECTS,
  parseAreas,
  torchInReach,
  zoneAt,
  type Area,
  type ZoneId,
  SKILL_SLOTS,
  SKILL_IDS,
  type SkillId,
  DRAWN_BODY_LAYERS,
  type EquipSlot,
  type Equipment,
  type ItemStats,
  xpForNextLevel,
  type InteractionId,
  type InteractionPoint,
  type ClassId,
  type DeathCause,
  type HazardKind,
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
  ATTACK_FACING_MS,
  FloatingNumbers,
  ScreenShake,
  applyFlash,
  drawBladeTrail,
  drawSwing,
  lungeOffset,
  mobLungeOffset,
  newReaction,
  recoilOffset,
  staffPose,
  startReaction,
  swingDuration,
  weaponPose,
  type HitReaction,
  type NumberKind,
  type Swing,
} from "./juice";
import { LightIndex, StaticCuller } from "./culling";
import handSockets from "../../assets/characters/hand_sockets.json";
import staffLook from "../../assets/weapons/cajado_arcano.json";
import { Hud } from "./hud";
import type { Prompt } from "./plates";
import { Lighting, mergeNearby, phaseAt, type Light, type LightLook } from "./lighting";
import { Particles } from "./particles";
import { Bolts, FIREBALL_FPS, FIREBALL_KEY, type ProjectileView } from "./projectiles";
import { MUD_FPS, MUD_KEY, SPELL_SHEETS, STRIKE_FPS, STRIKE_KEY, SpellEffects, type SpellView } from "./spells";
import { ZoneEffects, type HazardView } from "./zoneEffects";
import { openRegistration, type Registration } from "./registration";
import cityMapUrl from "../../assets/maps/city.json?url";
import labyrinthMapUrl from "../../assets/maps/dungeon_floor1.json?url";

// Só o que o cliente lê do estado do servidor. O formato real está em server/src/state.ts.
interface PlayerView extends Vec2 {
  name?: string;
  classId?: string;
  // O que está equipado (slot -> id de item; slot ausente = vazio): a arma na mão e a armadura no corpo. Público.
  equipment?: { get(slot: string): string | undefined; forEach(callback: (item: string, slot: string) => void): void };
  // Só no labirinto: a cidade não tem vida nem combate.
  hp?: number;
  maxHp?: number;
  // Só o próprio jogador: as habilidades nos slots Q e R ("" = vazio) e, no labirinto, a recarga que falta (ms) de
  // cada habilidade da classe.
  skills?: { forEach(callback: (skill: string, index: number) => void): void };
  skillCooldowns?: { get(skill: string): number | undefined };
  // Só o próprio jogador, no labirinto: Mana, a zona hostil ("" fora delas) e os olhos dos goblins no breu (x, y, ...).
  mana?: number;
  maxMana?: number;
  zone?: string;
  eyes?: { forEach(callback: (value: number, index: number) => void): void };
  // Público: sangrando (gotas de sangue).
  bleeding?: boolean;
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
  // Lobo em Frenesi de Sangue.
  frenzy?: boolean;
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
  // Projéteis Mágicos em voo (só no labirinto).
  projectiles?: { forEach(callback: (bolt: ProjectileView, id: string) => void): void };
  // Magias do mago no chão (só no labirinto).
  spells?: { forEach(callback: (spell: SpellView, id: string) => void): void };
  // Zonas hostis: tochas dos goblins e perigos do chão.
  torches?: { forEach(callback: (torch: Vec2 & { lit: boolean }, id: string) => void): void };
  hazards?: { forEach(callback: (hazard: HazardView, id: string) => void): void };
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
const IDLE_URLS = CHARACTER_URLS.filter(({ key }) => !key.includes("/walk-") && !key.includes("/attack-"));
// Golpe desenhado (futuro): "characters/<classe>/attack-<direção>", fita de quadros 96x96 como a caminhada. Se a classe
// tiver, toca no golpe e a espada segue a mão de cada quadro (hand_sockets.json); se não, fica a pose parada.
const ATTACK_URLS = CHARACTER_URLS.filter(({ key }) => key.includes("/attack-"));
// Armadura vestida (tools/assets/build_armor_layers.py): uma camada por peça, quadro a quadro, com o mesmo nome do
// sprite do corpo: "armor/<classe>/<visual>/<peça>/<direção>" (64x64) e ".../walk-<direção>" (fita 96x96).
const ARMOR_URLS = Object.entries(
  import.meta.glob<string>("../../assets/characters/*/armor/*/*/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => {
  const [classId, , look, piece, name] = path.slice(path.indexOf("characters/") + "characters/".length, -".png".length).split("/");
  return { key: `armor/${classId}/${look}/${piece}/${name}`, url };
});
const ARMOR_IDLE_URLS = ARMOR_URLS.filter(({ key }) => !key.includes("/walk-"));
const ARMOR_WALK_URLS = ARMOR_URLS.filter(({ key }) => key.includes("/walk-"));
// Sprites dos inimigos (tools/assets/process_mobs.py): parado "mobs/<tipo>/<direção>" (64x64, 8 direções) e
// caminhada "mobs/<tipo>/walk-<direção>" (fita de quadros 96x96), só nas direções que têm arte: o lobo e o goblin
// andam nas 8, o gnomo só nas 4 cardeais, o slime não tem caminhada. Só se carrega o que existe (nada de 404).
const MOB_URLS = Object.entries(
  import.meta.glob<string>("../../assets/mobs/*/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ key: path.slice(path.indexOf("mobs/"), -".png".length), url }));
const MOB_IDLE_URLS = MOB_URLS.filter(({ key }) => !key.includes("/walk-"));
// Magias do mago (tools/assets/process_spells.py): "spells/<nome>". As tiras (SPELL_SHEETS) carregam em quadros; os
// círculos rúnicos, como imagem.
const SPELL_URLS = Object.entries(
  import.meta.glob<string>("../../assets/spells/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ key: path.slice(path.indexOf("spells/"), -".png".length), url }));
// Altura das magias no chão: acima das sombras, abaixo do anel das saídas, dos avisos e de todo mundo em pé.
const SPELL_GROUND_DEPTH = 0.3;
// Zonas hostis no cliente. Breu dos goblins: o ambiente vai para quase preto (opacidade ~0,96) e a luz de quem está lá
// encolhe junto com a do servidor (ZONE_EFFECTS.goblin.lightFactor), numa transição de ZONE_FADE_MS. Frio dos lobos:
// vinheta azul-gelo, mais forte. Tocha apagada: a arte escurecida. Slime parado pulsa; lobo em frenesi fica vermelho.
const ZONE_FADE_MS = 1200;
const GOBLIN_AMBIENT = 0x060709;
const FROST_TINT = 0x8fc8ff;
const FROST_VIGNETTE_ALPHA = 0.5;
const UNLIT_TORCH_TINT = 0x2e2a26;
const FRENZY_TINT = 0xff6a5a;
const HAZARD_DEPTH = 0.29;
// Tocha do mapa e a do servidor são a mesma se estão a até isto (px): a luz do mapa fica no fogo, um pouco acima.
const TORCH_MATCH = 48;

// Teclas dos slots de habilidade (escolha do dono do projeto: 1 e 2 são a barra rápida, E é portal e portas).
const SKILL_KEYS = ["Q", "R"] as const;

// As habilidades nos slots Q e R do jogador ("" no estado = vazio).
function skillsOf(player: PlayerView): (SkillId | null)[] {
  const out: (SkillId | null)[] = Array.from({ length: SKILL_SLOTS }, () => null);
  player.skills?.forEach((skill, i) => {
    if (i < SKILL_SLOTS) out[i] = SKILL_IDS.find((id) => id === skill) ?? null;
  });
  return out;
}
// Armas (tools/assets/weapons.py): 48x48, na horizontal apontando para a direita; chave "weapons/<arma>".
const WEAPON_URLS = Object.entries(
  import.meta.glob<string>("../../assets/weapons/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ key: path.slice(path.indexOf("weapons/"), -".png".length), url }));
// Textura inicial da arma na mão; poseWeapon troca para a arma equipada (WEAPON_LOOKS).
const WEAPON_KEY = "weapons/espada_ferro";
// A espada gira em volta do punho (origem no cabo, perto da esquerda da imagem), preso à mão do personagem: o ponto
// da mão de cada quadro vem de hand_sockets.json (tools/assets/process_ui.py), a partir dos pés do sprite.
const WEAPON_ORIGIN = { x: 0.18, y: 0.5 };
// Como cada arma fica na mão: a origem (o ponto de pega, em fração da imagem), para onde a arte aponta (a espada para
// a direita; o cajado na diagonal da arte, cristal para cima e para a direita: o cliente desconta esse ângulo) e, no
// cajado, a ponta do cristal (onde sai o clarão do disparo). Os do cajado vêm de tools/assets/process_staff.py.
interface WeaponLook {
  origin: { x: number; y: number };
  artAngle: number;
  tip?: { x: number; y: number };
}
const SWORD_LOOK: WeaponLook = { origin: WEAPON_ORIGIN, artAngle: 0 };
const WEAPON_LOOKS: Record<string, WeaponLook> = {
  espada_ferro: SWORD_LOOK,
  cajado_arcano: {
    origin: { x: staffLook.grip[0] ?? 0.35, y: staffLook.grip[1] ?? 0.64 },
    artAngle: (staffLook.artAngleDegrees * Math.PI) / 180,
    tip: { x: staffLook.tip[0] ?? 0.9, y: staffLook.tip[1] ?? 0.1 },
  },
};
// Arma que dispara (cajado) em vez de golpear: sem varrida nem rastro de lâmina; o disparo é a canalização (staffPose).
function isStaff(weapon: string | undefined): boolean {
  return weapon !== undefined && weapon in ITEMS && weaponStats({ weapon: weapon as ItemId }).weaponType === "staff";
}
const WEAPON_REACH = 36; // do punho até a ponta, em px (para o rastro)
// No golpe, o braço estica até WEAPON_ARM_EXTEND px na direção do ataque, no pico da varrida.
const WEAPON_ARM_EXTEND = 3;
// Guarda (parado ou andando): a lâmina levemente para cima e para a frente de onde o personagem olha, em graus
// (0 = direita, -90 = para cima). A arte da espada aponta para a direita, então o ângulo vai direto na rotação. Em
// north-west (mão atrás do corpo) ela sobe quase reta, para não sumir atrás do tronco; em south e south-east cruza a
// frente do tronco, na diagonal para cima e para a direita.
const WEAPON_GUARD_DEGREES: Record<string, number> = {
  south: -35,
  "south-west": -150,
  west: -150,
  "north-west": -85,
  north: -65,
  "north-east": -40,
  east: -30,
  "south-east": -35,
};
// Guarda própria de uma classe numa direção. O mago, em south, segura a espada subindo ao lado do corpo em vez de
// cruzar o tronco; em south-east cruza, mas mais deitada que os outros.
const WEAPON_GUARD_BY_CLASS: Record<string, Record<string, number>> = {
  mago: { south: -115, "south-east": -30 },
};
// Mão por cima do cabo: um recorte do próprio sprite, só o punho (GRIP_SIZE px de lado), desenhado por cima da espada.
// O recorte sai GRIP_OUTWARD px para fora do corpo, para pegar dedos e braçadeira e nada do tronco.
const GRIP_SIZE = 9;
const GRIP_OUTWARD = 2;
// Respiração da guarda: ±3° num ciclo lento parado; andando, ±8° acompanhando os passos (um ciclo por volta da fita).
const WEAPON_IDLE_SWAY = (3 * Math.PI) / 180;
const WEAPON_IDLE_SWAY_MS = 2400;
const WEAPON_WALK_SWAY = (8 * Math.PI) / 180;
// Reserva para classe sem dado de caminhada: balanço da mão por quadro somado ao parado (bobX invertido para oeste).
const WALK_HAND_BOB = [
  { x: 0, y: 0 },
  { x: 1, y: -2 },
  { x: 1, y: -1 },
  { x: 0, y: 0 },
  { x: -1, y: -2 },
  { x: -1, y: -1 },
];
interface HandSocket {
  dx: number;
  dy: number;
  behindBody: boolean;
}
// classe -> animação (idle, walk, attack) -> direção -> um socket por quadro.
const HAND_SOCKETS = handSockets as Record<string, Record<string, Record<string, HandSocket[]>>>;
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
  // Espada do golpe (escondida fora dele) e o golpe mais recente: quando saiu e para onde.
  weapon: Phaser.GameObjects.Image;
  // O punho do sprite recortado, por cima do cabo da espada (só quando a mão está na frente do corpo).
  grip: Phaser.GameObjects.Image;
  // A armadura do corpo, uma camada por peça (bota, calça, peitoral, elmo), no mesmo quadro do sprite.
  armor: Map<EquipSlot, Phaser.GameObjects.Image>;
  swingAt: number;
  swingAngle: number;
  // Vida que mudou aos pedaços e ainda não virou número (ver onPlayerHp).
  pendingHp: number;
  // A arma na mão agora (id do item) e, com cajado, um disparo esperando o clarão na ponta do cristal.
  weaponItem?: string;
  castFlash: boolean;
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
  // windup do quadro anterior: quando vira false, o golpe saiu e o mob dá um bote (lungeAt, lungeAngle).
  lastWindup: boolean;
  lungeAt: number;
  lungeAngle: number;
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
// Dentro dos prédios (regiões com o id do prédio): âmbar claro (~80% de claridade) em toda a sala, para nenhum canto
// ficar apagado; as velas, lanternas e braseiros somam por cima. Fora das paredes o chão é vazio preto (continua preto).
// Vinheta fraca: só um toque nos cantos.
const INTERIOR_AMBIENT = 0xdecaa8;
const INTERIOR_VIGNETTE_ALPHA = 0.2;
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
// Placa de interação de cada porta e móvel (tecla E): o título da ação e um subtítulo curto.
const INTERACTION_PROMPTS: Record<InteractionId, Prompt> = {
  guild: { key: "E", title: "Entrar no Salão da Guilda", subtitle: "Venda de loot, bestiário e rank" },
  inn: { key: "E", title: "Entrar na Estalagem", subtitle: "Comida e o Baú da Linhagem" },
  blacksmith: { key: "E", title: "Entrar na Forja", subtitle: "Armas e armaduras do ferreiro" },
  "guild-exit": { key: "E", title: "Sair", subtitle: "Voltar para a praça" },
  "inn-exit": { key: "E", title: "Sair", subtitle: "Voltar para a praça" },
  "blacksmith-exit": { key: "E", title: "Sair", subtitle: "Voltar para a praça" },
  "guild-counter": { key: "E", title: "Falar com o Intendente", subtitle: "Vender o loot extraído" },
  "guild-bestiary": { key: "E", title: "Consultar o Bestiário", subtitle: "Feras abatidas e o rank da linhagem" },
  "inn-counter": { key: "E", title: "Comprar suprimentos", subtitle: "Rações para a fome no labirinto" },
  "inn-chest": { key: "E", title: "Abrir o Baú da Linhagem", subtitle: `${STASH_SLOTS} slots que o herdeiro herda` },
  "blacksmith-counter": { key: "E", title: "Comprar", subtitle: "Armas e armaduras do ferreiro" },
  "blacksmith-anvil": { key: "E", title: "Forja", subtitle: "Receitas com materiais da caverna" },
};
const PORTAL_PROMPT: Prompt = { key: "E", title: "Entrar no Portal", subtitle: "O Labirinto aguarda além do véu", arcane: true };
// Troca de lugar pela porta: escurece, o servidor muda o jogador de lugar e clareia. Sem resposta (fora da porta,
// no servidor), clareia depois de DOOR_TIMEOUT_MS.
const DOOR_FADE_MS = 120;
const DOOR_TIMEOUT_MS = 700;
const DOOR_JUMP_PX = 256;
const EXIT_PORTAL_TINT = 0x80d8ff;

// Sombra nos pés: elipse escura no chão, embaixo de jogadores, mobs e enfeites em pé.
const SHADOW_ALPHA = 0.45;
const AVATAR_SHADOW = { width: 26, height: 9 };
// Labirinto: enfeites deitados no chão ficam sem sombra; prédios também (a base deles já é desenhada na arte).
const FLAT_PROPS = new Set(["esqueleto", "ossada", "cogumelos-a", "cogumelos-b"]);
const BUILDING = /^(house_|landmark_)/;
// Cidade e interiores: só enfeites finos em pé (postes, árvores, placa, pilares) ganham a elipse; móveis largos
// (balcões, mesas, caixotes, tanques, fornalha) já têm a sombra de contato desenhada na arte, e a elipse ficava enorme.
const THIN_PROP = /^(poste|arvore|placa-direcao|pilar)/;

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
// Onde fica, no mundo, um ponto da imagem da arma (em fração da imagem), com a posição, a rotação e a escala dela.
function weaponPoint(image: Phaser.GameObjects.Image, point: { x: number; y: number }): Vec2 {
  const lx = (point.x - image.originX) * image.width * image.scaleX;
  const ly = (point.y - image.originY) * image.height * image.scaleY;
  const cos = Math.cos(image.rotation);
  const sin = Math.sin(image.rotation);
  return { x: image.x + lx * cos - ly * sin, y: image.y + lx * sin + ly * cos };
}
// Tamanho do desenho do golpe: o alcance (da borda de quem bate) e o arco da arma na mão, ou do soco.
function swingShape(weapon: string | undefined): { radius: number; halfArc: number } {
  const attack = weaponStats(weapon ? { weapon: weapon as ItemId } : {});
  return { radius: attack.range + PLAYER_SIZE / 2, halfArc: (attack.arcDegrees * Math.PI) / 180 / 2 };
}
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
  // Projéteis Mágicos: sprite, luz, rastro e explosão (o voo é do servidor).
  private bolts?: Bolts;
  // Magias do mago no chão (círculos, raio, poça) e as teclas delas.
  private spellEffects?: SpellEffects;
  private skillKeys: Phaser.Input.Keyboard.Key[] = [];
  // [E] no labirinto: acender tocha dos goblins; a dica fica até se afastar.
  private torchKey?: Phaser.Input.Keyboard.Key;
  private torchPrompt: Prompt | undefined;
  // Zonas hostis: os efeitos, as áreas do mapa (qual zona), as artes das tochas dos goblins, o fator de luz suave de
  // cada jogador (1 = normal) e o escuro suave do ambiente (0 a 1).
  private zoneFx?: ZoneEffects;
  private areas: Area[] = [];
  private torchArt: { image: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private lightFactors = new Map<string, number>();
  private darkness = 0;
  private frost = 0;
  private lastOwnSwingAt = -Infinity;

  init(data: SceneData) {
    this.place = data.place;
    this.room = data.room;
  }

  // Mapas e folhas de tiles ficam no cache do jogo: só a primeira visita baixa os arquivos.
  preload() {
    if (!this.cache.tilemap.exists(this.place)) this.load.tilemapTiledJSON(this.place, MAP_URLS[this.place]);
    for (const { key, url } of [...TILESET_URLS, ...IDLE_URLS, ...MOB_IDLE_URLS, ...WEAPON_URLS, ...ARMOR_IDLE_URLS]) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
    for (const { key, url } of [...WALK_URLS, ...MOB_WALK_URLS, ...ATTACK_URLS, ...ARMOR_WALK_URLS]) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, url, { frameWidth: WALK_FRAME, frameHeight: WALK_FRAME });
    }
    for (const { key, url } of SPELL_URLS) {
      if (this.textures.exists(key)) continue;
      const sheet = (SPELL_SHEETS as Record<string, { frameWidth: number; frameHeight: number }>)[key];
      if (sheet) this.load.spritesheet(key, url, sheet);
      else this.load.image(key, url);
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
    this.bolts = new Bolts(this, this.particles, LIGHT_DEPTH + 0.05);
    this.spellEffects = new SpellEffects(this, this.particles, SPELL_GROUND_DEPTH, sortDepth, (amplitude) => this.shake.kick(amplitude));
    this.zoneFx = new ZoneEffects(this, this.particles, HAZARD_DEPTH, LIGHT_DEPTH + 0.06);
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
    if (this.refusesEquip("use", { slot })) return;
    this.room?.send("use", { slot });
  }

  // Cliques nas janelas dos prédios (vender, comprar, baú) e na de inventário. Quem decide é o servidor.
  send(type: string, message: unknown) {
    if (this.refusesEquip(type, message)) return;
    this.room?.send(type, message);
  }

  // Equipar um item de outra classe (o cajado fora do mago): o servidor recusaria igual; aqui o aviso sai na hora e
  // nada é enviado. Vale para usar o slot (tecla ou clique), soltar no slot de equipamento e trocar a peça equipada
  // arrastando-a para cima do item.
  private refusesEquip(type: string, message: unknown): boolean {
    const room = this.room;
    const self = room?.state.players.get(room.sessionId);
    const request = (message ?? {}) as { slot?: unknown; to?: unknown };
    const index = type === "use" || type === "equip" ? request.slot : type === "unequip" ? request.to : undefined;
    if (!self || typeof index !== "number") return false;
    let item: string | undefined;
    self.inventory?.forEach((slot, i) => {
      if (i === index && slot.count > 0) item = slot.item;
    });
    if (!item || !(item in ITEMS)) return false;
    const target = equipSlotOf(item as ItemId);
    if (!target || (type === "unequip" && target !== request.slot)) return false;
    if (canEquip(item as ItemId, parseClassId(self.classId))) return false;
    hud.notice(wrongClassNotice(item as ItemId));
    return true;
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
    SKILL_KEYS.forEach((key, slot) => {
      const phaserKey = this.input.keyboard?.addKey(key);
      if (phaserKey) this.skillKeys[slot] = phaserKey;
    });
    this.torchKey = this.input.keyboard?.addKey("E");
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
      if (Phaser.Input.Keyboard.JustDown(key)) this.useSlot(slot);
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
    const all = this.mapLights?.around(this.cameras.main.worldView) ?? [];
    if (this.place === "city") return [...all];
    // Tochas e braseiros dos goblins só iluminam acesos (o servidor manda quais).
    const lit: Vec2[] = [];
    room.state.torches?.forEach((torch) => {
      if (torch.lit) lit.push(torch);
    });
    const fixed = all.filter(
      (light) =>
        !(light.kind === "tocha" || light.kind === "braseiro") ||
        this.zoneOf(light) !== "goblin" ||
        lit.some((t) => Math.hypot(t.x - light.x, t.y - light.y) <= TORCH_MATCH),
    );
    const moving: Light[] = [];
    const delta = this.game.loop.delta;
    room.state.players.forEach((player, id) => {
      moving.push({ x: player.x, y: player.y, radius: this.playerLightRadius(id, player, delta), look: PLAYER_LIGHT, phase: 0 });
    });
    room.state.exits?.forEach((exit) => {
      const phase = phaseAt(exit.x, exit.y);
      moving.push({ x: exit.x, y: exit.y, radius: EXIT_LIGHT_RADIUS, look: EXIT_LIGHT, phase, kind: "saida" });
    });
    return [...fixed, ...moving, ...(this.bolts?.lights() ?? []), ...(this.spellEffects?.lights() ?? []), ...(this.zoneFx?.lights() ?? [])];
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
    // Afastou-se do portal com a confirmação aberta: ela fecha.
    if (!atPortal && hud.portalOpen) hud.closePortal();
    hud.prompt(atPortal ? PORTAL_PROMPT : spot && !open ? INTERACTION_PROMPTS[spot] : undefined);
    if (!this.portalKey || !Phaser.Input.Keyboard.JustDown(this.portalKey)) return;
    // No portal: o primeiro E abre a confirmação; o segundo (ou o botão dela) entra.
    if (atPortal && hud.portalOpen) room.send("enterPortal");
    else if (atPortal) hud.openPortal();
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
      const inside = isBuildingId(here.name);
      this.lighting?.setLook(
        inside ? INTERIOR_AMBIENT : AMBIENT[this.place],
        inside ? INTERIOR_VIGNETTE_ALPHA : VIGNETTE_ALPHA[this.place],
      );
    }
    if (this.doorAskedAt !== undefined && (jumped || time - this.doorAskedAt > DOOR_TIMEOUT_MS)) {
      this.doorAskedAt = undefined;
      cam.fadeIn(DOOR_FADE_MS * 2, 0, 0, 0);
    }
  }

  private updateLabyrinth(room: Room<unknown, ServerState>, time: number) {
    if (!this.overlay || !this.telegraphs) return;
    if (this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) room.send("pickup");
    this.skillKeys.forEach((key, slot) => {
      if (Phaser.Input.Keyboard.JustDown(key)) this.castSkill(room, slot);
    });
    if (room.state.mobs) this.syncMobs(room, room.state.mobs, time);
    if (room.state.loot) syncSprites(room.state.loot, this.lootSprites, () => this.createLootSprite());
    this.collectSwings(room, time);
    this.bolts?.sync(room.state.projectiles, time, this.game.loop.delta);
    this.spellEffects?.sync(room.state.spells, time);
    this.stepInMud(room, time);
    this.updateZoneEffects(room, time);
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
    // Na cidade não há vida no estado: a máxima vem das mesmas regras (essências e equipamento).
    const maxHp = self.maxHp ?? playerStats(essences, equipmentOf(self) as Equipment).maxHp;
    hud.update(
      {
        name: self.name ?? "",
        classId: self.classId ?? "",
        equipment: equipmentOf(self),
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
        skills: skillsOf(self).map((id) => ({ id, cooldownMs: id ? self.skillCooldowns?.get(id) ?? 0 : 0 })),
        mana: self.mana,
        maxMana: self.maxMana,
        zone: this.place === "labyrinth" ? self.zone || undefined : undefined,
      },
      time,
    );
    if (this.place !== "labyrinth") return;
    const extractMs = self.extractMs ?? 0;
    hud.prompt(
      extractMs > 0 ? { title: "Extraindo…", subtitle: `${((EXTRACT_MS - extractMs) / 1000).toFixed(1)} s — fique no portal` } : this.torchPrompt,
    );
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

  // Zonas hostis no quadro: perigos do chão, olhos no breu, clima, sangue, tochas (arte, dica e [E]), escuro e
  // vinheta. A zona de quem joga vem do servidor; a dos outros, da mesma regra (zoneAt) pela posição.
  private updateZoneEffects(room: Room<unknown, ServerState>, time: number) {
    const fx = this.zoneFx;
    const self = room.state.players.get(room.sessionId);
    if (!fx || !self) return;
    const delta = this.game.loop.delta;
    const zone = (self.zone || undefined) as ZoneId | undefined;
    fx.syncHazards(room.state.hazards, time);
    const eyes: number[] = [];
    self.eyes?.forEach((v) => eyes.push(v));
    fx.drawEyes(Array.from({ length: Math.floor(eyes.length / 2) }, (_, i) => ({ x: eyes[2 * i] ?? 0, y: eyes[2 * i + 1] ?? 0 })), time);
    fx.weather(zone, this.cameras.main.worldView, time, delta);
    room.state.players.forEach((player) => {
      if (player.bleeding) fx.bleed(player, time, delta);
    });
    // Tochas: arte escura enquanto apagada; perto de uma apagada, a dica e o [E].
    const torches: [string, Vec2 & { lit: boolean }][] = [];
    room.state.torches?.forEach((torch, id) => torches.push([id, torch]));
    for (const art of this.torchArt) {
      const lit = torches.some(([, t]) => t.lit && Math.hypot(t.x - art.x, t.y - art.y) <= TORCH_MATCH);
      if (lit && art.image.isTinted) art.image.clearTint();
      if (!lit && !art.image.isTinted) art.image.setTint(UNLIT_TORCH_TINT);
    }
    const near = torchInReach(self, torches, TORCH.interactRadius);
    this.torchPrompt = near ? { key: "E", title: "Acender tocha", subtitle: "Luz para todos até o fim da run" } : undefined;
    if (near && this.torchKey && Phaser.Input.Keyboard.JustDown(this.torchKey)) room.send("lightTorch");
    // Breu e frio, com transição suave.
    const k = Math.min(1, delta / ZONE_FADE_MS);
    this.darkness += ((zone === "goblin" ? 1 : 0) - this.darkness) * k * 3;
    this.frost += ((zone === "lobo" ? 1 : 0) - this.frost) * k * 3;
    const ambient = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(AMBIENT.labyrinth),
      Phaser.Display.Color.ValueToColor(GOBLIN_AMBIENT),
      1,
      this.darkness,
    );
    this.lighting?.setLook(
      Phaser.Display.Color.GetColor(ambient.r, ambient.g, ambient.b),
      VIGNETTE_ALPHA.labyrinth + (FROST_VIGNETTE_ALPHA - VIGNETTE_ALPHA.labyrinth) * this.frost,
    );
    this.lighting?.setVignetteTint(this.frost > 0.05 ? FROST_TINT : 0xffffff);
  }

  // Em que zona hostil um ponto está (pelas áreas do mapa).
  private zoneOf(p: Vec2): ZoneId | undefined {
    return zoneAt(this.areas, AREAS, p);
  }

  // Luz de um jogador: no breu dos goblins encolhe (como no servidor), com a mesma transição suave.
  private playerLightRadius(id: string, at: Vec2, delta: number): number {
    const want = this.zoneOf(at) === "goblin" ? ZONE_EFFECTS.goblin.lightFactor : 1;
    const now = this.lightFactors.get(id) ?? want;
    const next = now + (want - now) * Math.min(1, (delta / ZONE_FADE_MS) * 3);
    this.lightFactors.set(id, next);
    return PLAYER_LIGHT_RADIUS * next;
  }

  // Tecla de habilidade: só o slot e o ponto do mouse vão para o servidor; ele decide o que está no slot, se pode
  // (recarga) e onde cai. Slot vazio: nada a pedir.
  private castSkill(room: Room<unknown, ServerState>, slot: number) {
    const self = room.state.players.get(room.sessionId);
    if (!self || !skillsOf(self)[slot]) return;
    const target = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    room.send("skill", { slot, x: target.x, y: target.y });
  }

  // Quem anda com os pés numa poça ativa solta lama (só desenho; a lentidão é do servidor).
  private stepInMud(room: Room<unknown, ServerState>, time: number) {
    const effects = this.spellEffects;
    const swamps = effects?.activeSwamps().map(swampArea) ?? [];
    if (!effects || swamps.length === 0) return;
    const delta = this.game.loop.delta;
    const step = (center: Vec2, half: number, lastMoveAt: number) => {
      if (time - lastMoveAt > 120 || !swamps.some((swamp) => feetInside(swamp, center, half, 0))) return;
      effects.mudStep({ x: center.x, y: center.y + half }, time, delta);
    };
    room.state.players.forEach((player, id) => {
      const avatar = this.avatars.get(id);
      if (avatar) step(player, PLAYER_SIZE / 2, avatar.lastMoveAt);
    });
    room.state.mobs?.forEach((mob, id) => {
      const sprite = this.mobSprites.get(id);
      if (sprite) step(mob, MOB_KINDS[mob.kind as MobKind].size / 2, sprite.lastMoveAt);
    });
  }

  // Só a direção do clique vai para o servidor; ele decide se o golpe saiu e quem foi atingido.
  // Com cajado, o clique não faz nada por enquanto (a Bola de Fogo é uma habilidade); o servidor também ignora.
  private sendAttack(pointer: Phaser.Input.Pointer) {
    const self = this.room?.state.players.get(this.room.sessionId);
    if (!this.room || !self || !pointer.leftButtonDown() || isStaff(self.equipment?.get("weapon"))) return;
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
      const avatar = this.avatars.get(sessionId);
      if (avatar) {
        avatar.swingAt = time;
        avatar.swingAngle = player.attackAngle ?? 0;
      }
      if (isStaff(player.equipment?.get("weapon"))) {
        if (avatar) avatar.castFlash = true;
        return;
      }
      const classId = player.classId ?? "";
      const seed = Math.floor(Math.random() * 1e9);
      const shape = swingShape(player.equipment?.get("weapon"));
      this.swings.push({ x: player.x, y: player.y, angle: player.attackAngle ?? 0, classId, startMs: time, seed, ...shape });
    });
    this.swings = this.swings.filter((swing) => time - swing.startMs < swingDuration(swing.classId));
  }

  private drawOverlay(room: Room<unknown, ServerState>, g: Phaser.GameObjects.Graphics, time: number) {
    g.clear();
    for (const swing of this.swings) drawSwing(g, swing, time);
    for (const avatar of this.avatars.values()) {
      const pose = weaponPose(avatar.swingAt, avatar.swingAngle, time);
      if (pose.visible && avatar.weapon.visible && !isStaff(avatar.weaponItem)) drawBladeTrail(g, avatar.weapon.x, avatar.weapon.y, avatar.swingAngle, pose, WEAPON_REACH * pose.scale);
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
  // No Tiled, x,y é o canto de baixo-esquerdo da imagem; a profundidade segue a base, como a dos jogadores, ou a linha
  // sortY do tile (prédios: a linha da porta, para os degraus e a soleira ficarem por baixo de quem está neles).
  private createMapObjects() {
    const data = (this.cache.tilemap.get(this.place) as { data?: TiledMap } | undefined)?.data;
    if (!data) return;
    if (this.place === "labyrinth") this.areas = parseAreas(data);
    const keys = new Map<number, string>();
    for (const tileset of data.tilesets) {
      for (const tile of tileset.tiles ?? []) if (tile.image) keys.set(tileset.firstgid + tile.id, imageKey(tile.image));
    }
    for (const layer of data.layers) {
      for (const object of layer.objects ?? []) {
        const key = object.gid === undefined ? undefined : keys.get(object.gid & GID_MASK);
        if (!key) continue;
        const image = this.add.image(object.x, object.y, key).setOrigin(0, 1).setDepth(sortDepth(objectSortLine(data, object)));
        if (object.width && object.height) image.setDisplaySize(object.width, object.height);
        const box = { left: object.x, top: object.y - image.displayHeight, right: object.x + image.displayWidth, bottom: object.y };
        this.culler.add(image, box);
        const name = key.slice(key.lastIndexOf("/") + 1);
        const middle = { x: object.x + image.displayWidth / 2, y: object.y - image.displayHeight / 2 };
        if ((name === "tocha" || name === "braseiro") && this.zoneOf(middle) === "goblin") this.torchArt.push({ image, ...middle });
        const shadow = this.place === "labyrinth" ? !FLAT_PROPS.has(name) && !BUILDING.test(name) : THIN_PROP.test(name);
        if (shadow) {
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
    // Magias: a bola de fogo e a lama em laço; o raio, uma vez.
    for (const [key, frameRate, repeat] of [[FIREBALL_KEY, FIREBALL_FPS, -1], [MUD_KEY, MUD_FPS, -1], [STRIKE_KEY, STRIKE_FPS, 0]] as const) {
      if (this.anims.exists(key) || !this.textures.exists(key)) continue;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, {}), frameRate, repeat });
    }
    for (const { key } of [...WALK_URLS, ...MOB_WALK_URLS]) {
      if (this.anims.exists(key)) continue;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, {}), frameRate: WALK_FPS, repeat: -1 });
    }
    // Golpe: a fita inteira uma vez, durante a janela em que o personagem olha para o golpe.
    for (const { key } of ATTACK_URLS) {
      if (this.anims.exists(key)) continue;
      const frames = this.anims.generateFrameNumbers(key, {});
      this.anims.create({ key, frames, frameRate: (frames.length * 1000) / ATTACK_FACING_MS, repeat: 0 });
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
      // Logo depois do golpe, olha para onde bateu (mesmo andando para outro lado).
      if (time - avatar.swingAt < ATTACK_FACING_MS) avatar.facing = facingFor(Math.cos(avatar.swingAngle), Math.sin(avatar.swingAngle));
      const feet = player.y + PLAYER_SIZE / 2;
      const isSelf = sessionId === room.sessionId;
      if (player.hp !== undefined) {
        if (avatar.lastHp !== undefined && player.hp !== avatar.lastHp) {
          this.onPlayerHp(room, player, avatar, player.hp - avatar.lastHp, isSelf, time);
        }
        avatar.lastHp = player.hp;
      }
      this.animateAvatar(avatar, player.classId, time - avatar.lastMoveAt < WALK_LINGER_MS, time - avatar.swingAt < ATTACK_FACING_MS);
      const recoil = recoilOffset(avatar.reaction, time);
      const lunge = lungeOffset(avatar.swingAt, avatar.swingAngle, time);
      const bodyX = player.x + recoil.x + lunge.x;
      const bodyY = feet + recoil.y + lunge.y;
      avatar.body.setPosition(bodyX, bodyY).setDepth(sortDepth(feet)).setScale(lunge.sx, lunge.sy);
      applyFlash(avatar.body, avatar.reaction, time, isSelf ? SELF_FLASH_COLOR : HIT_FLASH_COLOR);
      this.poseWeapon(avatar, player.classId, player.equipment?.get("weapon"), sortDepth(feet), time);
      this.poseArmor(avatar, player, sortDepth(feet));
      avatar.shadow.setPosition(player.x, feet - 1).setScale(stepSquash(avatar.body));
      avatar.label.setPosition(player.x, feet - AVATAR_HEIGHT - HP_BAR_GAP - HP_BAR_HEIGHT - 2);
    });
    for (const [sessionId, avatar] of this.avatars) {
      if (seen.has(sessionId)) continue;
      avatar.body.destroy();
      avatar.shadow.destroy();
      avatar.label.destroy();
      avatar.weapon.destroy();
      avatar.grip.destroy();
      for (const layer of avatar.armor.values()) layer.destroy();
      this.avatars.delete(sessionId);
    }
  }

  // Espada sempre na mão: o punho no socket do quadro que o sprite mostra agora (o sprite já com impulso, recuo e
  // compressão). Parado ou andando, em guarda (WEAPON_GUARD_DEGREES, respirando); no golpe, o braço estica até
  // WEAPON_ARM_EXTEND e a lâmina varre o arco (weaponPose). Atrás do corpo quando a mão está atrás; na frente, com o
  // punho do sprite redesenhado por cima do cabo (poseGrip), para a mão parecer fechada nele.
  // Desarmado: sem espada nem punho por cima (o golpe é um soco, só o impulso do corpo e o rastro da classe).
  // Cajado: a mesma guarda, segurando na faixa de couro (WEAPON_LOOKS); no disparo, em vez da varrida, ele inclina para
  // a mira e avança um pouco (staffPose), e sai o clarão na ponta do cristal.
  private poseWeapon(avatar: Avatar, classId: string | undefined, weapon: string | undefined, bodyDepth: number, time: number) {
    const key = `weapons/${weapon}`;
    avatar.weaponItem = weapon;
    if (!weapon || !this.textures.exists(key)) {
      avatar.weapon.setVisible(false);
      avatar.grip.setVisible(false);
      avatar.castFlash = false;
      return;
    }
    const look = WEAPON_LOOKS[weapon] ?? SWORD_LOOK;
    if (avatar.weapon.texture.key !== key) avatar.weapon.setTexture(key).setOrigin(look.origin.x, look.origin.y);
    const socket = this.handSocket(avatar, classId);
    const body = avatar.body;
    let x = body.x + socket.dx * body.scaleX;
    let y = body.y + socket.dy * body.scaleY;
    const guard = WEAPON_GUARD_BY_CLASS[classId ?? ""]?.[avatar.facing] ?? WEAPON_GUARD_DEGREES[avatar.facing] ?? -90;
    let angle = (guard * Math.PI) / 180 + this.guardSway(avatar, time);
    let scale = 1;
    if (isStaff(weapon)) {
      const cast = staffPose(avatar.swingAt, avatar.swingAngle, angle, time);
      if (cast.visible) {
        x += Math.cos(avatar.swingAngle) * cast.push;
        y += Math.sin(avatar.swingAngle) * cast.push;
        angle = cast.angle;
      }
    } else {
      const pose = weaponPose(avatar.swingAt, avatar.swingAngle, time);
      if (pose.visible) {
        const reach = WEAPON_ARM_EXTEND * Math.sin(Math.PI * pose.p);
        x += Math.cos(avatar.swingAngle) * reach;
        y += Math.sin(avatar.swingAngle) * reach;
        angle = pose.angle;
        scale = pose.scale;
      }
    }
    avatar.weapon
      .setVisible(true)
      .setPosition(x, y)
      .setRotation(angle - look.artAngle)
      .setScale(scale)
      .setDepth(bodyDepth + (socket.behindBody ? -0.05 : 0.05));
    this.poseGrip(avatar, socket, bodyDepth);
    if (avatar.castFlash) {
      avatar.castFlash = false;
      if (look.tip) {
        const tip = weaponPoint(avatar.weapon, look.tip);
        this.bolts?.flash(tip.x, tip.y, time);
      }
    }
  }

  // A armadura equipada veste o sprite: cada peça do corpo é uma camada no mesmo quadro, lugar, escala e cor do corpo,
  // logo acima dele (bota, calça, peitoral; o elmo está desligado, ver DRAWN_BODY_LAYERS) e abaixo da espada na frente e do punho. Sem a peça, ou sem a arte
  // dela para este quadro (golpe desenhado, no futuro), a camada some.
  private poseArmor(avatar: Avatar, player: PlayerView, bodyDepth: number) {
    const body = avatar.body;
    const name = body.texture.key.slice(body.texture.key.lastIndexOf("/") + 1);
    DRAWN_BODY_LAYERS.forEach((piece, i) => {
      const item = player.equipment?.get(piece);
      const look = item ? (ITEMS[item as ItemId] as ItemStats | undefined)?.equip?.look : undefined;
      const key = look ? `armor/${player.classId}/${look}/${piece}/${name}` : "";
      let layer = avatar.armor.get(piece);
      if (!look || !this.textures.exists(key)) {
        layer?.setVisible(false);
        return;
      }
      layer ??= this.add.image(body.x, body.y, key);
      avatar.armor.set(piece, layer);
      layer
        .setTexture(key, body.frame.name)
        .setVisible(true)
        .setOrigin(body.originX, body.originY)
        .setPosition(body.x, body.y)
        .setScale(body.scaleX, body.scaleY)
        .setDepth(bodyDepth + 0.01 * (i + 1));
      if (body.isTinted) layer.setTintFill(body.tintTopLeft);
      else if (layer.isTinted) layer.clearTint();
    });
  }

  // O punho por cima do cabo: cópia do sprite no mesmo quadro, lugar, escala e cor, recortada num quadrado em volta
  // da mão (coordenadas do quadro: pés em largura/2 e altura * origem y).
  private poseGrip(avatar: Avatar, socket: HandSocket, bodyDepth: number) {
    const { body, grip } = avatar;
    grip.setVisible(!socket.behindBody);
    if (socket.behindBody) return;
    const frame = body.frame;
    const outward = Math.sign(socket.dx) * GRIP_OUTWARD;
    const cx = frame.width / 2 + socket.dx + outward;
    const cy = frame.height * body.originY + socket.dy;
    const half = Math.floor(GRIP_SIZE / 2);
    grip
      .setTexture(body.texture.key, frame.name)
      .setOrigin(body.originX, body.originY)
      .setPosition(body.x, body.y)
      .setScale(body.scaleX, body.scaleY)
      .setCrop(cx - half, cy - half, GRIP_SIZE, GRIP_SIZE)
      .setDepth(bodyDepth + 0.1);
    if (body.isTinted) grip.setTintFill(body.tintTopLeft);
    else if (grip.isTinted) grip.clearTint();
  }

  // Balanço da guarda: andando, uma volta do seno por volta da fita de caminhada; parado, o relógio.
  private guardSway(avatar: Avatar, time: number): number {
    const anims = avatar.body.anims;
    if (anims.isPlaying && avatar.body.texture.key.includes("/walk-")) {
      return WEAPON_WALK_SWAY * Math.sin(2 * Math.PI * anims.getProgress());
    }
    return WEAPON_IDLE_SWAY * Math.sin((2 * Math.PI * time) / WEAPON_IDLE_SWAY_MS);
  }

  // O socket da mão no quadro que o sprite mostra: animação e direção pela textura ("characters/<classe>/walk-east"),
  // quadro pela animação tocando. Sem dado (classe nova), a mão do parado de frente.
  private handSocket(avatar: Avatar, classId: string | undefined): HandSocket {
    const key = avatar.body.texture.key;
    const name = key.slice(key.lastIndexOf("/") + 1);
    const [animation, direction] = name.startsWith("walk-")
      ? ["walk", name.slice("walk-".length)]
      : name.startsWith("attack-")
        ? ["attack", name.slice("attack-".length)]
        : ["idle", name];
    const frame = animation === "idle" ? 0 : (avatar.body.anims.currentFrame?.index ?? 1) - 1;
    const sockets = HAND_SOCKETS[classId ?? ""] ?? HAND_SOCKETS.mago;
    const frames = sockets?.[animation]?.[direction];
    const tracked = frames?.[Math.min(frame, frames.length - 1)];
    if (tracked) return tracked;
    const idle = sockets?.idle?.[direction]?.[0] ?? sockets?.idle?.south?.[0] ?? { dx: 0, dy: -20, behindBody: false };
    if (animation !== "walk") return idle;
    const bob = WALK_HAND_BOB[frame % WALK_HAND_BOB.length] ?? { x: 0, y: 0 };
    const flip = direction.includes("west") ? -1 : 1;
    return { dx: idle.dx + bob.x * flip, dy: idle.dy + bob.y, behindBody: idle.behindBody };
  }

  // Golpe (se a classe tiver a fita attack-<direção>): toca o golpe uma vez.
  // Andando: toca a caminhada da direção (trocar de direção no meio do passo continua do mesmo quadro).
  // Parado: sprite parado da última direção.
  private animateAvatar(avatar: Avatar, classId: string | undefined, walking: boolean, attacking: boolean) {
    const body = avatar.body;
    const attack = characterKey(classId, `attack-${avatar.facing}`);
    if (attacking && this.anims.exists(attack)) {
      if (body.anims.currentAnim?.key !== attack) body.setOrigin(0.5, WALK_FEET).play(attack);
      return;
    }
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
    const weapon = this.add.image(player.x, feet, WEAPON_KEY).setOrigin(WEAPON_ORIGIN.x, WEAPON_ORIGIN.y).setVisible(false);
    const grip = this.add.image(player.x, feet, body.texture.key).setVisible(false);
    return {
      body,
      shadow,
      label,
      facing: "south",
      lastX: player.x,
      lastY: player.y,
      lastMoveAt: -Infinity,
      reaction,
      weapon,
      grip,
      armor: new Map(),
      swingAt: -Infinity,
      swingAngle: 0,
      castFlash: false,
      pendingHp: 0,
    };
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
        sprite = {
          body,
          shadow,
          facing: "south",
          lastX: mob.x,
          lastY: mob.y,
          lastMoveAt: -Infinity,
          reaction,
          lastHp: mob.hp,
          lastWindup: mob.windup,
          lungeAt: -Infinity,
          lungeAngle: 0,
        };
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
      // O golpe saiu (windup acabou): bote na direção do golpe.
      if (sprite.lastWindup && !mob.windup) {
        sprite.lungeAt = time;
        sprite.lungeAngle = mob.attackAngle;
      }
      sprite.lastWindup = mob.windup;
      const recoil = recoilOffset(sprite.reaction, time);
      const lunge = mobLungeOffset(sprite.lungeAt, sprite.lungeAngle, time);
      sprite.body.setPosition(mob.x + recoil.x + lunge.x, feet + recoil.y + lunge.y).setDepth(sortDepth(feet));
      applyFlash(sprite.body, sprite.reaction, time, HIT_FLASH_COLOR);
      // Slime parado respira (vida em repouso); lobo em frenesi fica vermelho (o flash do golpe vence).
      if (kind === "slime" && !walking) {
        const beat = Math.sin(time / 380 + mob.x * 0.01);
        sprite.body.setScale(1 + 0.05 * beat, 1 - 0.04 * beat);
      } else if (sprite.body.scaleX !== 1) sprite.body.setScale(1);
      if (mob.frenzy && time >= sprite.reaction.flashUntil) sprite.body.setTint(FRENZY_TINT);
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
    // Dano e cura aos pedaços (fome, lodo ácido, sangramento, regeneração: frações por tick) se somam e só aparecem a
    // cada ponto inteiro; o flash e o recuo ficam para os golpes (1 ponto ou mais de uma vez).
    avatar.pendingHp += change;
    const whole = Math.trunc(avatar.pendingHp);
    if (whole !== 0) {
      avatar.pendingHp -= whole;
      if (whole > 0 && isSelf) this.popNumber(player.x, top, `+${whole}`, "heal");
      if (whole < 0) this.popNumber(player.x, top, `${-whole}`, isSelf ? "taken" : "dealt");
    }
    if (change > -1) return;
    const damage = -change;
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
    return this.swings.some(
      (swing) => time - swing.startMs < RECENT_SWING_MS && Math.hypot(swing.x - x, swing.y - y) <= swing.radius + TILE_HALF,
    );
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

const HAZARD_DEATHS: Record<HazardKind, string> = {
  acid: "Dissolvido no lodo ácido dos slimes.",
  crystal: "Fulminado pela descarga de um cristal.",
  shards: "Retalhado pelos estilhaços de cristal.",
  bleed: "Sangrou até a morte.",
};

function describeDeath(cause: DeathCause): string {
  if (cause.kind === "starvation") return "Morreu de fome.";
  if (cause.kind === "mob") return `Morto por ${MOB_NAMES[cause.mob]}.`;
  if (cause.kind === "hazard") return HAZARD_DEATHS[cause.hazard];
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

// O equipamento de um jogador como o HUD e a janela de inventário usam: slot -> id de item.
function equipmentOf(player: PlayerView): Partial<Record<EquipSlot, string>> {
  const equipment: Partial<Record<EquipSlot, string>> = {};
  player.equipment?.forEach((item, slot) => (equipment[slot as EquipSlot] = item));
  return equipment;
}
