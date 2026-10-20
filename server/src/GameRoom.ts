import { StateView } from "@colyseus/schema";
import { CloseCode, Room, type Client } from "colyseus";
import {
  AREAS,
  EXIT_LIGHT_RADIUS,
  EXITS_ACTIVE,
  MOB_SPAWN_SAFE_RADIUS,
  HUNGER_MAX,
  INVENTORY_SLOTS,
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
  isInsideExit,
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
  stepExtraction,
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
  type Equipment,
  type ExtractionResult,
  type FirstKillMessage,
  type Inventory,
  type ItemId,
  type ItemStack,
  type LightCarrier,
  type LitMap,
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
import { loadLevel } from "./level";
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
  mirrorEquipment,
  mirrorSkills,
} from "./state";
import { store } from "./store";
import { updateVisibility } from "./views";

// Ticks que um projétil parado continua no estado (ver spentBolts): 3 ticks = 150 ms, três patches.
const SPENT_BOLT_TICKS = 3;

const level = loadLevel(new URL("../../assets/maps/dungeon_floor1.json", import.meta.url));

// O que o servidor precisa saber de um mob para movê-lo, e que o cliente não precisa ver.
interface MobBrain {
  kind: MobKind;
  area: Area;
  homeCells: Vec2[];
  mind: MobMind;
}

// Projétil Mágico em voo, do lado do servidor: o voo (shared/src/projectile.ts), quem atirou (o mob atingido vai atrás
// dele; jogador e mob não acertam quem atirou) e o Dano Mágico de quem atirou no instante do disparo.
interface Bolt {
  flight: Projectile;
  owner: string;
  damage: number;
}

