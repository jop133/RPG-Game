import Phaser from "phaser";
import { FENRIR_CLAW, FIZBAN_ESCAPE, FIZBAN_POTIONS, GNOME_CASTER, KRAG_KICK, LIGHTNING_SPELL, PLAYER_SIZE, SPELL_FLATTEN, SWAMP_SPELL, type Vec2 } from "shared";
import magicArt from "../../assets/spells/magic.json";
import type { Light, LightLook } from "./lighting";
import type { Particles } from "./particles";

// Magias do mago no chão (só desenho; onde caem, quem é atingido e quem fica lento é do servidor). Cada uma chega como
// SpellState (tipo, lugar, fase) e é desenhada pela fase:
// - Raio Celestial: "warn" = o círculo do raio (spells/circle_lightning) girando no chão, achatado pela vista
//   (SPELL_FLATTEN), pulsando, com luz amarela; "strike" = o raio caindo no centro dele (lightning_bolt_sheet, 8
//   quadros no tempo da fase), clarão e um tremor de tela;
// - Pântano de Lama: "cast" = o círculo de terra (spells/circle_earth, já desenhado em perspectiva) crescendo;
//   "active" = o círculo embaixo e a poça borbulhando por cima (mud_pit_sheet, em laço), do tamanho da área.
// Arte de tools/assets/process_magic.py.
// - Erupção de Cristal (do gnomo): "warn" = o círculo mágico ciano (mobs/efeitos/circulo) achatado no chão, girando e
//   pulsando; "strike" = a estaca de cristal brota do chão (cresce de baixo para cima) com estilhaços e some no fim.
// - Chute Sísmico do Krag ("crack", fase "strike"): pedaços da rachadura (mobs/krag/crack-<direção>, na direção do
//   chute) brotando um atrás do outro ao longo da linha, na velocidade em que o servidor a faz andar (KRAG_KICK.speed),
//   até `length`; somem quando o servidor a tira.
// - Garras do Fenrir ("claw"): o golpe de garra (mobs/fenrir/clawfx-<direção>, em laço) correndo pela linha a
//   FENRIR_CLAW.speed até `length`, e apagando no fim.
// - Poções do Fizban ("potion-<efeito>"): "fall" = o círculo da cor no chão e o frasco caindo do céu; "cloud" = a fumaça
//   da cor (mobs/fizban/smoke-<efeito>, em laço) do tamanho da área, apagando no fim. "smoke-<efeito>": só a fumaça.
// Círculos e poça ficam na altura do chão (por baixo dos pés de todo mundo); o raio fica por cima de quem está ali.

export interface SpellView extends Vec2 {
  kind: string;
  phase: string;
  // Só a rachadura do Krag: a direção (radianos) e até onde ela vai (px).
  angle?: number;
  length?: number;
}

// A rachadura: um pedaço a cada CRACK_SPACING px, tocando a animação em CRACK_ANIM_MS.
const CRACK_SPACING = 48;
const CRACK_ANIM_MS = 450;
const CRACK_DIRECTIONS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
// Poções e fumaças do Fizban: a cor de cada efeito, de onde o frasco cai (px acima), o tamanho da fumaça (a arte tem
// ~45 px de largura) e o quanto ela apaga no fim.
const POTION_COLORS: Record<string, number> = { poison: 0x7ed957, burn: 0xff8a1f, frailty: 0x4a90ff };
const POTION_DROP_PX = 240;
const SMOKE_ART_PX = 45;
const SMOKE_FADE_MS = 500;
const CLAW_FADE_MS = 200;

const DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];
const square = (size: number) => ({ frameWidth: size, frameHeight: size });
// As folhas de quadros de assets/spells (o resto carrega como imagem).
export const SPELL_SHEETS: Record<string, { frameWidth: number; frameHeight: number }> = {
  "spells/fireball_sheet": square(64),
  "spells/lightning_bolt_sheet": square(magicArt.bolt.frame),
  "spells/mud_pit_sheet": square(magicArt.mud.frame),
  ...Object.fromEntries(DIRECTIONS.map((d) => [`spells/ice_break-${d}`, square(magicArt.iceBreak.frame)])),
};
const RUNE_LIGHTNING = "spells/circle_lightning";
const CIRCLE_EARTH = "spells/circle_earth";
export const STRIKE_KEY = "spells/lightning_bolt_sheet";
export const MUD_KEY = "spells/mud_pit_sheet";
export const MUD_FPS = 8;
// O raio toca os quadros todos no tempo da fase "strike".
export const STRIKE_FPS = magicArt.bolt.frames / (LIGHTNING_SPELL.strikeMs / 1000);
const STRIKE_ORIGIN = { x: 0.5, y: magicArt.bolt.feet / magicArt.bolt.frame };
const STRIKE_SCALE = 1.6;
// O círculo do raio do tamanho da área (a arte tem ~56 px de diâmetro); pulsa ±6% no aviso.
const RUNE_LIGHTNING_SCALE = (LIGHTNING_SPELL.radiusX * 2 + PLAYER_SIZE) / 56;
// Círculo de terra e poça: a largura da área (o círculo tem ~58 px de largura, a boca da poça ~60), achatados como o chão.
const EARTH_SCALE = (SWAMP_SPELL.radiusX * 2) / 58;
const MUD_SCALE = (SWAMP_SPELL.radiusX * 2) / 60;
// Voltas por segundo do círculo do raio.
const RUNE_TURNS = 0.6;
const LIGHTNING_LOOK: LightLook = { color: 0xfacc15, intensity: 1, effect: "pulse" };
const STRIKE_LOOK: LightLook = { color: 0xfff6c8, intensity: 1, effect: "steady" };
const STRIKE_FLASH_RADIUS = 170;
const STRIKE_SHAKE_PX = 3;
// Lama nos pés de quem anda dentro da poça (em média, por segundo).
const MUD_PARTICLES_PER_SECOND = 14;
const MUD_COLORS = [0x5a4a2a, 0x6e5a32, 0x463820, 0x7d6a3e];
// Erupção de Cristal: o círculo (64 px, do tamanho da área) e a estaca (pés na linha 59 de 68), crescendo em GROW_MS.
const CRYSTAL_CIRCLE = "mobs/efeitos/circulo";
const CRYSTAL_SPIKE = "mobs/efeitos/cristal-south";
const CRYSTAL_ORIGIN = { x: 0.5, y: 59 / 68 };
const CRYSTAL_GROW_MS = 120;
// O círculo do tamanho de onde o cristal acerta de verdade: o raio da área mais meio jogador (feetInside conta quem
// encosta). A arte tem 64 px.
const CRYSTAL_CIRCLE_SCALE = ((GNOME_CASTER.crystalRadiusX + PLAYER_SIZE / 2) * 2) / 64;
const CRYSTAL_TURNS = 0.5;
const CRYSTAL_COLOR = 0x22d3ee;
const CRYSTAL_LOOK: LightLook = { color: CRYSTAL_COLOR, intensity: 0.9, effect: "pulse" };
const CRYSTAL_SHARDS = [0x22d3ee, 0xa5f3fc, 0x67e8f9, 0xffffff];

interface Drawn {
  kind: string;
  phase: string;
  phaseAt: number;
  rune?: Phaser.GameObjects.Container;
  runeImage?: Phaser.GameObjects.Image;
  earth?: Phaser.GameObjects.Image;
  strike?: Phaser.GameObjects.Sprite;
  mud?: Phaser.GameObjects.Sprite;
  spike?: Phaser.GameObjects.Image;
  crack?: { pieces: Phaser.GameObjects.Sprite[]; angle: number; length: number };
  flask?: Phaser.GameObjects.Image;
  warning?: Phaser.GameObjects.Ellipse;
  smoke?: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
}

