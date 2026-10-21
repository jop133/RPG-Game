import { StateView } from "@colyseus/schema";
import { CloseCode, Room, type Client } from "colyseus";
import {
  ATTACK_LOCK_MS,
  DEV_TEST_DROPS,
  GROUND_DROPS,
  allWithin,
  dropUnits,
  hitDamage,
  lifesteal,
  placeDrops,
  FLANK,
  GNOME_CASTER,
  GOBLIN_THROW,
  SLIME_LEAP,
  SLIME_SPLIT,
  SPELL_FLATTEN,
  WOLF_POUNCE,
  crystalArea,
  type MobEvent,
  type MobTimers,
  type ProjectileSpec,
  AREAS,
  ARENA_AREAS,
  CLASS_NAMES,
  DEV,
  DEV_ZONES,
  IRON_GEAR,
  TRAINING_DUMMY,
  areaAt,
  boxFits,
  devGive,
  dropForeignGear,
  emptyInventory,
  mobStats,
  parseDevCommand,
  spawnSpots,
  startingSkills,
  teleportRoom,
  DEV_TELEPORTS,
  type ClassId,
  type DevGear,
  type DevTeleport,
  type SpawnKind,
  EXIT_CHANNEL,
  EXIT_IDLE_LIGHT_RADIUS,
  EXIT_LIGHT_RADIUS,
  EXITS_ACTIVE,
  LABYRINTH_REGEN_FACTOR,
  STAGGER,
  VIEW_HYSTERESIS,
  VIEW_RADIUS,
  alarm,
  alarmedMobs,
  exitIndexAt,
  lightReaches,
  stepChannel,
  MOB_SPAWN_SAFE_RADIUS,
  ACID,
  BLEED,
  CRYSTAL_PULSE,
  FRENZY,
  HUNGER_MAX,
  INVENTORY_SLOTS,
  MAX_CHASERS,
  PACK_RESPAWN,
  SHARDS,
  TORCH,
  ZONE_KIND,
  crystalPulse,
  excessChasers,
  goblinEyes,
  idlePlanFor,
  inAcid,
  knockback,
  planPacks,
  scatterShards,
  shardUnderfoot,
  tickBleed,
  tickMana,
  torchInReach,
  wolfFrenzy,
  zoneAt,
  zoneDamage,
  zoneHeal,
  zoneHungerFactor,
  zoneLightRadius,
  type IdlePlan,
  type MobPost,
  type ZoneId,
  LIGHTNING_SPELL,
  MAGIC_BOLT,
  SWAMP_SPELL,
  MOB_KINDS,
  NO_INPUT,
  PICKUP_RADIUS,
  PLAYER_SIZE,
  PLAYER_SPEED,
  TICK_RATE,
  applyDamage,
  attackCooldownMs,
  damageTaken,
  equipmentToPile,
  isInArc,
  isInSwing,
  inventoryToPile,
  isLit,
  isOffCooldown,
  feetInside,
  lightningArea,
  parseSkillCast,
  parseSkillEquip,
  equipSkill,
  CLASS_SKILLS,
  FIREBALL_SKILL,
  SKILLS,
  spellTarget,
  swampArea,
  swampSlow,
  launchProjectile,
  levelForXp,
  mobStrikeArc,
  moveWithCollision,
  movementDelta,
  nearestWithin,
  parseAttackAngle,
  parseMoveInput,
  parseSlotIndex,
  playerStats,
  pickActiveExits,
  pickSpawnPoint,
  regenerate,
  planMobSpawns,
  provoke,
  rollDrops,
  startIdle,
  staticLitMap,
  starvationDamage,
  isDormant,
  safeSpawnCells,
  stepMob,
  stepProjectile,
  takeFromPile,
  tickHunger,
  useSlot,
  type Area,
  type DamageType,
  type DeathCause,
  type HazardKind,
  type Equipment,
  type ExtractionResult,
  type FirstKillMessage,
  type Inventory,
  type ItemId,
  type ItemStack,
  type LightCarrier,
  type LitMap,
  type LightSource,
  type PlayerStats,
  type Projectile,
  type ProjectileStep,
  type ProjectileTarget,
  type SpellKind,
  type SkillId,
  type EquippedSkills,
  type GroundEllipse,
  type MobKind,
  type MobMind,
  type MobTarget,
  type MoveInput,
  type Vec2,
} from "shared";
import type { CharacterRecord } from "./db";
import { applyGearAction, isEquippableSlot, type GearAction } from "./gear";
import { DEV_TOOLS } from "./devTools";
import { loadLevel, type Level } from "./level";
import { admit, release } from "./presence";
import {
  ExitState,
  GameState,
  ItemSlotState,
  LootState,
  MobState,
  OWNER_TAG,
  PlayerState,
  ProjectileState,
  SpellState,
  TorchState,
  HazardState,
  mirrorEquipment,
  mirrorSkills,
} from "./state";
import { store } from "./store";
import { updateVisibility } from "./views";

// Ticks que um projétil parado continua no estado (ver spentBolts): 3 ticks = 150 ms, três patches.
const SPENT_BOLT_TICKS = 3;

const LABYRINTH = loadLevel(new URL("../../assets/maps/dungeon_floor1.json", import.meta.url), AREAS, { quadrants: true });
// A Sala de Testes (DEV_TOOLS=1) só é lida quando a primeira sala dela abre.
let arena: Level | undefined;
export function arenaLevel(): Level {
  return (arena ??= loadLevel(new URL("../../assets/maps/test_arena.json", import.meta.url), ARENA_AREAS));
}

// A ação de um mob, para o cliente escolher a animação (ver MobState.action).
function actionOf(mind: MobMind): string {
  if (mind.mode === "windup") return "attack";
  if (mind.mode !== "ability") return "";
  if (mind.ability === "pounce") return `pounce-${mind.phase}`;
  if (mind.ability === "bolt" || mind.ability === "crystal") return "cast";
  return mind.ability;
}

// Ferramentas de dev: o destino pedido ao entrar na sala (options.devTarget), se for um destino válido.
function devTargetOf(options: unknown): DevTeleport | undefined {
  const raw = typeof options === "object" && options !== null ? (options as { devTarget?: unknown }).devTarget : undefined;
  return typeof raw === "string" && (DEV_TELEPORTS as readonly string[]).includes(raw) ? (raw as DevTeleport) : undefined;
}

// O que o servidor precisa saber de um mob para movê-lo, e que o cliente não precisa ver. post e pack: só os mobs de
// grupo (spawns táticos das zonas): o posto e de qual grupo é.
// ai: false = parado (spawn de dev com a IA desligada, e o Boneco de Treino); dummy: o Boneco de Treino (não morre).
// timers: recargas dos ataques especiais. flank: o ângulo do cerco (FLANK). mini: Mini-Slime. dyingMs: explodindo
// (slime), quanto falta; killer: quem matou (os minis nascem caçando ele).
interface MobBrain {
  kind: SpawnKind;
  ai?: boolean;
  dummy?: boolean;
  timers?: MobTimers;
  flank?: number;
  mini?: boolean;
  dyingMs?: number;
  killer?: string;
  area: Area;
  homeCells: Vec2[];
  mind: MobMind;
  post?: MobPost;
  pack?: string;
}

// Um grupo tático: onde nasce, quem está vivo dele e, morto o grupo inteiro, desde quando (para o respawn).
interface Pack {
  kind: MobKind;
  area: Area;
  homeCells: Vec2[];
  home: Vec2;
  members: Vec2[];
  plan: IdlePlan;
  alive: Set<string>;
  deadSinceMs?: number;
}

// Ticks entre duas checagens de respawn dos grupos (não precisa ser a cada tick).
const RESPAWN_CHECK_TICKS = 20;

// Projétil Mágico em voo, do lado do servidor: o voo (shared/src/projectile.ts), quem atirou (o mob atingido vai atrás
// dele; jogador e mob não acertam quem atirou) e o Dano Mágico de quem atirou no instante do disparo.
// hostile: de um mob (acerta só jogadores, com o tipo do mob como causa da morte); spec: velocidade, alcance e tamanho.
interface Bolt {
  flight: Projectile;
  owner: string;
  damage: number;
  spec: ProjectileSpec;
  hostile?: { mob: MobKind; type: DamageType };
}

// Magia no chão, do lado do servidor: quem lançou, a fase e quanto falta dela, e o dano do raio (fixado no lançamento).
interface CastSpell {
  kind: SpellKind;
  owner: string;
  phase: "warn" | "strike" | "cast" | "active";
  remainingMs: number;
  damage: number;
  // De um mob (a Erupção de Cristal do gnomo): acerta só jogadores.
  hostile?: boolean;
}

// Projéteis dos mobs: a adaga do goblin e o projétil do gnomo (balance.ts).
const MOB_BOLTS: Record<"dagger" | "gnome", { spec: ProjectileSpec; damage: number; mob: MobKind; type: DamageType }> = {
  dagger: { spec: { speed: GOBLIN_THROW.speed, range: GOBLIN_THROW.range, radius: GOBLIN_THROW.radius, spawnOffset: 12 }, damage: GOBLIN_THROW.damage, mob: "goblin", type: "physical" },
  gnome: { spec: { speed: GNOME_CASTER.boltSpeed, range: GNOME_CASTER.boltRange, radius: GNOME_CASTER.boltRadius, spawnOffset: 12 }, damage: GNOME_CASTER.boltDamage, mob: "gnomo", type: "magic" },
};
// Cerco: os ângulos dos mobs, um de cada vez (o grupo abre em volta).
const FLANK_ANGLES = [0, FLANK.degrees, -FLANK.degrees].map((d) => (d * Math.PI) / 180);