// Magia no chão, do lado do servidor: quem lançou, a fase e quanto falta dela, e o dano do raio (fixado no lançamento).
interface CastSpell {
  kind: SpellKind;
  owner: string;
  phase: "warn" | "strike" | "cast" | "active";
  remainingMs: number;
  damage: number;
}


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
  private extractProgress = new Map<string, number>();
  // Quem é cada sessão no banco.
  private characters = new Map<string, CharacterRecord>();
  // Essências absorvidas e os status que resultam delas e da arma (velocidade, dano, vida máxima, golpe).
  private essences = new Map<string, ItemId[]>();
  private stats = new Map<string, PlayerStats>();
  private mobBrains = new Map<string, MobBrain>();
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
    this.spawnMobs();
    this.openExits();
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onAuth(_client: Client, options: unknown): CharacterRecord {
    return admit(options);
  }

  onJoin(client: Client) {
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
      attackAngle: 0,
      hunger: HUNGER_MAX,
      extractMs: 0,
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
    this.inventories.delete(sessionId);
    this.equipment.delete(sessionId);
    this.extractProgress.delete(sessionId);
    const record = this.characters.get(sessionId);
    if (record) release(record);
    this.characters.delete(sessionId);
    this.essences.delete(sessionId);
    this.stats.delete(sessionId);
  }

  private openExits() {
    this.activeExits = pickActiveExits(level.exitCandidates, EXITS_ACTIVE, Math.random);
    this.activeExits.forEach((exit, i) => this.state.exits.set(`exit-${i + 1}`, new ExitState(exit)));
    const exitLights = this.activeExits.map((exit) => ({ ...exit, radius: EXIT_LIGHT_RADIUS }));
    const { width, height, tileSize } = level.grid;
    this.lit = staticLitMap([...level.lights, ...exitLights], width, height, tileSize);
  }

  // Só conta para quem está conectado: um corpo largado num portal não extrai sozinho.
  private updateExtraction(dtMs: number) {
    const done: string[] = [];
    this.state.players.forEach((player, sessionId) => {
      const connected = this.clients.getById(sessionId) !== undefined;
      const inside = connected && isInsideExit(player, this.activeExits);
      const step = stepExtraction(this.extractProgress.get(sessionId) ?? 0, inside, dtMs);
      this.extractProgress.set(sessionId, step.progressMs);
      player.extractMs = step.progressMs;
      if (step.done) done.push(sessionId);
    });
    for (const sessionId of done) this.extractPlayer(sessionId);
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
    this.setInventory(sessionId, player, result.gear.inventory);
    this.equipment.set(sessionId, result.gear.equipment);
    mirrorEquipment(player.equipment, result.gear.equipment);
    const before = this.statsOf(sessionId);
    const after = playerStats(this.essences.get(sessionId) ?? [], result.gear.equipment);
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
    const taken = damageTaken(amount, type, this.statsOf(sessionId));
    this.lastHurtMs.set(sessionId, this.clock.currentTime);
    player.hp = applyDamage(player.hp, taken);
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
    return pickSpawnPoint(level.playerEntryPoints, Math.random());
  }

  // O cliente só diz para onde golpeou. Recarga, quem foi atingido e dano são decididos aqui.
  private handleAttack(sessionId: string, message: unknown) {
    const angle = parseAttackAngle(message);
    const attacker = this.state.players.get(sessionId);
    const now = this.clock.currentTime;
    const stats = this.statsOf(sessionId);
    // Com cajado, o clique não faz nada por enquanto (pedido do dono do projeto): a Bola de Fogo é uma habilidade.
    if (stats.attack.weaponType === "staff") return;
    if (angle === undefined || !attacker || !isOffCooldown(this.lastAttackMs.get(sessionId), now, attackCooldownMs(stats))) return;
    this.lastAttackMs.set(sessionId, now);
    attacker.attackSeq += 1;
    attacker.attackAngle = angle;
    this.hitMobs(sessionId, attacker, angle);
    this.hitPlayers(sessionId, attacker, angle);
    this.resolveDeaths();
  }

  // Disparo: o projétil nasce no centro de quem atira e já anda até a ponta do cajado (pode bater ali mesmo).
  private fireBolt(owner: string, from: Vec2, angle: number, damage: number) {
    const id = `bolt-${this.nextBoltId++}`;
    this.state.projectiles.set(id, new ProjectileState({ x: from.x, y: from.y, angle, done: false }));
    this.bolts.set(id, { flight: { x: from.x, y: from.y, angle, traveled: 0 }, owner, damage });
    this.applyBoltStep(id, launchProjectile(from, angle, level.grid, this.boltTargets(owner)));
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
  // (spellTarget: no alcance, fora de parede). O lançamento conta como golpe (attackSeq): quem vê o mago desenha o
  // cajado inclinando para a mira.
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
      const at = spellTarget(caster, cast.target, level.grid);
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
    caster.attackSeq += 1;
    caster.attackAngle = angle;
    this.resolveDeaths();
  }

  // Cada tick: as fases andam (aviso → raio, conjuração → poça → fim) e a recarga de cada um desce no HUD.
  private tickSpells(dtMs: number) {
    for (const [id, spell] of this.spells) {
      spell.remainingMs -= dtMs;
      if (spell.remainingMs > 0) continue;
      const view = this.state.spells.get(id);
      if (spell.phase === "warn" && view) {
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

  // O raio cai: Dano Mágico em todos com os pés na área (mobs, que vão atrás de quem lançou, e os outros jogadores).
  private strikeLightning(spell: CastSpell, at: SpellState) {
    const area = lightningArea(at);
    const caster = this.state.players.get(spell.owner);
    const dead: string[] = [];
    this.state.mobs.forEach((mob, id) => {
      if (!feetInside(area, mob, MOB_KINDS[mob.kind as MobKind].size / 2)) return;
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
  private boltTargets(owner: string): ProjectileTarget[] {
    const targets: ProjectileTarget[] = [];
    this.state.mobs.forEach((mob, id) => targets.push({ id, x: mob.x, y: mob.y, radius: MOB_KINDS[mob.kind as MobKind].size / 2 }));
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
    for (const [id, bolt] of this.bolts) this.applyBoltStep(id, stepProjectile(bolt.flight, dtMs, level.grid, this.boltTargets(bolt.owner)));
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
    const { physicalDamage, attack } = this.statsOf(attackerId);
    this.state.mobs.forEach((mob, id) => {
      if (!isInSwing(attacker, angle, attack, mob, MOB_KINDS[mob.kind as MobKind].size / 2)) return;
      mob.hp = applyDamage(mob.hp, physicalDamage);
      if (mob.hp === 0) dead.push(id);
    });
    for (const id of dead) this.killMob(attackerId, id);
  }

  // Mob morto: larga o loot, conta para quem matou (se ainda estiver na sala) e sai.
  private killMob(killerId: string, id: string) {
    const mob = this.state.mobs.get(id);
    const killer = this.state.players.get(killerId);
    if (mob) {
      this.dropPile(mob, rollDrops(mob.kind as MobKind, Math.random));
      if (killer) this.creditKill(killerId, killer, mob.kind as MobKind);
    }
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

  private dropPile(at: Vec2, items: ItemStack[]) {
    if (items.length === 0) return;
    const id = `loot-${this.nextLootId++}`;
    this.lootPiles.set(id, items);
    this.state.loot.set(id, new LootState({ x: at.x, y: at.y }));
  }

  // F: pega da pilha mais próxima o que couber no inventário. O que não couber fica no chão.
  private handlePickup(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    if (!player || !inventory) return;
    const positions = new Map<string, Vec2>();
    this.state.loot.forEach((pile, id) => positions.set(id, pile));
    const id = nearestWithin(player, positions, PICKUP_RADIUS);
    const pile = id && this.lootPiles.get(id);
    if (!id || !pile) return;
    const result = takeFromPile(inventory, pile);
    this.setInventory(sessionId, player, result.inventory);
    if (result.pile.length > 0) {
      this.lootPiles.set(id, result.pile);
    } else {
      this.lootPiles.delete(id);
      this.state.loot.delete(id);
    }
  }

  // Fogo amigo: o golpe acerta qualquer outro jogador no arco.
  private hitPlayers(attackerId: string, attacker: Vec2, angle: number) {
    const { physicalDamage, attack } = this.statsOf(attackerId);
    this.state.players.forEach((player, sessionId) => {
      if (sessionId === attackerId || !isInSwing(attacker, angle, attack, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, physicalDamage, { kind: "player" }, "physical");
    });
  }

  // Uma vez, quando a sala nasce: cada área recebe os mobs de AREAS em tiles de chão sorteados.
  private spawnMobs() {
    let nextId = 1;
    for (const area of level.areas) {
      const cells = level.floorCells.get(area.name) ?? [];
      const counts = AREAS[area.name]?.mobs ?? {};
      // Nascem longe da chegada; depois vagam pela área inteira (homeCells continua sendo a área toda).
      const spawnCells = safeSpawnCells(cells, level.playerEntryPoints, MOB_SPAWN_SAFE_RADIUS);
      for (const { kind, position } of planMobSpawns(spawnCells, counts, Math.random)) {
        const id = `mob-${nextId++}`;
        this.state.mobs.set(id, new MobState({ kind, ...position, hp: MOB_KINDS[kind].maxHp, windup: false, attackAngle: 0 }));
        this.mobBrains.set(id, { kind, area, homeCells: cells, mind: { mode: "wander", wander: startIdle(Math.random) } });
      }
    }
  }

  private tick(dtMs: number) {
    this.movePlayers(dtMs);
    this.starvePlayers(dtMs);
    this.regeneratePlayers(dtMs);
    this.moveMobs(dtMs);
    this.moveBolts(dtMs);
    this.tickSpells(dtMs);
    this.resolveDeaths();
    this.updateExtraction(dtMs);
    this.updateViews();
  }

  private moveMobs(dtMs: number) {
    // A Furtividade de cada um encurta a distância em que os mobs o notam.
    const players = new Map<string, MobTarget>();
    this.state.players.forEach((player, sessionId) =>
      players.set(sessionId, { x: player.x, y: player.y, stealthPercent: this.statsOf(sessionId).stealthPercent }),
    );
    const swamps = this.activeSwamps();
    this.state.mobs.forEach((mob, id) => {
      const brain = this.mobBrains.get(id);
      if (!brain) return;
      // Na lama de um Pântano, o mob anda mais devagar (o mesmo passo, com a velocidade reduzida).
      const kind = MOB_KINDS[brain.kind];
      const slow = swampSlow(mob, kind.size / 2, id, swamps);
      const stats = slow === 1 ? kind : { ...kind, speed: kind.speed * slow };
      const thinking = { position: { x: mob.x, y: mob.y }, mind: brain.mind };
      // Longe de todos e só vagando: hiberna neste tick (nem pensa nem se move). Acorda bem antes de alguém chegar.
      if (isDormant(thinking, players)) return;
      const world = { grid: level.grid, home: brain.area, homeCells: brain.homeCells, stats, players };
      const next = stepMob(thinking, world, dtMs, Math.random);
      mob.x = next.position.x;
      mob.y = next.position.y;
      mob.windup = next.mind.mode === "windup";
      if (next.mind.mode === "windup") mob.attackAngle = next.mind.angle;
      brain.mind = next.mind;
      if (next.strike !== undefined) this.mobStrike(next.position, next.strike, brain.kind);
    });
  }

  // Golpe do mob: acerta todos os jogadores no arco travado, não só o alvo. Mob não fere mob.
  private mobStrike(origin: Vec2, angle: number, kind: MobKind) {
    const stats = MOB_KINDS[kind];
    const arc = mobStrikeArc(stats);
    this.state.players.forEach((player, sessionId) => {
      if (!isInArc(origin, angle, arc, player, PLAYER_SIZE / 2)) return;
      this.damagePlayer(sessionId, player, stats.attackDamage, { kind: "mob", mob: kind }, "physical");
    });
  }

  // Fome é tick do servidor (regra 6): cai para todos (mais devagar com Vigor), e quem está zerado perde vida.
  private starvePlayers(dtMs: number) {
    this.state.players.forEach((player, sessionId) => {
      player.hunger = tickHunger(player.hunger, dtMs, this.statsOf(sessionId).vigorPercent);
      const damage = starvationDamage(player.hunger, dtMs);
      if (damage > 0) this.damagePlayer(sessionId, player, damage, { kind: "starvation" }, "true");
    });
  }

  // Regeneração: vida que volta com o tempo, só depois de REGEN_DELAY_MS sem levar dano.
  private regeneratePlayers(dtMs: number) {
    const now = this.clock.currentTime;
    this.state.players.forEach((player, sessionId) => {
      const sinceHurt = now - (this.lastHurtMs.get(sessionId) ?? -Infinity);
      player.hp = regenerate(player.hp, this.statsOf(sessionId), dtMs, sinceHurt);
    });
  }

  private movePlayers(dtMs: number) {
    const swamps = this.activeSwamps();
    this.state.players.forEach((player, sessionId) => {
      // Na lama de um Pântano de outro jogador, anda mais devagar (na própria lama, não).
      const speed = (this.stats.get(sessionId)?.speed ?? PLAYER_SPEED) * swampSlow(player, PLAYER_SIZE / 2, sessionId, swamps);
      const delta = movementDelta(this.moveInputs.get(sessionId) ?? NO_INPUT, dtMs, speed);
      const next = moveWithCollision(level.grid, player, delta, PLAYER_SIZE / 2);
      player.x = next.x;
      player.y = next.y;
    });
  }

  // O próprio jogador entra na visão no onJoin e nunca sai; aqui só os outros e os mobs.
  // Jogadores, saídas e projéteis brilham: são vistos até o raio de visão. Mobs e pilhas só se estiverem na luz
  // (regra 4); a luz de cada jogador vai até a Percepção dele, e cada projétil carrega a sua (MAGIC_BOLT.lightRadius).
  private updateViews() {
    const carriers: LightCarrier[] = [];
    this.state.players.forEach((player, sessionId) =>
      carriers.push({ x: player.x, y: player.y, radius: this.statsOf(sessionId).lightRadius }),
    );
    this.state.projectiles.forEach((bolt) => carriers.push({ x: bolt.x, y: bolt.y, radius: MAGIC_BOLT.lightRadius }));
    this.state.spells.forEach((spell) => {
      if (spell.kind === "lightning") carriers.push({ x: spell.x, y: spell.y, radius: LIGHTNING_SPELL.lightRadius });
    });
    const lit = (entity: MobState | LootState, view: StateView) => isLit(entity, this.lit, carriers, view.has(entity));
    for (const client of this.clients) {
      const view = client.view;
      const self = this.state.players.get(client.sessionId);
      if (!view || !self) continue;
      this.state.players.forEach((other, sessionId) => {
        if (sessionId !== client.sessionId) updateVisibility(view, self, other);
      });
      this.state.mobs.forEach((mob) => updateVisibility(view, self, mob, lit(mob, view)));
      this.state.loot.forEach((pile) => updateVisibility(view, self, pile, lit(pile, view)));
      this.state.exits.forEach((exit) => updateVisibility(view, self, exit));
      this.state.projectiles.forEach((bolt) => updateVisibility(view, self, bolt));
      this.state.spells.forEach((spell) => updateVisibility(view, self, spell));
    }
  }
}