export class SpellEffects {
  private drawn = new Map<string, Drawn>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: Particles | undefined,
    private readonly groundDepth: number,
    private readonly sortDepth: (y: number) => number,
    private readonly onStrike: (amplitude: number) => void,
  ) {}

  sync(spells: { forEach(callback: (spell: SpellView, id: string) => void): void } | undefined, time: number) {
    const seen = new Set<string>();
    spells?.forEach((spell, id) => {
      seen.add(id);
      let d = this.drawn.get(id);
      if (!d) {
        d = { kind: spell.kind, phase: "", phaseAt: time, x: spell.x, y: spell.y };
        this.drawn.set(id, d);
      }
      if ((d.kind === "crack" || d.kind === "claw") && !d.crack) d.crack = { pieces: [], angle: spell.angle ?? 0, length: spell.length ?? 0 };
      if (d.phase !== spell.phase) this.enter(d, spell.phase, time);
      this.animate(d, time);
    });
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      this.clear(d);
      this.drawn.delete(id);
    }
  }

  // Luzes deste quadro: o círculo do raio pulsando no aviso e o clarão na queda.
  lights(): Light[] {
    const lights: Light[] = [];
    for (const d of this.drawn.values()) {
      if (d.kind === "crystal") {
        lights.push({ x: d.x, y: d.y, radius: d.phase === "strike" ? 120 : 80, look: CRYSTAL_LOOK, phase: 0, kind: "cristal" });
        continue;
      }
      if (d.kind !== "lightning") continue;
      const look = d.phase === "strike" ? STRIKE_LOOK : LIGHTNING_LOOK;
      const radius = d.phase === "strike" ? STRIKE_FLASH_RADIUS : LIGHTNING_SPELL.lightRadius;
      lights.push({ x: d.x, y: d.y, radius, look, phase: 0, kind: "raio" });
    }
    return lights;
  }

  // Poças ativas agora, para a lama nos pés (a lentidão de verdade é do servidor).
  activeSwamps(): Vec2[] {
    return [...this.drawn.values()].filter((d) => d.kind === "swamp" && d.phase === "active").map((d) => ({ x: d.x, y: d.y }));
  }

  // Quem anda com os pés numa poça solta lama (feet: o ponto dos pés no mundo).
  mudStep(feet: Vec2, time: number, delta: number) {
    if (!this.particles || Math.random() > (MUD_PARTICLES_PER_SECOND * delta) / 1000) return;
    const color = MUD_COLORS[Phaser.Math.Between(0, MUD_COLORS.length - 1)] ?? 0x5a4a2a;
    const vx = Phaser.Math.FloatBetween(-40, 40);
    this.particles.spark(feet.x + Phaser.Math.FloatBetween(-5, 5), feet.y - 1, color, vx, Phaser.Math.FloatBetween(-70, -30), 260, time);
  }

  destroy() {
    for (const d of this.drawn.values()) this.clear(d);
    this.drawn.clear();
  }

  private enter(d: Drawn, phase: string, time: number) {
    d.phase = phase;
    d.phaseAt = time;
    if (d.kind === "crack" || d.kind === "claw") return;
    if (d.kind.startsWith("potion-") || d.kind.startsWith("smoke-")) {
      this.enterPotion(d, phase, time);
      return;
    }
    if (d.kind === "crystal") {
      this.enterCrystal(d, phase, time);
      return;
    }
    if (phase === "warn") {
      d.runeImage = this.scene.add.image(0, 0, RUNE_LIGHTNING);
      d.rune = this.scene.add.container(d.x, d.y, [d.runeImage]).setScale(RUNE_LIGHTNING_SCALE, RUNE_LIGHTNING_SCALE * SPELL_FLATTEN).setDepth(this.groundDepth + 0.01);
    }
    if (phase === "cast") {
      d.earth = this.scene.add.image(d.x, d.y, CIRCLE_EARTH).setDepth(this.groundDepth);
    }
    if (phase === "strike") {
      d.strike = this.scene.add
        .sprite(d.x, d.y, STRIKE_KEY)
        .setOrigin(STRIKE_ORIGIN.x, STRIKE_ORIGIN.y)
        .setScale(STRIKE_SCALE)
        .setDepth(this.sortDepth(d.y + 1));
      if (this.scene.anims.exists(STRIKE_KEY)) d.strike.play(STRIKE_KEY);
      this.particles?.explode(d.x, d.y, [0xfff6c8, 0xfacc15, 0xffffff, 0xffe066], time);
      this.onStrike(STRIKE_SHAKE_PX);
    }
    if (phase === "active") {
      d.earth?.setScale(EARTH_SCALE * 1.08, EARTH_SCALE * 1.08 * SPELL_FLATTEN);
      d.mud = this.scene.add.sprite(d.x, d.y, MUD_KEY).setScale(MUD_SCALE, MUD_SCALE * SPELL_FLATTEN).setDepth(this.groundDepth + 0.005);
      if (this.scene.anims.exists(MUD_KEY)) d.mud.play(MUD_KEY);
    }
  }

  // O círculo no aviso; no "strike", a estaca brota no meio dele com estilhaços, e o círculo apaga.
  private enterCrystal(d: Drawn, phase: string, time: number) {
    if (phase === "warn") {
      d.runeImage = this.scene.add.image(0, 0, CRYSTAL_CIRCLE).setBlendMode(Phaser.BlendModes.ADD);
      d.rune = this.scene.add.container(d.x, d.y, [d.runeImage]).setScale(1, SPELL_FLATTEN).setDepth(this.groundDepth + 0.01);
      return;
    }
    if (phase !== "strike") return;
    d.spike = this.scene.add.image(d.x, d.y, CRYSTAL_SPIKE).setOrigin(CRYSTAL_ORIGIN.x, CRYSTAL_ORIGIN.y).setScale(1, 0).setDepth(this.sortDepth(d.y + 1));
    this.particles?.explode(d.x, d.y - 10, CRYSTAL_SHARDS, time);
    this.onStrike(2);
  }

  private animateCrystal(d: Drawn, time: number) {
    const t = time - d.phaseAt;
    if (d.runeImage && d.rune) {
      d.runeImage.setRotation(2 * Math.PI * CRYSTAL_TURNS * (time / 1000));
      const pulse = CRYSTAL_CIRCLE_SCALE * (0.92 + 0.08 * Math.sin(time / 70));
      d.rune.setScale(pulse, pulse * SPELL_FLATTEN);
      if (d.phase === "strike") d.rune.setAlpha(Math.max(0, 1 - t / 300));
    }
    if (!d.spike) return;
    d.spike.setScale(1, Math.min(1, t / CRYSTAL_GROW_MS));
    // Nos últimos 150 ms, estilhaça: some e solta cacos.
    const left = GNOME_CASTER.crystalShowMs - t;
    if (left < 150) d.spike.setAlpha(Math.max(0, left / 150));
    if (left < 150 && d.spike.visible && d.spike.alpha < 0.5) {
      this.particles?.explode(d.x, d.y - 24, CRYSTAL_SHARDS, time);
      d.spike.setVisible(false);
    }
  }

  // A rachadura brota pedaço por pedaço, na velocidade dela, até o fim da linha.
  private animateCrack(d: Drawn, time: number) {
    const crack = d.crack;
    if (!crack) return;
    const reached = Math.min(crack.length, (KRAG_KICK.speed * (time - d.phaseAt)) / 1000);
    const octant = Math.round(crack.angle / (Math.PI / 4));
    const key = `mobs/krag/crack-${CRACK_DIRECTIONS[((octant % 8) + 8) % 8] ?? "east"}`;
    while ((crack.pieces.length + 0.5) * CRACK_SPACING <= reached + CRACK_SPACING / 2 && this.scene.textures.exists(key)) {
      const along = (crack.pieces.length + 0.5) * CRACK_SPACING;
      const x = d.x + Math.cos(crack.angle) * along;
      const y = d.y + Math.sin(crack.angle) * along;
      const piece = this.scene.add.sprite(x, y, key).setDepth(this.groundDepth + 0.02);
      if (this.scene.anims.exists(key)) piece.play({ key, duration: CRACK_ANIM_MS });
      crack.pieces.push(piece);
      this.particles?.explode(x, y, [0x5c4a3a, 0x8a7560, 0x3b2f25], time);
    }
  }

  // Frasco caindo: o círculo da cor no chão e o frasco descendo do céu. Fumaça: a da cor, do tamanho da área.
  private enterPotion(d: Drawn, phase: string, time: number) {
    const effect = d.kind.slice(d.kind.indexOf("-") + 1);
    const color = POTION_COLORS[effect] ?? 0xffffff;
    const radius = d.kind.startsWith("potion-") ? FIZBAN_POTIONS.radius : FIZBAN_ESCAPE.smokeRadius;
    if (phase === "fall") {
      d.warning = this.scene.add.ellipse(d.x, d.y, radius * 2, radius * 2 * SPELL_FLATTEN, color, 0.3).setStrokeStyle(2, color, 0.9).setDepth(this.groundDepth + 0.01);
      d.flask = this.scene.add.image(d.x, d.y - POTION_DROP_PX, `mobs/fizban/flask-${effect}`).setScale(0.7).setDepth(this.sortDepth(d.y + 1));
      return;
    }
    if (phase !== "cloud") return;
    d.warning?.destroy();
    d.warning = undefined;
    d.flask?.destroy();
    d.flask = undefined;
    const key = `mobs/fizban/smoke-${effect}`;
    const scale = ((radius * 2) / SMOKE_ART_PX) * 1.15;
    d.smoke = this.scene.add.sprite(d.x, d.y + radius * 0.3, key).setOrigin(0.5, 0.8).setScale(scale).setDepth(this.sortDepth(d.y + 2));
    if (this.scene.anims.exists(key)) d.smoke.play(key);
    this.particles?.explode(d.x, d.y - 8, [color, 0xffffff, color], time);
  }

  private animatePotion(d: Drawn, time: number) {
    const t = time - d.phaseAt;
    if (d.flask) {
      const p = Math.min(1, t / FIZBAN_POTIONS.fallMs);
      d.flask.setPosition(d.x, d.y - POTION_DROP_PX * (1 - p * p)).setRotation(p * Math.PI * 3);
      d.warning?.setFillStyle(d.warning.fillColor, 0.2 + 0.2 * p);
    }
    if (d.smoke) {
      const left = FIZBAN_POTIONS.cloudMs - t;
      d.smoke.setAlpha(Math.max(0, Math.min(0.9, left / SMOKE_FADE_MS)));
    }
  }

  // O golpe de garra do Fenrir: um sprite só correndo pela linha; no fim, apaga.
  private animateClaw(d: Drawn, time: number) {
    const crack = d.crack;
    if (!crack) return;
    const octant = Math.round(crack.angle / (Math.PI / 4));
    const key = `mobs/fenrir/clawfx-${CRACK_DIRECTIONS[((octant % 8) + 8) % 8] ?? "east"}`;
    if (crack.pieces.length === 0) {
      if (!this.scene.textures.exists(key)) return;
      const piece = this.scene.add.sprite(d.x, d.y, key).setScale(1.4).setDepth(this.sortDepth(d.y + 1));
      if (this.scene.anims.exists(key)) piece.play(key);
      crack.pieces.push(piece);
    }
    const piece = crack.pieces[0];
    if (!piece) return;
    const travel = (FENRIR_CLAW.speed * (time - d.phaseAt)) / 1000;
    const along = Math.min(crack.length, travel);
    piece.setPosition(d.x + Math.cos(crack.angle) * along, d.y + Math.sin(crack.angle) * along - 10);
    if (travel > crack.length) piece.setAlpha(Math.max(0, 1 - ((travel - crack.length) / FENRIR_CLAW.speed) * (1000 / CLAW_FADE_MS)));
  }

  private animate(d: Drawn, time: number) {
    if (d.kind === "crack") return this.animateCrack(d, time);
    if (d.kind === "claw") return this.animateClaw(d, time);
    if (d.flask || d.smoke) return this.animatePotion(d, time);
    if (d.kind === "crystal") return this.animateCrystal(d, time);
    const t = (time - d.phaseAt) / 1000;
    if (d.runeImage && d.rune) {
      d.runeImage.setRotation(2 * Math.PI * RUNE_TURNS * (time / 1000));
      if (d.phase === "warn") {
        const pulse = RUNE_LIGHTNING_SCALE * (0.94 + 0.06 * Math.sin(time / 60));
        d.rune.setScale(pulse, pulse * SPELL_FLATTEN).setAlpha(0.8 + 0.2 * Math.sin(time / 60));
      }
    }
    if (d.earth && d.phase === "cast") {
      // Conjuração do pântano: o círculo de terra cresce até o tamanho da poça.
      const k = EARTH_SCALE * (0.4 + 0.6 * Math.min(1, t / (SWAMP_SPELL.castMs / 1000)));
      d.earth.setScale(k, k * SPELL_FLATTEN);
    }
    if (d.rune && d.phase === "strike") {
      // O círculo do raio some enquanto o raio cai.
      d.rune.setAlpha(Math.max(0, 1 - t / (LIGHTNING_SPELL.strikeMs / 1000)));
    }
    if (d.mud) {
      // A poça entra e sai com um fade curto (o fim vem do tempo da fase; o servidor a tira em seguida).
      const fade = 0.25;
      const left = SWAMP_SPELL.durationMs / 1000 - t;
      const alpha = Math.max(0, Math.min(1, t / fade, left / fade));
      d.mud.setAlpha(alpha);
      d.earth?.setAlpha(Math.min(alpha, 0.85));
    }
  }

  private clear(d: Drawn) {
    d.spike?.destroy();
    for (const piece of d.crack?.pieces ?? []) piece.destroy();
    d.flask?.destroy();
    d.warning?.destroy();
    d.smoke?.destroy();
    d.rune?.destroy();
    d.earth?.destroy();
    d.strike?.destroy();
    d.mud?.destroy();
  }
}