export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  state = new GameState();

  // Fora do state de propósito: teclas apertadas não são replicadas para os outros jogadores.
  private moveInputs = new Map<string, MoveInput>();
  private lastAttackMs = new Map<string, number>();
  // Quando cada um levou dano pela última vez (a Regeneração espera REGEN_DELAY_MS depois disso).
  private lastHurtMs = new Map<string, number>();
  // A verdade do inventário. PlayerState.inventory só espelha isto para o dono ver.
  private inventories = new Map<string, Inventory>();
  // O que cada um tem equipado (a arma decide o golpe). PlayerState.equipment espelha, para todos verem a arma e a
  // armadura.
  private equipment = new Map<string, Equipment>();
  // Conteúdo das pilhas no chão, por id. O cliente só recebe a posição (LootState).
  private lootPiles = new Map<string, ItemStack[]>();
  private nextLootId = 1;
  // Portais ativos desta run (sorteados uma vez) e contagem de extração de cada jogador.
  private activeExits: Vec2[] = [];
  // Luz fixa desta run: luzes do mapa e saídas ativas (regra 4). Calculada ao abrir as saídas.
  private lit: LitMap = staticLitMap([], 0, 0, 1);
  // Canalização de portal em curso, por jogador: qual saída, onde ele estava (andar interrompe), quando começou (dano
  // depois disso interrompe) e quanto já foi. E até quando cada saída aberta fica aberta.
  private channels = new Map<string, { exitId: string; at: Vec2; startedAt: number; elapsedMs: number }>();
  private exitOpenUntil = new Map<string, number>();
  // Stagger: até quando cada um anda mais devagar depois de levar golpe de mob. Anti-kiting: depois de golpear. Bote do
  // lobo: depois de levar o impacto.
  private staggerUntil = new Map<string, number>();
  private attackLockUntil = new Map<string, number>();
  // Itens que acabaram de cair: até quando o cliente desenha o pulo (LootState.fresh).
  private freshLoot = new Map<string, number>();
  private pounceSlowUntil = new Map<string, number>();
  // Quem é cada sessão no banco.
  private characters = new Map<string, CharacterRecord>();
  // Essências absorvidas e os status que resultam delas e da arma (velocidade, dano, vida máxima, golpe).
  private essences = new Map<string, ItemId[]>();
  private stats = new Map<string, PlayerStats>();
  private mobBrains = new Map<string, MobBrain>();
  private nextMobId = 1;
  // Grupos táticos, por id, e há quantos ticks o respawn foi checado.
  private packs = new Map<string, Pack>();
  private ticksSinceRespawnCheck = 0;
  // Zonas hostis: em que zona cada um está; sangramento que falta (ms); poças ácidas (as do mapa e as dos slimes mortos,
  // estas com o fim em ms); tochas acesas; as descargas dos cristais (o atraso de cada um) e o relógio do último tick.
  private zones = new Map<string, ZoneId | undefined>();
  private bleedMs = new Map<string, number>();
  private tempAcid = new Map<string, number>();
  private nextHazardId = 1;
  private pulses: { id: string; at: Vec2; offsetMs: number }[] = [];
  private lastTickMs = 0;
  // Projéteis em voo, por id. ProjectileState só leva posição e ângulo ao cliente.
  private bolts = new Map<string, Bolt>();
  private nextBoltId = 1;
  // Projéteis que pararam (done, no ponto do impacto) e quantos ticks ainda ficam no estado: o bastante para irem num
  // patch para quem vê, mesmo o que acerta na hora do disparo (fora do tick).
  private spentBolts = new Map<string, number>();
  // Magias no chão, por id (SpellState leva tipo, lugar e fase ao cliente), e quando cada um lançou cada magia.
  private spells = new Map<string, CastSpell>();
  private nextSpellId = 1;
  private lastSpellMs = new Map<string, Partial<Record<SkillId, number>>>();
  // Habilidades equipadas de cada um (Q e R). PlayerState.skills espelha para o dono.
  private skills = new Map<string, EquippedSkills>();
  // Mortes do tick (ou do golpe) atual. Resolvidas depois dos laços, para não remover jogador no meio de um forEach.
  private deaths = new Map<string, DeathCause>();
  // O mapa desta sala: o labirinto (na SandboxRoom, a Sala de Testes) e se ela é a Sala de Testes (ninguém morre).
  protected level: Level = LABYRINTH;
  protected sandbox = false;
  // Ferramentas de dev (DEV_TOOLS=1): quem está imortal (God Mode), a zona forçada de cada um, se a IA dos mobs da sala
  // está ligada, os perigos que o dev pôs no chão (saem com force_zone_effect "none") e o meio de cada zona (teleporte).
  private godMode = new Set<string>();
  private forcedZones = new Map<string, ZoneId>();
  private mobAiOn = true;
  private devHazards = new Set<string>();
  private zoneCenters = new Map<ZoneId, Vec2>();
  // Jogadores com a conexão caída: o personagem continua no mundo esperando eles voltarem.
  private reconnections = new Map<string, ReturnType<Room["allowReconnection"]>>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.onMessage("attack", (client, message) => this.handleAttack(client.sessionId, message));
    this.onMessage("skill", (client, message) => this.handleSkill(client.sessionId, message));
    this.onMessage("equipSkill", (client, message) => this.handleEquipSkill(client.sessionId, message));
    this.onMessage("use", (client, message) => this.handleUse(client.sessionId, message));
    for (const action of ["move", "equip", "unequip"] as const) {
      this.onMessage(action, (client, message) => this.handleGear(client.sessionId, action, message));
    }
    this.onMessage("pickup", (client) => this.handlePickup(client.sessionId));
    this.onMessage("lightTorch", (client) => this.handleLightTorch(client.sessionId));
    this.onMessage("channelExit", (client) => this.handleChannel(client.sessionId));
    if (DEV_TOOLS) this.onMessage("dev_command", (client, message) => this.handleDev(client.sessionId, message));
    if (DEV_TOOLS) this.onMessage("dev_hello", (client) => client.send("dev_tools", { room: this.roomKind() }));
    this.spawnMobs();
    this.openExits();
    this.placeHazards();
    if (this.sandbox) this.spawnTrainingDummy();
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onAuth(_client: Client, options: unknown): CharacterRecord {
    return admit(options);
  }

  onJoin(client: Client, options?: unknown) {
    const record = client.auth as CharacterRecord;
    this.characters.set(client.sessionId, record);
    const xp = store.xp(record.characterId);
    const essences = store.essences(record.characterId);
    const equipment = store.equipment(record.characterId, record.classId);
    const stats = playerStats(essences, equipment);
    this.essences.set(client.sessionId, essences);
    this.equipment.set(client.sessionId, equipment);
    this.stats.set(client.sessionId, stats);
    const player = new PlayerState({
      name: record.name,
      classId: record.classId ?? "",
      ...this.entryPoint(),
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      attackSeq: 0,
      castSeq: 0,
      attackAngle: 0,
      mana: stats.maxMana,
      maxMana: stats.maxMana,
      zone: "",
      bleeding: false,
      hunger: HUNGER_MAX,
      channelMs: 0,
      xp,
      level: levelForXp(xp),
      coins: store.coins(record.lineageId),
    });
    for (let i = 0; i < INVENTORY_SLOTS; i++) player.inventory.push(new ItemSlotState({ item: "", count: 0 }));
    for (const essence of essences) player.essences.push(essence);
    mirrorEquipment(player.equipment, equipment);
    const skills = store.skills(record.characterId, record.classId);
    this.skills.set(client.sessionId, skills);
    mirrorSkills(player.skills, skills);
    // O que o personagem trouxe da cidade (ou o kit inicial, se for novo).
    this.setInventory(client.sessionId, player, store.inventory(record.characterId));
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, NO_INPUT);
    client.view = new StateView();
    // Com OWNER_TAG: o próprio jogador recebe também os campos privados (a fome).
    client.view.add(player, OWNER_TAG);
    // Ferramentas de dev: avisa o cliente (o painel F2 só abre com elas) e leva ao destino pedido na entrada.
    if (!DEV_TOOLS) return;
    client.send("dev_tools", { room: this.roomKind() });
    const target = devTargetOf(options);
    if (target) this.devTeleport(client.sessionId, target);
  }

  // Queda de conexão (não intencional): o personagem fica parado no mundo, vulnerável, e a fome continua (regra 6).
  // Sem prazo: sem comida, a fome mata o personagem em poucos minutos, e a morte cancela a espera.
  onDrop(client: Client) {
    this.moveInputs.set(client.sessionId, NO_INPUT);
    const reconnection = this.allowReconnection(client, "manual");
    this.reconnections.set(client.sessionId, reconnection);
    const forget = () => this.reconnections.delete(client.sessionId);
    reconnection.then(forget, forget);
  }

  onLeave(client: Client) {
    this.removePlayer(client.sessionId);
  }

  private removePlayer(sessionId: string) {
    this.state.players.delete(sessionId);
    this.moveInputs.delete(sessionId);
    this.lastAttackMs.delete(sessionId);
    this.lastHurtMs.delete(sessionId);
    this.lastSpellMs.delete(sessionId);
    this.skills.delete(sessionId);
    this.zones.delete(sessionId);
    this.bleedMs.delete(sessionId);
    this.inventories.delete(sessionId);
    this.equipment.delete(sessionId);
    this.staggerUntil.delete(sessionId);
    this.attackLockUntil.delete(sessionId);
    this.pounceSlowUntil.delete(sessionId);
    this.godMode.delete(sessionId);
    this.forcedZones.delete(sessionId);
    if (this.channels.has(sessionId)) this.endChannel(sessionId);
    const record = this.characters.get(sessionId);
    if (record) release(record);
    this.characters.delete(sessionId);
    this.essences.delete(sessionId);
    this.stats.delete(sessionId);
  }

  private openExits() {
    this.activeExits = pickActiveExits(this.level.exitCandidates, EXITS_ACTIVE, Math.random);
    this.activeExits.forEach((exit, i) => this.state.exits.set(`exit-${i + 1}`, new ExitState({ ...exit, phase: "idle", openMs: 0 })));
    this.rebuildLitMap();
  }

  // [E] dentro de um portal inativo: começa a canalização (EXIT_CHANNEL) e dá o alarme: os mobs perto correm para lá.
  // Andando, não começa (parar é parte do custo). Um portal canalizando ou aberto não aceita outra.
  private handleChannel(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.channels.has(sessionId)) return;
    const index = exitIndexAt(player, this.activeExits);
    const exitId = `exit-${index + 1}`;
    const exit = this.state.exits.get(exitId);
    if (index < 0 || !exit || exit.phase !== "idle") return;
    const input = this.moveInputs.get(sessionId) ?? NO_INPUT;
    if (input.up || input.down || input.left || input.right) {
      this.notify(sessionId, "Pare de andar para canalizar o portal.");
      return;
    }
    this.channels.set(sessionId, { exitId, at: { x: player.x, y: player.y }, startedAt: this.clock.currentTime, elapsedMs: 0 });
    exit.phase = "channel";
    const mobs: [string, MobState][] = [];
    this.state.mobs.forEach((mob, id) => mobs.push([id, mob]));
    for (const id of alarmedMobs(exit, mobs)) {
      const brain = this.mobBrains.get(id);
      if (brain) brain.mind = alarm(brain.mind, sessionId, exit);
    }
    this.notify(sessionId, "O portal desperta... e o labirinto ouviu. Não se mexa!");
    this.rebuildLitMap();
  }

  // Cada tick: canalizações (parado e sem dano somam; senão, interrompe) e portais abertos (quem está dentro extrai na
  // hora; vencido o tempo, o portal fecha). Só conta para quem está conectado: um corpo largado não extrai sozinho.
  private updateExits(dtMs: number) {
    const now = this.clock.currentTime;
    for (const [sessionId, channel] of this.channels) {
      const player = this.state.players.get(sessionId);
      if (!player || !this.clients.getById(sessionId)) {
        this.endChannel(sessionId);
        continue;
      }
      const input = this.moveInputs.get(sessionId) ?? NO_INPUT;
      const moved = input.up || input.down || input.left || input.right || Math.hypot(player.x - channel.at.x, player.y - channel.at.y) > 1;
      const hurt = (this.lastHurtMs.get(sessionId) ?? -Infinity) >= channel.startedAt;
      const step = stepChannel(channel.elapsedMs, moved || hurt, dtMs);
      if (step.interrupted) {
        this.endChannel(sessionId);
        this.notify(sessionId, hurt ? "Canalização interrompida: você foi ferido!" : "Canalização interrompida: você se mexeu.");
        continue;
      }
      channel.elapsedMs = step.elapsedMs;
      player.channelMs = step.elapsedMs;
      if (step.done) this.openExit(sessionId, channel.exitId, now);
    }
    const leaving = new Set<string>();
    for (const [exitId, until] of this.exitOpenUntil) {
      const exit = this.state.exits.get(exitId);
      if (!exit) continue;
      if (now >= until) {
        exit.phase = "idle";
        exit.openMs = 0;
        this.exitOpenUntil.delete(exitId);
        this.rebuildLitMap();
        continue;
      }
      const openMs = Math.ceil((until - now) / 100) * 100;
      if (exit.openMs !== openMs) exit.openMs = openMs;
      this.state.players.forEach((player, sessionId) => {
        if (this.clients.getById(sessionId) && exitIndexAt(player, [exit]) === 0) leaving.add(sessionId);
      });
    }
    for (const sessionId of leaving) this.extractPlayer(sessionId);
  }

  // Canalização completa: o portal abre para o grupo por EXIT_CHANNEL.openMs.
  private openExit(sessionId: string, exitId: string, now: number) {
    this.channels.delete(sessionId);
    const player = this.state.players.get(sessionId);
    if (player) player.channelMs = 0;
    const exit = this.state.exits.get(exitId);
    if (!exit) return;
    exit.phase = "open";
    exit.openMs = EXIT_CHANNEL.openMs;
    this.exitOpenUntil.set(exitId, now + EXIT_CHANNEL.openMs);
    this.broadcast("notice", { text: `Um portal se abriu! ${EXIT_CHANNEL.openMs / 1000} s para extrair.` });
    this.rebuildLitMap();
  }

  // Fim da canalização sem abrir (interrompida, ou quem canalizava saiu): o portal volta a inativo.
  private endChannel(sessionId: string) {
    const channel = this.channels.get(sessionId);
    this.channels.delete(sessionId);
    const player = this.state.players.get(sessionId);
    if (player) player.channelMs = 0;
    const exit = channel && this.state.exits.get(channel.exitId);
    if (exit?.phase !== "channel") return;
    exit.phase = "idle";
    this.rebuildLitMap();
  }

  private notify(sessionId: string, text: string) {
    this.clients.getById(sessionId)?.send("notice", { text });
  }

  // Extraiu: sai da sala levando tudo o que carregava, que fica gravado no personagem. Ninguém deixa pilha ao extrair.
  // Só aqui o inventário e o equipamento vão para o banco: se o servidor cair no meio da run, ela "não aconteceu".
  private extractPlayer(sessionId: string) {
    const client = this.clients.getById(sessionId);
    const inventory = this.inventories.get(sessionId);
    const equipment = this.equipment.get(sessionId);
    const result: ExtractionResult = { items: inventory ? inventoryToPile(inventory) : [] };
    const record = this.characters.get(sessionId);
    if (record && inventory && equipment) store.saveGear(record.characterId, inventory, equipment);
    client?.send("extracted", result);
    this.removePlayer(sessionId);
    client?.leave(CloseCode.CONSENTED);
  }

  private setInventory(sessionId: string, player: PlayerState, inventory: Inventory) {
    this.inventories.set(sessionId, inventory);
    inventory.forEach((slot, i) => {
      const view = player.inventory[i];
      if (!view) return;
      view.item = slot?.item ?? "";
      view.count = slot?.count ?? 0;
    });
  }

  // Arrastar na mochila, equipar e desequipar, a qualquer momento da run. Nada vai para o banco aqui (só na extração).
  // Trocar de arma muda o golpe na hora; uma peça com Vida a mais sobe a vida atual junto (tirar, desce até a nova
  // máxima), como as essências.
  private handleGear(sessionId: string, action: GearAction, message: unknown) {
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    const equipment = this.equipment.get(sessionId);
    if (!player || !inventory || !equipment) return;
    const classId = this.characters.get(sessionId)?.classId;
    const result = applyGearAction(action, message, { inventory, equipment }, classId);
    if (result.kind === "refused") this.clients.getById(sessionId)?.send("notice", { text: result.notice });
    if (result.kind !== "changed") return;
    this.applyGear(sessionId, player, result.gear);
  }

  // Mochila e equipamento novos: espelha e recalcula os status (vida máxima a mais sobe a vida atual junto).
  private applyGear(sessionId: string, player: PlayerState, gear: DevGear) {
    this.setInventory(sessionId, player, gear.inventory);
    this.equipment.set(sessionId, gear.equipment);
    mirrorEquipment(player.equipment, gear.equipment);
    const before = this.statsOf(sessionId);
    const after = playerStats(this.essences.get(sessionId) ?? [], gear.equipment);
    this.stats.set(sessionId, after);
    player.maxHp = after.maxHp;
    player.hp = Math.max(1, Math.min(after.maxHp, player.hp + (after.maxHp - before.maxHp)));
  }

  // O jogador escolhe o slot (tecla do número). O servidor confere o que há nele e aplica o efeito.
  // Item equipável: usar é equipar.
  private handleUse(sessionId: string, message: unknown) {
    const slot = parseSlotIndex(message);
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    if (slot === undefined || !player || !inventory) return;
    if (isEquippableSlot(inventory, message)) {
      this.handleGear(sessionId, "equip", message);
      return;
    }
    const essences = this.essences.get(sessionId) ?? [];
    const outcome = useSlot(inventory, slot, { hunger: player.hunger, essences, essenceSlots: player.level });
    if (outcome.kind === "noEssenceSlot") {
      const text = `Sem slot de essência livre (nível ${player.level} = ${player.level} slots).`;
      this.clients.getById(sessionId)?.send("notice", { text });
      return;
    }
    if (outcome.kind !== "used") return;
    player.hunger = outcome.hunger;
    this.setInventory(sessionId, player, outcome.inventory);
    if (outcome.essences.length !== essences.length) this.equipEssences(sessionId, player, outcome.essences);
  }

  // Essência consumida: grava no banco e recalcula os status. Vida máxima a mais sobe a vida atual junto.
  private equipEssences(sessionId: string, player: PlayerState, essences: ItemId[]) {
    const record = this.characters.get(sessionId);
    if (record) store.setEssences(record.characterId, essences);
    const before = this.stats.get(sessionId) ?? playerStats([]);
    const after = playerStats(essences, this.equipment.get(sessionId));
    this.essences.set(sessionId, essences);
    this.stats.set(sessionId, after);
    player.essences.push(essences[essences.length - 1] as ItemId);
    player.maxHp = after.maxHp;
    player.hp = Math.min(after.maxHp, player.hp + (after.maxHp - before.maxHp));
  }

  // Toda perda de vida de jogador passa por aqui, para a morte nunca ser esquecida em algum caminho. A Defesa (físico)
  // ou a Resistência Mágica (mágico) de quem leva reduzem o dano; a fome é dano verdadeiro.
  private damagePlayer(sessionId: string, player: PlayerState, amount: number, cause: DeathCause, type: DamageType) {
    if (player.hp === 0) return;
    // Na zona dos gnomos, todo dano recebido vale mais (Ressonância Fragilizadora).
    const taken = zoneDamage(damageTaken(amount, type, this.statsOf(sessionId)), this.zones.get(sessionId));
    this.lastHurtMs.set(sessionId, this.clock.currentTime);
    // Sala de Testes e God Mode: a vida para em 1 (o dano ainda aparece e ainda interrompe a canalização).
    const next = applyDamage(player.hp, taken);
    player.hp = (this.sandbox || this.godMode.has(sessionId)) && next < 1 ? Math.min(player.hp, 1) : next;
    if (player.hp === 0) this.deaths.set(sessionId, cause);
  }

  // Morte definitiva: avisa o jogador com a causa, tira o personagem da sala e desconecta.
  private resolveDeaths() {
    for (const [sessionId, cause] of this.deaths) {
      const client = this.clients.getById(sessionId);
      // O que ele carregava e o que tinha equipado ficam no chão, para quem pegar (aliado ou não).
      const body = this.state.players.get(sessionId);
      const inventory = this.inventories.get(sessionId);
      const equipped = equipmentToPile(this.equipment.get(sessionId) ?? {});
      if (body && inventory) this.dropPile(body, [...inventoryToPile(inventory), ...equipped]);
      const record = this.characters.get(sessionId);
      if (record) store.markDead(record.characterId, cause);
      client?.send("death", cause);
      this.removePlayer(sessionId);
      // CONSENTED: saída intencional. Sem código, o SDK trataria como queda de rede e tentaria reconectar o morto.
      client?.leave(CloseCode.CONSENTED);
      // Morreu desconectado: cancela a espera; ele não volta para um personagem morto.
      this.reconnections.get(sessionId)?.reject(new Error("morreu"));
    }
    this.deaths.clear();
  }

  private entryPoint(): Vec2 {
    return pickSpawnPoint(this.level.playerEntryPoints, Math.random());
  }

  // O cliente só diz para onde golpeou. Recarga, quem foi atingido e dano são decididos aqui.
  private handleAttack(sessionId: string, message: unknown) {
    const angle = parseAttackAngle(message);
    const attacker = this.state.players.get(sessionId);
    const now = this.clock.currentTime;
    const stats = this.statsOf(sessionId);
    // O cajado golpeia de perto como a espada (as magias são habilidades).
    if (angle === undefined || !attacker || !isOffCooldown(this.lastAttackMs.get(sessionId), now, attackCooldownMs(stats))) return;
    this.lastAttackMs.set(sessionId, now);
    // Golpear trava o personagem no lugar até a animação acabar.
    this.attackLockUntil.set(sessionId, now + ATTACK_LOCK_MS);
    attacker.attackSeq += 1;
    attacker.attackAngle = angle;
    this.hitMobs(sessionId, attacker, angle);
    this.hitPlayers(sessionId, attacker, angle);
    this.resolveDeaths();
  }

  // Disparo: o projétil nasce no centro de quem atira e já anda até a ponta do cajado (pode bater ali mesmo).
  private fireBolt(owner: string, from: Vec2, angle: number, damage: number) {
    const id = `bolt-${this.nextBoltId++}`;
    this.state.projectiles.set(id, new ProjectileState({ x: from.x, y: from.y, angle, done: false, kind: "" }));
    this.bolts.set(id, { flight: { x: from.x, y: from.y, angle, traveled: 0 }, owner, damage, spec: MAGIC_BOLT });
    this.applyBoltStep(id, launchProjectile(from, angle, this.level.grid, this.boltTargets(owner)));
  }

  // Projétil de mob (adaga do goblin, projétil do gnomo): acerta só jogadores.
  private fireMobBolt(owner: string, kind: "dagger" | "gnome", from: Vec2, angle: number) {
    const config = MOB_BOLTS[kind];
    const id = `bolt-${this.nextBoltId++}`;
    this.state.projectiles.set(id, new ProjectileState({ x: from.x, y: from.y, angle, done: false, kind }));
    const hostile = { mob: config.mob, type: config.type };
    this.bolts.set(id, { flight: { x: from.x, y: from.y, angle, traveled: 0 }, owner, damage: config.damage, spec: config.spec, hostile });
    this.applyBoltStep(id, launchProjectile(from, angle, this.level.grid, this.boltTargets(owner, true), config.spec));
  }

  // Janela de Skills: trocar a habilidade de um slot (Q ou R), a qualquer momento da run. Gravado na hora (não é loot).
  private handleEquipSkill(sessionId: string, message: unknown) {
    const player = this.state.players.get(sessionId);
    const record = this.characters.get(sessionId);
    const request = parseSkillEquip(message);
    const current = this.skills.get(sessionId);
    if (!player || !record || !request || !current) return;
    const next = equipSkill(current, request.slot, request.skill, record.classId);
    if (!next) return;
    this.skills.set(sessionId, next);
    store.setSkills(record.characterId, next);
    mirrorSkills(player.skills, next);
  }

  // Tecla da skill (Q = slot 0, R = slot 1). O cliente diz o slot e o ponto do mouse; aqui: a skill equipada nele,
  // fora da recarga dela. Bola de Fogo dispara o projétil na direção do ponto; Raio e Pântano caem no ponto de verdade
  // (spellTarget: no alcance, fora de parede). O lançamento sobe castSeq (não attackSeq, que é o golpe): quem vê o mago
  // desenha o cajado inclinando para a mira.
  private handleSkill(sessionId: string, message: unknown) {
    const cast = parseSkillCast(message);
    const caster = this.state.players.get(sessionId);
    const skill = cast && this.skills.get(sessionId)?.[cast.slot];
    if (!cast || !caster || !skill) return;
    const now = this.clock.currentTime;
    const last = this.lastSpellMs.get(sessionId) ?? {};
    if (!isOffCooldown(last[skill], now, SKILLS[skill].cooldownMs)) return;
    const magicDamage = this.statsOf(sessionId).magicDamage;
    const angle = Math.atan2(cast.target.y - caster.y, cast.target.x - caster.x);
    if (skill === "fireball") {
      this.fireBolt(sessionId, caster, angle, FIREBALL_SKILL.baseDamage + magicDamage);
    } else {
      const at = spellTarget(caster, cast.target, this.level.grid);
      if (!at) return;
      const id = `spell-${this.nextSpellId++}`;
      const lightning = skill === "lightning";
      const phase = lightning ? "warn" : "cast";
      const remainingMs = lightning ? LIGHTNING_SPELL.warnMs : SWAMP_SPELL.castMs;
      const damage = LIGHTNING_SPELL.baseDamage + magicDamage;
      this.spells.set(id, { kind: skill, owner: sessionId, phase, remainingMs, damage });
      this.state.spells.set(id, new SpellState({ kind: skill, x: at.x, y: at.y, phase }));
    }
    this.lastSpellMs.set(sessionId, { ...last, [skill]: now });
    // Conjurar também trava no lugar.
    this.attackLockUntil.set(sessionId, now + ATTACK_LOCK_MS);
    caster.castSeq += 1;
    caster.attackAngle = angle;
    this.resolveDeaths();
  }

  // Cada tick: as fases andam (aviso → raio, conjuração → poça → fim) e a recarga de cada um desce no HUD.
  private tickSpells(dtMs: number) {
    for (const [id, spell] of this.spells) {
      spell.remainingMs -= dtMs;
      if (spell.remainingMs > 0) continue;
      const view = this.state.spells.get(id);
      if (spell.phase === "warn" && view && spell.kind === "crystal") {
        spell.phase = "strike";
        spell.remainingMs = GNOME_CASTER.crystalShowMs;
        this.strikeCrystal(spell, view);
      } else if (spell.phase === "warn" && view) {
        spell.phase = "strike";
        spell.remainingMs = LIGHTNING_SPELL.strikeMs;
        this.strikeLightning(spell, view);
      } else if (spell.phase === "cast") {
        spell.phase = "active";
        spell.remainingMs = SWAMP_SPELL.durationMs;
      } else {
        this.spells.delete(id);
        this.state.spells.delete(id);
        continue;
      }
      if (view) view.phase = spell.phase;
    }
    const now = this.clock.currentTime;
    this.state.players.forEach((player, sessionId) => {
      const last = this.lastSpellMs.get(sessionId) ?? {};
      const classId = this.characters.get(sessionId)?.classId;
      for (const skill of classId ? CLASS_SKILLS[classId] : []) {
        const left = Math.max(0, SKILLS[skill].cooldownMs - (now - (last[skill] ?? -Infinity)));
        if (player.skillCooldowns.get(skill) !== left) player.skillCooldowns.set(skill, left);
      }
    });
  }

  // O cristal do gnomo brota: dano mágico e empurrão em quem ficou no círculo.
  private strikeCrystal(spell: CastSpell, at: SpellState) {
    const area = crystalArea(at);
    this.state.players.forEach((player, sessionId) => {
      if (!feetInside(area, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, spell.damage, { kind: "mob", mob: "gnomo" }, "magic");
      const push = knockback(at, player);
      const scale = GNOME_CASTER.crystalKnockback / Math.max(1, Math.hypot(push.x, push.y));
      const next = moveWithCollision(this.level.grid, player, { x: push.x * scale, y: push.y * scale }, PLAYER_SIZE / 2);
      player.x = next.x;
      player.y = next.y;
    });
  }

  // O raio cai: Dano Mágico em todos com os pés na área (mobs, que vão atrás de quem lançou, e os outros jogadores).
  private strikeLightning(spell: CastSpell, at: SpellState) {
    const area = lightningArea(at);
    const caster = this.state.players.get(spell.owner);
    const dead: string[] = [];
    this.state.mobs.forEach((mob, id) => {
      if (this.dying(id) || !feetInside(area, mob, mobStats(mob.kind).size / 2)) return;
      mob.hp = applyDamage(mob.hp, spell.damage);
      const brain = this.mobBrains.get(id);
      if (brain && caster) brain.mind = provoke(brain.mind, spell.owner, caster);
      if (mob.hp === 0) dead.push(id);
    });
    for (const id of dead) this.killMob(spell.owner, id);
    this.state.players.forEach((player, sessionId) => {
      if (sessionId === spell.owner || !feetInside(area, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, spell.damage, { kind: "player" }, "magic");
    });
  }

  // As poças ativas agora (para a lentidão de quem pisa nelas).
  private activeSwamps() {
    const swamps: (GroundEllipse & { owner: string })[] = [];
    for (const [id, spell] of this.spells) {
      const view = this.state.spells.get(id);
      if (spell.kind === "swamp" && spell.phase === "active" && view) swamps.push({ ...swampArea(view), owner: spell.owner });
    }
    return swamps;
  }

  // Quem um projétil pode acertar: os mobs e os outros jogadores vivos (fogo amigo, como o golpe). Nunca quem atirou.
  private boltTargets(owner: string, hostile = false): ProjectileTarget[] {
    const targets: ProjectileTarget[] = [];
    this.state.mobs.forEach((mob, id) => {
      if (!hostile && !this.dying(id)) targets.push({ id, x: mob.x, y: mob.y, radius: mobStats(mob.kind).size / 2 });
    });
    this.state.players.forEach((player, id) => {
      if (id !== owner && player.hp > 0) targets.push({ id, x: player.x, y: player.y, radius: PLAYER_SIZE / 2 });
    });
    return targets;
  }

  // Um tick de voo de cada projétil. Os que pararam há SPENT_BOLT_TICKS ticks saem do estado.
  private moveBolts(dtMs: number) {
    for (const [id, ticks] of this.spentBolts) {
      if (ticks > 1) {
        this.spentBolts.set(id, ticks - 1);
        continue;
      }
      this.spentBolts.delete(id);
      this.state.projectiles.delete(id);
    }
    for (const [id, bolt] of this.bolts) {
      this.applyBoltStep(id, stepProjectile(bolt.flight, dtMs, this.level.grid, this.boltTargets(bolt.owner, bolt.hostile !== undefined), bolt.spec));
    }
  }

  private applyBoltStep(id: string, step: ProjectileStep) {
    const bolt = this.bolts.get(id);
    const view = this.state.projectiles.get(id);
    if (!bolt || !view) return;
    if (step.kind === "flying") {
      bolt.flight = step.projectile;
      view.x = step.projectile.x;
      view.y = step.projectile.y;
      return;
    }
    view.x = step.at.x;
    view.y = step.at.y;
    view.done = true;
    this.bolts.delete(id);
    this.spentBolts.set(id, SPENT_BOLT_TICKS);
    if (step.kind === "hit") this.boltHit(bolt, step.id);
  }

  // Acerto: Dano Mágico no mob (que vai atrás de quem atirou) ou no jogador (reduzido pela Resistência Mágica dele).
  private boltHit(bolt: Bolt, targetId: string) {
    if (bolt.hostile) {
      const player = this.state.players.get(targetId);
      if (player) this.damagePlayer(targetId, player, bolt.damage, { kind: "mob", mob: bolt.hostile.mob }, bolt.hostile.type);
      return;
    }
    const mob = this.state.mobs.get(targetId);
    if (mob) {
      mob.hp = applyDamage(mob.hp, bolt.damage);
      const brain = this.mobBrains.get(targetId);
      const shooter = this.state.players.get(bolt.owner);
      if (brain && shooter) brain.mind = provoke(brain.mind, bolt.owner, shooter);
      if (mob.hp === 0) this.killMob(bolt.owner, targetId);
      return;
    }
    const player = this.state.players.get(targetId);
    if (player) this.damagePlayer(targetId, player, bolt.damage, { kind: "player" }, "magic");
  }

  // Os status de um jogador (base, arma, equipamento e essências).
  private statsOf(sessionId: string): PlayerStats {
    return this.stats.get(sessionId) ?? playerStats([]);
  }

  private hitMobs(attackerId: string, attacker: PlayerState, angle: number) {
    const dead: string[] = [];
    const stats = this.statsOf(attackerId);
    let healed = 0;
    this.state.mobs.forEach((mob, id) => {
      if (this.dying(id) || !isInSwing(attacker, angle, stats.attack, mob, mobStats(mob.kind).size / 2)) return;
      // Essência de Lobo: mais dano em alvo ferido, e parte do dano volta como vida.
      const damage = hitDamage(stats.physicalDamage, stats, mob.hp, this.mobMaxHp(id, mob));
      healed += lifesteal(Math.min(mob.hp, damage), stats);
      mob.hp = applyDamage(mob.hp, damage);
      if (mob.hp === 0) dead.push(id);
    });
    if (healed > 0) attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
    for (const id of dead) this.killMob(attackerId, id);
  }

  private mobMaxHp(id: string, mob: MobState): number {
    return mobStats(mob.kind).maxHp * (this.mobBrains.get(id)?.mini ? SLIME_SPLIT.hpFraction : 1);
  }

  // Mob morto: larga o loot, conta para quem matou (se ainda estiver na sala) e sai.
  private killMob(killerId: string, id: string) {
    const mob = this.state.mobs.get(id);
    const brain = this.mobBrains.get(id);
    // O Boneco de Treino não morre: zerou, volta inteiro (sem loot, sem crédito).
    if (mob && brain?.dummy) {
      mob.hp = TRAINING_DUMMY.maxHp;
      return;
    }
    if (brain?.dyingMs !== undefined) return;
    // Slime grande: larga o loot e conta agora, mas explode por SLIME_SPLIT.deathMs antes de sair (e soltar os minis).
    if (mob && brain && mob.kind === "slime" && !brain.mini) {
      this.dropMobLoot(mob, rollDrops("slime", Math.random));
      const killer = this.state.players.get(killerId);
      if (killer) this.creditKill(killerId, killer, "slime");
      brain.dyingMs = SLIME_SPLIT.deathMs;
      brain.killer = killerId;
      mob.hp = 0;
      mob.windup = false;
      this.setAction(mob, "dying");
      return;
    }
    const killer = this.state.players.get(killerId);
    if (mob) {
      // Mini-Slime não larga loot (o grande já largou).
      if (!brain?.mini) this.dropMobLoot(mob, rollDrops(mob.kind as MobKind, Math.random));
      if (killer) this.creditKill(killerId, killer, mob.kind as MobKind);
      // O slime deixa uma poça de lodo ácido por ACID.slimeDeathMs.
      if (mob.kind === "slime") this.addTempAcid(mob);
    }
    const pack = this.mobBrains.get(id)?.pack;
    this.packs.get(pack ?? "")?.alive.delete(id);
    this.state.mobs.delete(id);
    this.mobBrains.delete(id);
  }

  // Golpe final: registra no bestiário da linhagem e, se for o primeiro deste tipo do personagem, dá XP.
  private creditKill(sessionId: string, player: PlayerState, kind: MobKind) {
    const record = this.characters.get(sessionId);
    if (!record) return;
    const { firstForCharacter, xp } = store.recordKill(record, kind);
    if (!firstForCharacter) return;
    const levelBefore = player.level;
    player.xp = xp;
    player.level = levelForXp(xp);
    const message: FirstKillMessage = { mob: kind, xp, level: player.level, leveledUp: player.level > levelBefore };
    this.clients.getById(sessionId)?.send("firstKill", message);
  }

  // A pilha de quem morreu: tudo junto, sem dizer o que é (item "").
  private dropPile(at: Vec2, items: ItemStack[]) {
    if (items.length === 0) return;
    const id = `loot-${this.nextLootId++}`;
    this.lootPiles.set(id, items);
    this.state.loot.set(id, new LootState({ x: at.x, y: at.y, item: "", fresh: false, fromX: at.x, fromY: at.y }));
  }

  // Drop de mob: cada unidade é um item à parte no chão, espalhado em volta de onde ele morreu (nunca em cima de outro
  // item, nem em parede); recém-caído, o cliente o desenha pulando de `at` até o lugar.
  private dropMobLoot(at: Vec2, items: ItemStack[]) {
    const units = dropUnits(items);
    if (units.length === 0) return;
    const taken: Vec2[] = [];
    this.state.loot.forEach((pile) => taken.push(pile));
    const spots = placeDrops(at, units.length, taken, this.level.grid);
    const now = this.clock.currentTime;
    units.forEach((item, i) => {
      const spot = spots[i] ?? at;
      const id = `loot-${this.nextLootId++}`;
      this.lootPiles.set(id, [{ item, count: 1 }]);
      this.state.loot.set(id, new LootState({ x: spot.x, y: spot.y, item, fresh: true, fromX: at.x, fromY: at.y }));
      this.freshLoot.set(id, now + GROUND_DROPS.freshMs);
    });
  }

  private tickFreshLoot() {
    const now = this.clock.currentTime;
    for (const [id, until] of this.freshLoot) {
      if (now < until) continue;
      this.freshLoot.delete(id);
      const pile = this.state.loot.get(id);
      if (pile) pile.fresh = false;
    }
  }

  // F: pega da pilha mais próxima o que couber no inventário. O que não couber fica no chão.
  private handlePickup(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    if (!player || !inventory) return;
    const positions = new Map<string, Vec2>();
    this.state.loot.forEach((pile, id) => positions.set(id, pile));
    // F pega tudo no alcance (os cristais caem espalhados), o mais perto primeiro, até a mochila encher.
    let current = inventory;
    for (const id of allWithin(player, positions, PICKUP_RADIUS)) {
      const pile = this.lootPiles.get(id);
      if (!pile) continue;
      const result = takeFromPile(current, pile);
      current = result.inventory;
      if (result.pile.length > 0) {
        this.lootPiles.set(id, result.pile);
        continue;
      }
      this.lootPiles.delete(id);
      this.state.loot.delete(id);
      this.freshLoot.delete(id);
    }
    if (current !== inventory) this.setInventory(sessionId, player, current);
  }

  // Fogo amigo: o golpe acerta qualquer outro jogador no arco.
  private hitPlayers(attackerId: string, attacker: Vec2, angle: number) {
    const { physicalDamage, attack } = this.statsOf(attackerId);
    this.state.players.forEach((player, sessionId) => {
      if (sessionId === attackerId || !isInSwing(attacker, angle, attack, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, physicalDamage, { kind: "player" }, "physical");
    });
  }

  // Uma vez, quando a sala nasce. Zonas hostis: grupos táticos (um por setor, com posto e vida em repouso). Outras
  // áreas (o centro): os mobs soltos de AREAS, vagando pela área inteira. Todos nascem longe da chegada.
  private spawnMobs() {
    for (const area of this.level.areas) {
      const cells = this.level.floorCells.get(area.name) ?? [];
      const zone = this.level.configs[area.name]?.zone;
      if (zone) {
        const plans = planPacks(cells, ZONE_KIND[zone], this.level.grid.tileSize, this.level.playerEntryPoints, Math.random);
        plans.forEach((plan, i) => {
          const pack: Pack = {
            ...plan,
            area,
            homeCells: cells,
            plan: idlePlanFor(plan.kind, plan.home, this.level.grid, this.level.crystals, Math.random),
            alive: new Set(),
          };
          const id = `pack-${area.name}-${i + 1}`;
          this.packs.set(id, pack);
          this.spawnPack(id, pack);
        });
        continue;
      }
      const spawnCells = safeSpawnCells(cells, this.level.playerEntryPoints, MOB_SPAWN_SAFE_RADIUS);
      for (const { kind, position } of planMobSpawns(spawnCells, this.level.configs[area.name]?.mobs ?? {}, Math.random)) {
        this.addMob(kind, position, { kind, area, homeCells: cells, mind: { mode: "wander", wander: startIdle(Math.random) } });
      }
    }
  }

  private addMob(kind: SpawnKind, at: Vec2, brain: MobBrain): string {
    const id = `mob-${this.nextMobId++}`;
    const fresh = { windup: false, attackAngle: 0, frenzy: false, action: "", actionSeq: 0, aimX: 0, aimY: 0, mini: brain.mini === true };
    const hp = Math.round(mobStats(kind).maxHp * (brain.mini ? SLIME_SPLIT.hpFraction : 1));
    this.state.mobs.set(id, new MobState({ kind, ...at, hp, ...fresh }));
    brain.flank ??= FLANK_ANGLES[this.nextMobId % FLANK_ANGLES.length];
    this.mobBrains.set(id, brain);
    return id;
  }

  // O grupo nasce inteiro no posto, em repouso.
  private spawnPack(packId: string, pack: Pack) {
    pack.deadSinceMs = undefined;
    for (const at of pack.members) {
      const post = { home: pack.home, plan: pack.plan };
      const mind: MobMind = { mode: "idle", path: [], waitMs: Math.random() * 1500, leg: 0 };
      pack.alive.add(this.addMob(pack.kind, at, { kind: pack.kind, area: pack.area, homeCells: pack.homeCells, mind, post, pack: packId }));
    }
  }

  // Grupo inteiro morto: depois de PACK_RESPAWN.delayMs, renasce, se ninguém estiver perto do posto (fora da tela).
  private respawnPacks() {
    if (++this.ticksSinceRespawnCheck < RESPAWN_CHECK_TICKS) return;
    this.ticksSinceRespawnCheck = 0;
    const now = this.clock.currentTime;
    for (const [id, pack] of this.packs) {
      if (pack.alive.size > 0) continue;
      pack.deadSinceMs ??= now;
      if (now - pack.deadSinceMs < PACK_RESPAWN.delayMs) continue;
      let watched = false;
      this.state.players.forEach((p) => {
        if (Math.hypot(p.x - pack.home.x, p.y - pack.home.y) < PACK_RESPAWN.clearRadius) watched = true;
      });
      if (!watched) this.spawnPack(id, pack);
    }
  }

  private tick(dtMs: number) {
    this.updateZones();
    this.movePlayers(dtMs);
    this.starvePlayers(dtMs);
    this.regeneratePlayers(dtMs);
    this.tickZoneHazards(dtMs);
    this.moveMobs(dtMs);
    this.tickDying(dtMs);
    this.tickFreshLoot();
    this.respawnPacks();
    this.moveBolts(dtMs);
    this.tickSpells(dtMs);
    this.resolveDeaths();
    this.updateExits(dtMs);
    this.updateViews();
  }

  private moveMobs(dtMs: number) {
    // A Furtividade de cada um encurta a distância em que os mobs o notam.
    const players = new Map<string, MobTarget>();
    this.state.players.forEach((player, sessionId) =>
      players.set(sessionId, { x: player.x, y: player.y, stealthPercent: this.statsOf(sessionId).stealthPercent }),
    );
    const swamps = this.activeSwamps();
    const noticeable = this.limitChasers();
    const hurt: (Vec2 & { hp: number; maxHp: number; zone: ZoneId | undefined })[] = [];
    this.state.players.forEach((p, sessionId) => hurt.push({ x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, zone: this.zones.get(sessionId) }));
    this.state.mobs.forEach((mob, id) => {
      const brain = this.mobBrains.get(id);
      if (!brain) return;
      // Parado: o boneco, o spawn de dev com a IA desligada, ou a IA da sala desligada (set_mob_ai). Explodindo: parado.
      if (brain.ai === false || !this.mobAiOn || brain.dyingMs !== undefined) return;
      // Na lama de um Pântano, o mob anda mais devagar (o mesmo passo, com a velocidade reduzida). Lobo em frenesi:
      // mais rápido e nota de mais longe.
      const base = mobStats(brain.kind);
      const kind = brain.mini ? { ...base, speed: base.speed * SLIME_SPLIT.speedFactor } : base;
      const slow = swampSlow(mob, kind.size / 2, id, swamps);
      const frenzy = brain.kind === "lobo" && wolfFrenzy(mob, hurt);
      if (mob.frenzy !== frenzy) mob.frenzy = frenzy;
      const boost = frenzy ? FRENZY.speedFactor : 1;
      // Em frenesi, o lobo também golpeia mais rápido (preparo e recuperação mais curtos).
      const attackTime = frenzy ? FRENZY.attackTimeFactor : 1;
      const stats =
        slow === 1 && !frenzy
          ? kind
          : {
              ...kind,
              speed: kind.speed * slow * boost,
              aggroRadius: kind.aggroRadius * (frenzy ? FRENZY.aggroFactor : 1),
              windupMs: kind.windupMs * attackTime,
              recoverMs: kind.recoverMs * attackTime,
            };
      const thinking = { position: { x: mob.x, y: mob.y }, mind: brain.mind, timers: brain.timers };
      // Longe de todos e só vagando: hiberna neste tick (nem pensa nem se move). Acorda bem antes de alguém chegar.
      if (isDormant(thinking, players)) return;
      const world = { grid: this.level.grid, home: brain.area, homeCells: brain.homeCells, stats, players, post: brain.post, noticeable, flank: brain.flank };
      const next = stepMob(thinking, world, dtMs, Math.random);
      mob.x = next.position.x;
      mob.y = next.position.y;
      mob.windup = next.mind.mode === "windup";
      if (next.mind.mode === "windup") mob.attackAngle = next.mind.angle;
      if (next.mind.mode === "ability") {
        mob.attackAngle = next.mind.angle;
        if (mob.aimX !== next.mind.aim.x) mob.aimX = next.mind.aim.x;
        if (mob.aimY !== next.mind.aim.y) mob.aimY = next.mind.aim.y;
      }
      brain.mind = next.mind;
      brain.timers = next.timers;
      this.setAction(mob, actionOf(next.mind));
      if (brain.kind === "dummy") return;
      if (next.strike !== undefined) this.mobStrike(next.position, next.strike, brain.kind);
      for (const event of next.events ?? []) this.applyMobEvent(id, brain.kind, event);
    });
  }

  // A ação mudou: o cliente troca de animação (actionSeq sobe a cada ação nova).
  private setAction(mob: MobState, action: string) {
    if (mob.action === action) return;
    mob.action = action;
    if (action) mob.actionSeq += 1;
  }

  private dying(id: string): boolean {
    return this.mobBrains.get(id)?.dyingMs !== undefined;
  }

  // O que um ataque especial fez: atirou, conjurou o cristal ou caiu do bote/pulo.
  private applyMobEvent(id: string, kind: MobKind, event: MobEvent) {
    if (event.type === "projectile") return this.fireMobBolt(id, event.kind, event.from, event.angle);
    if (event.type === "crystal") {
      const spellId = `spell-${this.nextSpellId++}`;
      this.spells.set(spellId, { kind: "crystal", owner: id, phase: "warn", remainingMs: GNOME_CASTER.crystalWarnMs, damage: GNOME_CASTER.crystalDamage, hostile: true });
      this.state.spells.set(spellId, new SpellState({ kind: "crystal", x: event.at.x, y: event.at.y, phase: "warn" }));
      return;
    }
    const leap = event.ability === "leap";
    const radius = leap ? SLIME_LEAP.hitRadius : WOLF_POUNCE.hitRadius;
    const damage = leap ? SLIME_LEAP.damage : WOLF_POUNCE.damage;
    const now = this.clock.currentTime;
    this.state.players.forEach((player, sessionId) => {
      if (Math.hypot(player.x - event.at.x, player.y - event.at.y) > radius + PLAYER_SIZE / 2) return;
      this.damagePlayer(sessionId, player, damage, { kind: "mob", mob: kind }, "physical");
      this.staggerUntil.set(sessionId, now + STAGGER.durationMs);
      if (!leap) this.pounceSlowUntil.set(sessionId, now + WOLF_POUNCE.slowMs);
    });
    if (leap) this.addTempAcid(event.at, SLIME_LEAP.acidMs);
  }

  // Slimes explodindo: acabou a explosão, saem e soltam os 2 minis (um para cada lado), já caçando quem matou.
  private tickDying(dtMs: number) {
    for (const [id, brain] of this.mobBrains) {
      if (brain.dyingMs === undefined) continue;
      brain.dyingMs -= dtMs;
      if (brain.dyingMs > 0) continue;
      const mob = this.state.mobs.get(id);
      this.packs.get(brain.pack ?? "")?.alive.delete(id);
      this.state.mobs.delete(id);
      this.mobBrains.delete(id);
      if (!mob) continue;
      const killer = brain.killer ? this.state.players.get(brain.killer) : undefined;
      for (const side of [-1, 1]) {
        const at = { x: mob.x + side * SLIME_SPLIT.offset, y: mob.y };
        const spot = boxFits(this.level.grid, at, MOB_KINDS.slime.size / 2) ? at : { x: mob.x, y: mob.y };
        const mind: MobMind = killer && brain.killer
          ? { mode: "chase", targetId: brain.killer, lastSeen: { x: killer.x, y: killer.y }, lostMs: 0, path: [], sinceRepathMs: 1e9 }
          : { mode: "wander", wander: startIdle(Math.random) };
        this.addMob("slime", spot, { kind: "slime", area: brain.area, homeCells: brain.homeCells, mind, mini: true });
      }
    }
  }

  // Teto de perseguidores (anti-enxame): por jogador, só os MAX_CHASERS mais perto continuam caçando; os outros desistem
  // e voltam. Devolve quem ainda pode ser notado (quem tem menos que o teto atrás de si).
  private limitChasers(): Set<string> {
    const chasers: { id: string; targetId: string; distance: number }[] = [];
    for (const [id, brain] of this.mobBrains) {
      const mind = brain.mind;
      if (mind.mode !== "chase" && mind.mode !== "windup" && mind.mode !== "recover" && mind.mode !== "ability") continue;
      // Quem atende ao alarme de um portal não conta para o teto nem é mandado de volta.
      if (mind.alert) continue;
      const mob = this.state.mobs.get(id);
      const target = this.state.players.get(mind.targetId);
      if (mob && target) chasers.push({ id, targetId: mind.targetId, distance: Math.hypot(mob.x - target.x, mob.y - target.y) });
    }
    for (const id of excessChasers(chasers, MAX_CHASERS)) {
      const brain = this.mobBrains.get(id);
      if (brain) brain.mind = { mode: "return", path: [] };
    }
    const counts = new Map<string, number>();
    for (const c of chasers) counts.set(c.targetId, (counts.get(c.targetId) ?? 0) + 1);
    const noticeable = new Set<string>();
    this.state.players.forEach((_, sessionId) => {
      if ((counts.get(sessionId) ?? 0) < MAX_CHASERS) noticeable.add(sessionId);
    });
    return noticeable;
  }

  // Golpe do mob: acerta todos os jogadores no arco travado, não só o alvo. Mob não fere mob.
  private mobStrike(origin: Vec2, angle: number, kind: MobKind) {
    const stats = MOB_KINDS[kind];
    const arc = mobStrikeArc(stats);
    this.state.players.forEach((player, sessionId) => {
      if (!isInArc(origin, angle, arc, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, stats.attackDamage, { kind: "mob", mob: kind }, "physical");
      this.staggerUntil.set(sessionId, this.clock.currentTime + STAGGER.durationMs);
    });
  }

  // Fome é tick do servidor (regra 6): cai para todos (mais devagar com Vigor), e quem está zerado perde vida.
  private starvePlayers(dtMs: number) {
    this.state.players.forEach((player, sessionId) => {
      // God Mode: fome travada.
      if (this.godMode.has(sessionId)) {
        player.hunger = HUNGER_MAX;
        return;
      }
      // No frio dos lobos, a fome anda mais rápido (o tick conta mais tempo).
      player.hunger = tickHunger(player.hunger, dtMs * zoneHungerFactor(this.zones.get(sessionId)), this.statsOf(sessionId).vigorPercent);
      const damage = starvationDamage(player.hunger, dtMs);
      if (damage > 0) this.damagePlayer(sessionId, player, damage, { kind: "starvation" }, "true");
    });
  }

  // Regeneração: vida que volta com o tempo, só depois de REGEN_DELAY_MS sem levar dano. No labirinto (esta sala), a
  // de Vida e a de Mana valem LABYRINTH_REGEN_FACTOR.
  private regeneratePlayers(dtMs: number) {
    const now = this.clock.currentTime;
    this.state.players.forEach((player, sessionId) => {
      const sinceHurt = now - (this.lastHurtMs.get(sessionId) ?? -Infinity);
      // No miasma dos slimes, a cura vale menos.
      const healed = regenerate(player.hp, this.statsOf(sessionId), dtMs, sinceHurt) - player.hp;
      if (healed > 0) player.hp += zoneHeal(healed * LABYRINTH_REGEN_FACTOR, this.zones.get(sessionId));
      // Mana: regenera; na zona dos gnomos, drena.
      const stats = this.statsOf(sessionId);
      if (player.maxMana !== stats.maxMana) player.maxMana = stats.maxMana;
      player.mana = tickMana(player.mana, stats.maxMana, this.zones.get(sessionId), dtMs, LABYRINTH_REGEN_FACTOR, stats.manaRegenPerSecond);
      // God Mode: Mana infinita.
      if (this.godMode.has(sessionId)) player.mana = stats.maxMana;
    });
  }

  private movePlayers(dtMs: number) {
    const swamps = this.activeSwamps();
    const now = this.clock.currentTime;
    this.state.players.forEach((player, sessionId) => {
      // Na lama de um Pântano de outro jogador, anda mais devagar (na própria lama, não); numa poça ácida, também; e logo
      // depois de levar golpe de mob (stagger).
      const acid = inAcid(player, PLAYER_SIZE / 2, this.acidPools()) ? ACID.slow : 1;
      const stagger = now < (this.staggerUntil.get(sessionId) ?? 0) ? STAGGER.slow : 1;
      // Golpeando ou conjurando: parado (as teclas seguem apertadas; ao acabar, volta a andar).
      const kite = now < (this.attackLockUntil.get(sessionId) ?? 0) ? 0 : 1;
      const pounced = now < (this.pounceSlowUntil.get(sessionId) ?? 0) ? WOLF_POUNCE.slow : 1;
      const speed = (this.stats.get(sessionId)?.speed ?? PLAYER_SPEED) * swampSlow(player, PLAYER_SIZE / 2, sessionId, swamps) * acid * stagger * kite * pounced;
      const delta = movementDelta(this.moveInputs.get(sessionId) ?? NO_INPUT, dtMs, speed);
      const next = moveWithCollision(this.level.grid, player, delta, PLAYER_SIZE / 2);
      player.x = next.x;
      player.y = next.y;
    });
  }

  // O próprio jogador entra na visão no onJoin e nunca sai; aqui só os outros e os mobs.
  // Saídas e projéteis brilham: são vistos até o raio de visão. Os outros jogadores, só sem parede no meio. Mobs e pilhas
  // só se estiverem na luz e sem parede no meio (regra 4); a luz de cada jogador vai até a Percepção dele, cada projétil
  // carrega a sua (MAGIC_BOLT.lightRadius), e nenhuma luz atravessa parede.
  private updateViews() {
    const carriers: LightCarrier[] = [];
    // No breu dos goblins, a luz de quem está lá cai (e com ela o que é enviado).
    this.state.players.forEach((player, sessionId) =>
      carriers.push({ x: player.x, y: player.y, radius: zoneLightRadius(this.statsOf(sessionId).lightRadius, this.zones.get(sessionId)) }),
    );
    this.state.projectiles.forEach((bolt) => carriers.push({ x: bolt.x, y: bolt.y, radius: MAGIC_BOLT.lightRadius }));
    this.state.spells.forEach((spell) => {
      if (spell.kind === "lightning") carriers.push({ x: spell.x, y: spell.y, radius: LIGHTNING_SPELL.lightRadius });
    });
    const grid = this.level.grid;
    const lit = (entity: MobState | LootState, view: StateView) => isLit(entity, this.lit, carriers, view.has(entity), grid);
    const reach = VIEW_RADIUS + VIEW_HYSTERESIS;
    for (const client of this.clients) {
      const view = client.view;
      const self = this.state.players.get(client.sessionId);
      if (!view || !self) continue;
      // Linha de visão de quem olha: perto (o raio de visão decide o resto) e sem parede no meio.
      const inSight = (e: Vec2) => Math.hypot(e.x - self.x, e.y - self.y) <= reach && lightReaches(grid, self, e);
      this.state.players.forEach((other, sessionId) => {
        if (sessionId !== client.sessionId) updateVisibility(view, self, other, inSight(other));
      });
      this.state.mobs.forEach((mob) => updateVisibility(view, self, mob, inSight(mob) && lit(mob, view)));
      this.state.loot.forEach((pile) => updateVisibility(view, self, pile, inSight(pile) && lit(pile, view)));
      this.state.exits.forEach((exit) => updateVisibility(view, self, exit));
      this.state.projectiles.forEach((bolt) => updateVisibility(view, self, bolt));
      this.state.spells.forEach((spell) => updateVisibility(view, self, spell));
      this.state.torches.forEach((torch) => updateVisibility(view, self, torch));
      this.state.hazards.forEach((hazard) => updateVisibility(view, self, hazard));
      this.updateEyes(client.sessionId, self, view);
    }
  }

  // Breu dos goblins: os goblins que caçam este jogador, a até 6 tiles, sem parede no meio e fora do que ele recebe,
  // viram só olhos.
  private updateEyes(sessionId: string, self: PlayerState, view: StateView) {
    const hunters: (Vec2 & { hunting: boolean })[] = [];
    if (this.zones.get(sessionId) === "goblin") {
      this.state.mobs.forEach((mob, id) => {
        const mind = this.mobBrains.get(id)?.mind;
        if (mob.kind !== "goblin" || view.has(mob) || !mind || !("targetId" in mind)) return;
        hunters.push({ x: mob.x, y: mob.y, hunting: mind.targetId === sessionId });
      });
    }
    const flat = goblinEyes(self, hunters, this.level.grid).flatMap((e) => [Math.round(e.x), Math.round(e.y)]);
    if (flat.length === self.eyes.length && flat.every((v, i) => self.eyes[i] === v)) return;
    self.eyes.splice(0, self.eyes.length);
    for (const v of flat) self.eyes.push(v);
  }

  // ---------------------------------------------------------------- ferramentas de dev (DEV_TOOLS=1)

  private roomKind(): "game" | "sandbox" {
    return this.sandbox ? "sandbox" : "game";
  }

  // Um comando do painel F2 ou do window.__DEV__. Só chega aqui com DEV_TOOLS=1 (o handler nem existe sem).
  private handleDev(sessionId: string, message: unknown) {
    const command = parseDevCommand(message);
    const player = this.state.players.get(sessionId);
    if (!command || !player) return;
    switch (command.command) {
      case "enter_test_room":
        return this.devTeleport(sessionId, "test_room");
      case "teleport_to":
        return this.devTeleport(sessionId, command.target);
      case "set_god_mode":
        if (command.enabled) this.godMode.add(sessionId);
        else this.godMode.delete(sessionId);
        return this.notify(sessionId, command.enabled ? "God Mode ligado: imortal, Mana infinita e fome travada." : "God Mode desligado.");
      case "set_mob_ai":
        this.mobAiOn = command.enabled;
        return this.notify(sessionId, command.enabled ? "IA dos mobs ligada." : "IA dos mobs desligada: todos parados.");
      case "set_class":
        return this.devSetClass(sessionId, player, command.characterClass);
      case "give_item":
        return this.devGear(sessionId, player, (gear, classId) => devGive(gear, command.item, command.count, command.equip, classId));
      case "give_all_gear":
        return this.devGear(sessionId, player, (gear, classId) => {
          let out: { gear: DevGear; notice?: string } = { gear };
          for (const item of IRON_GEAR) out = devGive(out.gear, item, 1, true, classId);
          return out;
        });
      case "clear_bag":
        return this.devGear(sessionId, player, (gear) => ({ gear: { inventory: emptyInventory(), equipment: gear.equipment } }));
      case "add_gold":
        return this.devAddGold(sessionId, player, command.amount);
      case "heal":
        player.hp = player.maxHp;
        player.hunger = HUNGER_MAX;
        player.mana = player.maxMana;
        this.bleedMs.set(sessionId, 0);
        return;
      case "spawn_mob":
        return this.devSpawn(player, command.mob, command.count, command.aiEnabled, command.lowHp, command.angle);
      case "clear_mobs":
        return this.devClearMobs(sessionId, player);
      case "test_drops": {
        // 3 Cristais e 1 Essência (sorteada entre as 4) caindo ao lado do jogador.
        const essences = ["essencia_goblin", "essencia_slime", "essencia_lobo", "essencia_gnomo"] as const;
        const essence = essences[Math.floor(Math.random() * essences.length)] ?? "essencia_lobo";
        const at = { x: player.x + this.level.grid.tileSize, y: player.y };
        const spot = boxFits(this.level.grid, at, GROUND_DROPS.radius) ? at : { x: player.x, y: player.y };
        return this.dropMobLoot(spot, [{ item: "cristal_magico", count: DEV_TEST_DROPS.crystals }, { item: essence, count: 1 }]);
      }
      case "force_zone_effect":
        return this.devForceZone(sessionId, player, command.effect);
    }
  }

  // Destino em outra sala: o cliente troca de sala (dev_goto) e entra com o destino. Nesta sala: o jogador vai direto.
  private devTeleport(sessionId: string, target: DevTeleport) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    if (teleportRoom(target) !== this.roomKind()) {
      this.clients.getById(sessionId)?.send("dev_goto", { target });
      return;
    }
    const spot = this.devSpot(target, player);
    if (!spot) return this.notify(sessionId, "Esse destino não existe aqui.");
    player.x = spot.x;
    player.y = spot.y;
  }

  // Onde cada destino fica nesta sala: a chegada (Sala de Testes), o meio de cada zona, ou ao lado da saída mais perto.
  private devSpot(target: DevTeleport, player: Vec2): Vec2 | undefined {
    if (target === "test_room") return this.level.playerEntryPoints[0];
    if (target === "portal") {
      let nearest: Vec2 | undefined;
      for (const exit of this.activeExits) {
        if (!nearest || Math.hypot(exit.x - player.x, exit.y - player.y) < Math.hypot(nearest.x - player.x, nearest.y - player.y)) nearest = exit;
      }
      if (!nearest) return undefined;
      const ts = this.level.grid.tileSize;
      const beside = [{ x: 0, y: 1.5 }, { x: 0, y: -1.5 }, { x: 1.5, y: 0 }, { x: -1.5, y: 0 }].map((d) => ({ x: nearest.x + d.x * ts, y: nearest.y + d.y * ts }));
      return beside.find((p) => boxFits(this.level.grid, p, PLAYER_SIZE / 2)) ?? nearest;
    }
    const zone = DEV_ZONES[target.replace("_zone", "") as keyof typeof DEV_ZONES];
    return zone ? this.zoneCenter(zone) : undefined;
  }

  // O meio de uma zona: o tile de chão dela mais perto da média dos tiles (calculado uma vez).
  private zoneCenter(zone: ZoneId): Vec2 | undefined {
    const cached = this.zoneCenters.get(zone);
    if (cached) return cached;
    const cells = this.level.areas.filter((a) => this.level.configs[a.name]?.zone === zone).flatMap((a) => this.level.floorCells.get(a.name) ?? []);
    if (cells.length === 0) return undefined;
    const mean = { x: cells.reduce((s, c) => s + c.x, 0) / cells.length, y: cells.reduce((s, c) => s + c.y, 0) / cells.length };
    let best = cells[0] as Vec2;
    for (const c of cells) if (Math.hypot(c.x - mean.x, c.y - mean.y) < Math.hypot(best.x - mean.x, best.y - mean.y)) best = c;
    this.zoneCenters.set(zone, best);
    return best;
  }

  // Troca de classe na hora, gravada (escolha do dono do projeto): o desenho, as habilidades iniciais da classe e o
  // equipamento (o que a classe nova não usa vai para a mochila). Mochila e equipamento também vão para o banco, para
  // o personagem gravado não ficar com peça de outra classe no corpo.
  private devSetClass(sessionId: string, player: PlayerState, classId: ClassId) {
    const record = this.characters.get(sessionId);
    if (!record) return;
    store.changeClass(record.characterId, classId);
    record.classId = classId;
    player.classId = classId;
    const skills = startingSkills(classId);
    store.setSkills(record.characterId, skills);
    this.skills.set(sessionId, skills);
    mirrorSkills(player.skills, skills);
    this.devGear(sessionId, player, (gear) => ({ gear: dropForeignGear(gear, classId) }));
    const gear = { inventory: this.inventories.get(sessionId), equipment: this.equipment.get(sessionId) };
    if (gear.inventory && gear.equipment) store.saveGear(record.characterId, gear.inventory, gear.equipment);
    this.notify(sessionId, `Classe trocada: ${CLASS_NAMES[classId]}.`);
  }

  private devGear(sessionId: string, player: PlayerState, change: (gear: DevGear, classId: ClassId | undefined) => { gear: DevGear; notice?: string }) {
    const inventory = this.inventories.get(sessionId);
    const equipment = this.equipment.get(sessionId);
    if (!inventory || !equipment) return;
    const out = change({ inventory, equipment }, this.characters.get(sessionId)?.classId);
    this.applyGear(sessionId, player, out.gear);
    if (out.notice) this.notify(sessionId, out.notice);
  }

  private devAddGold(sessionId: string, player: PlayerState, amount: number) {
    const record = this.characters.get(sessionId);
    if (!record) return;
    const coins = store.coins(record.lineageId) + amount;
    store.setCoins(record.lineageId, coins);
    player.coins = coins;
    this.notify(sessionId, `+${amount} moedas (agora ${coins}).`);
  }

  // Spawn a DEV.spawnTiles tiles à frente (na direção pedida, ou na do último golpe). Mob solto da área onde cai, como
  // os do centro; com a IA desligada (ou o boneco), parado.
  private devSpawn(player: PlayerState, kind: SpawnKind, count: number, aiEnabled: boolean, lowHp: boolean, angle?: number) {
    const stats = mobStats(kind);
    for (const at of spawnSpots(this.level.grid, player, angle ?? player.attackAngle, count, stats.size / 2)) {
      const area = areaAt(this.level.areas, at) ?? this.level.areas[0];
      if (!area) return;
      const dummy = kind === "dummy";
      const mind: MobMind = { mode: "wander", wander: startIdle(Math.random) };
      const id = this.addMob(kind, at, { kind, area, homeCells: this.level.floorCells.get(area.name) ?? [], mind, ai: aiEnabled && !dummy, dummy });
      const mob = this.state.mobs.get(id);
      if (mob && lowHp) mob.hp = Math.max(1, Math.round(stats.maxHp * DEV.lowHpFraction));
    }
  }

  // Um Boneco de Treino na Sala de Testes, ao lado da chegada.
  private spawnTrainingDummy() {
    const entry = this.level.playerEntryPoints[0];
    const area = this.level.areas[0];
    if (!entry || !area) return;
    const ts = this.level.grid.tileSize;
    const at = { x: entry.x + 4 * ts, y: entry.y - 2 * ts };
    this.addMob("dummy", at, { kind: "dummy", area, homeCells: [], mind: { mode: "wander", wander: startIdle(Math.random) }, ai: false, dummy: true });
  }

  private devClearMobs(sessionId: string, player: Vec2) {
    const gone: string[] = [];
    this.state.mobs.forEach((mob, id) => {
      if (Math.hypot(mob.x - player.x, mob.y - player.y) <= DEV.clearRadius) gone.push(id);
    });
    for (const id of gone) {
      this.packs.get(this.mobBrains.get(id)?.pack ?? "")?.alive.delete(id);
      this.state.mobs.delete(id);
      this.mobBrains.delete(id);
    }
    this.notify(sessionId, `${gone.length} mob(s) removido(s).`);
  }

  // Efeito de zona forçado em quem pediu, onde ele estiver (a Sala de Testes não tem zona): os efeitos contínuos da
  // zona e, para testar os do chão, uma poça ácida (slime) ou estilhaços e um cristal de descarga (gnomo) perto dele.
  private devForceZone(sessionId: string, player: Vec2, effect: keyof typeof DEV_ZONES | "none") {
    for (const id of this.devHazards) {
      this.state.hazards.delete(id);
      this.tempAcid.delete(id);
    }
    this.pulses = this.pulses.filter((p) => !this.devHazards.has(p.id));
    this.devHazards.clear();
    if (effect === "none") {
      this.forcedZones.delete(sessionId);
      return this.notify(sessionId, "Efeito de zona desligado.");
    }
    const zone = DEV_ZONES[effect];
    this.forcedZones.set(sessionId, zone);
    const ts = this.level.grid.tileSize;
    const near = (dx: number, dy: number) => ({ x: player.x + dx * ts, y: player.y + dy * ts });
    const fits = (p: Vec2) => boxFits(this.level.grid, p, ts / 2);
    if (zone === "slime") {
      const at = near(3, 0);
      if (fits(at)) {
        const id = this.addHazard("acid", at);
        this.tempAcid.set(id, Infinity);
        this.devHazards.add(id);
      }
    }
    if (zone === "gnomo") {
      for (const at of [near(2, 2), near(-2, 2), near(2, -2), near(-2, -2)].filter(fits)) this.devHazards.add(this.addHazard("shard", at));
      const crystal = near(0, -3);
      if (fits(crystal)) {
        const id = this.addHazard("pulse", crystal);
        this.pulses.push({ id, at: crystal, offsetMs: 0 });
        this.devHazards.add(id);
      }
    }
    this.notify(sessionId, `Efeito de zona forçado: ${effect}.`);
  }

  // ---------------------------------------------------------------- zonas hostis

  // Em que zona cada um está (para os efeitos e para o HUD).
  private updateZones() {
    this.state.players.forEach((player, sessionId) => {
      // Ferramentas de dev: a zona forçada (force_zone_effect) vale no lugar da do mapa.
      const zone = this.forcedZones.get(sessionId) ?? zoneAt(this.level.areas, this.level.configs, player);
      this.zones.set(sessionId, zone);
      if (player.zone !== (zone ?? "")) player.zone = zone ?? "";
    });
  }

  // Uma vez por run: tochas apagadas, estilhaços e as descargas dos cristais da zona dos gnomos.
  private placeHazards() {
    this.level.torches.forEach((at, i) => this.state.torches.set(`torch-${i + 1}`, new TorchState({ x: at.x, y: at.y, lit: false })));
    const gnomeCells = this.level.areas.filter((a) => this.level.configs[a.name]?.zone === "gnomo").flatMap((a) => this.level.floorCells.get(a.name) ?? []);
    for (const at of scatterShards(gnomeCells, Math.random)) this.addHazard("shard", at);
    this.pulses = this.level.pulseCrystals.map((at) => ({ id: this.addHazard("pulse", at), at, offsetMs: Math.random() * CRYSTAL_PULSE.periodMs }));
  }

  private addHazard(kind: "acid" | "shard" | "pulse", at: Vec2): string {
    const id = `hazard-${this.nextHazardId++}`;
    this.state.hazards.set(id, new HazardState({ kind, x: at.x, y: at.y, active: false }));
    return id;
  }

  private addTempAcid(at: Vec2, durationMs = ACID.slimeDeathMs) {
    this.tempAcid.set(this.addHazard("acid", at), this.clock.currentTime + durationMs);
  }

  // Todas as poças ácidas agora: as do mapa e as dos slimes mortos.
  private acidPools(): Vec2[] {
    const pools: Vec2[] = [...this.level.acidPools];
    for (const id of this.tempAcid.keys()) {
      const h = this.state.hazards.get(id);
      if (h) pools.push(h);
    }
    return pools;
  }

  // [E] perto de uma tocha apagada dos goblins: acende para todos, e a luz dela passa a valer para o que é enviado.
  private handleLightTorch(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const entries: [string, TorchState][] = [];
    this.state.torches.forEach((torch, id) => entries.push([id, torch]));
    const id = torchInReach(player, entries, TORCH.interactRadius);
    const torch = id && this.state.torches.get(id);
    if (!torch) return;
    torch.lit = true;
    this.rebuildLitMap();
  }

  // Cada tick: poças ácidas (dano em quem pisa, fim das temporárias), estilhaços pisados (dano e sangramento),
  // sangramento e as descargas dos cristais.
  private tickZoneHazards(dtMs: number) {
    const now = this.clock.currentTime;
    for (const [id, until] of this.tempAcid) {
      if (now < until) continue;
      this.tempAcid.delete(id);
      this.state.hazards.delete(id);
    }
    const pools = this.acidPools();
    const shards: [string, HazardState][] = [];
    this.state.hazards.forEach((h, id) => {
      if (h.kind === "shard") shards.push([id, h]);
    });
    this.state.players.forEach((player, sessionId) => {
      if (inAcid(player, PLAYER_SIZE / 2, pools)) this.hazardDamage(sessionId, player, (ACID.damagePerSecond * dtMs) / 1000, "acid", "true");
      const input = this.moveInputs.get(sessionId) ?? NO_INPUT;
      const moving = input.up || input.down || input.left || input.right;
      const shard = moving ? shardUnderfoot(player, PLAYER_SIZE / 2, shards) : undefined;
      if (shard) {
        this.state.hazards.delete(shard);
        this.hazardDamage(sessionId, player, SHARDS.damage, "shards", "physical");
        this.bleedMs.set(sessionId, BLEED.durationMs);
      }
      const bleed = tickBleed(this.bleedMs.get(sessionId) ?? 0, dtMs);
      this.bleedMs.set(sessionId, bleed.remainingMs);
      if (bleed.damage > 0) this.hazardDamage(sessionId, player, bleed.damage, "bleed", "true");
      if (player.bleeding !== bleed.remainingMs > 0) player.bleeding = bleed.remainingMs > 0;
    });
    const prev = this.lastTickMs || now - dtMs;
    this.lastTickMs = now;
    for (const pulse of this.pulses) {
      const state = this.state.hazards.get(pulse.id);
      const { charging, fired } = crystalPulse(prev, now, pulse.offsetMs);
      if (state && state.active !== charging) state.active = charging;
      if (!fired) continue;
      this.state.players.forEach((player, sessionId) => {
        if (Math.hypot(player.x - pulse.at.x, player.y - pulse.at.y) > CRYSTAL_PULSE.radius) return;
        this.hazardDamage(sessionId, player, CRYSTAL_PULSE.damage, "crystal", "magic");
        const next = moveWithCollision(this.level.grid, player, knockback(pulse.at, player), PLAYER_SIZE / 2);
        player.x = next.x;
        player.y = next.y;
      });
    }
  }

  private hazardDamage(sessionId: string, player: PlayerState, amount: number, hazard: HazardKind, type: DamageType) {
    this.damagePlayer(sessionId, player, amount, { kind: "hazard", hazard }, type);
  }

  // A luz fixa da run: as do mapa, as saídas (fracas inativas, fortes canalizando ou abertas) e as tochas acesas dos
  // goblins. Nenhuma atravessa parede.
  private rebuildLitMap() {
    const exitLights: LightSource[] = [];
    this.state.exits.forEach((exit) =>
      exitLights.push({ x: exit.x, y: exit.y, radius: exit.phase === "idle" ? EXIT_IDLE_LIGHT_RADIUS : EXIT_LIGHT_RADIUS }),
    );
    const torchLights: LightSource[] = [];
    this.state.torches.forEach((t) => {
      if (t.lit) torchLights.push({ x: t.x, y: t.y, radius: TORCH.lightRadius });
    });
    const { width, height, tileSize } = this.level.grid;
    this.lit = staticLitMap([...this.level.lights, ...exitLights, ...torchLights], width, height, tileSize, this.level.grid);
  }
}
