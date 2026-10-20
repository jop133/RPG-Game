import Phaser from "phaser";
import { LIGHTNING_SPELL, SPELL_FLATTEN, SWAMP_SPELL, type Vec2 } from "shared";
import spellArt from "../../assets/spells/spells.json";
import type { Light, LightLook } from "./lighting";
import type { Particles } from "./particles";

// Magias do mago no chão (só desenho; onde caem, quem é atingido e quem fica lento é do servidor). Cada uma chega como
// SpellState (tipo, lugar, fase) e é desenhada pela fase:
// - Raio Celestial: "warn" = o círculo rúnico amarelo girando no chão, achatado pela vista (SPELL_FLATTEN), com luz
//   amarela pulsando; "strike" = os 4 quadros do raio cravados no centro do círculo, clarão e um tremor de tela;
// - Pântano de Lama: "cast" = o círculo de terra girando e crescendo; "active" = a poça borbulhando no chão.
// Círculos e poça ficam na altura do chão (por baixo dos pés de todo mundo); o raio fica por cima de quem está ali.

export interface SpellView extends Vec2 {
  kind: string;
  phase: string;
}

export const SPELL_SHEETS = {
  "spells/fireball_sheet": { frameWidth: 64, frameHeight: 64 },
  "spells/lightning_strike_sheet": { frameWidth: 64, frameHeight: 128 },
  "spells/mud_swamp_sheet": { frameWidth: 128, frameHeight: 64 },
} as const;
const RUNE_LIGHTNING = "spells/rune_circle_lightning";
const RUNE_SWAMP = "spells/rune_circle_swamp";
export const STRIKE_KEY = "spells/lightning_strike_sheet";
export const MUD_KEY = "spells/mud_swamp_sheet";
export const MUD_FPS = 8;
// O raio toca os 4 quadros no tempo da fase "strike".
export const STRIKE_FPS = 4 / (LIGHTNING_SPELL.strikeMs / 1000);
const STRIKE_ORIGIN = { x: 0.5, y: 0.92 };
// A poça: o centro da elipse (spells.json) é a origem, cravada no lugar da magia.
const MUD_ORIGIN = { x: (spellArt.mudCenter[0] ?? 64) / 128, y: (spellArt.mudCenter[1] ?? 40) / 64 };
// Voltas por segundo dos círculos.
const RUNE_TURNS = { lightning: 0.6, swamp: -0.35 };
const LIGHTNING_LOOK: LightLook = { color: 0xfacc15, intensity: 1, effect: "pulse" };
const STRIKE_LOOK: LightLook = { color: 0xfff6c8, intensity: 1, effect: "steady" };
const STRIKE_FLASH_RADIUS = 170;
const STRIKE_SHAKE_PX = 3;
// Lama nos pés de quem anda dentro da poça (em média, por segundo).
const MUD_PARTICLES_PER_SECOND = 14;
const MUD_COLORS = [0x5a4a2a, 0x6e5a32, 0x463820, 0x7d6a3e];

interface Drawn {
  kind: string;
  phase: string;
  phaseAt: number;
  rune?: Phaser.GameObjects.Container;
  runeImage?: Phaser.GameObjects.Image;
  strike?: Phaser.GameObjects.Sprite;
  mud?: Phaser.GameObjects.Sprite;
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
    if (phase === "warn" || phase === "cast") {
      const key = d.kind === "lightning" ? RUNE_LIGHTNING : RUNE_SWAMP;
      d.runeImage = this.scene.add.image(0, 0, key);
      d.rune = this.scene.add.container(d.x, d.y, [d.runeImage]).setScale(1, SPELL_FLATTEN).setDepth(this.groundDepth + 0.01);
    }
    if (phase === "strike") {
      d.strike = this.scene.add.sprite(d.x, d.y, STRIKE_KEY).setOrigin(STRIKE_ORIGIN.x, STRIKE_ORIGIN.y).setDepth(this.sortDepth(d.y + 1));
      if (this.scene.anims.exists(STRIKE_KEY)) d.strike.play(STRIKE_KEY);
      this.particles?.explode(d.x, d.y, [0xfff6c8, 0xfacc15, 0xffffff, 0xffe066], time);
      this.onStrike(STRIKE_SHAKE_PX);
    }
    if (phase === "active") {
      d.rune?.destroy();
      d.rune = undefined;
      d.mud = this.scene.add.sprite(d.x, d.y, MUD_KEY).setOrigin(MUD_ORIGIN.x, MUD_ORIGIN.y).setDepth(this.groundDepth);
      if (this.scene.anims.exists(MUD_KEY)) d.mud.play(MUD_KEY);
    }
  }

  private animate(d: Drawn, time: number) {
    const t = (time - d.phaseAt) / 1000;
    if (d.runeImage) {
      const turns = d.kind === "lightning" ? RUNE_TURNS.lightning : RUNE_TURNS.swamp;
      d.runeImage.setRotation(2 * Math.PI * turns * (time / 1000));
    }
    if (d.rune && d.phase === "cast") {
      // Conjuração do pântano: o círculo cresce até o tamanho da poça.
      const p = Math.min(1, t / (SWAMP_SPELL.castMs / 1000));
      d.rune.setScale(0.4 + 0.6 * p, (0.4 + 0.6 * p) * SPELL_FLATTEN);
    }
    if (d.rune && d.phase === "strike") {
      // O círculo do raio some enquanto o raio cai.
      d.rune.setAlpha(Math.max(0, 1 - t / (LIGHTNING_SPELL.strikeMs / 1000)));
    }
    if (d.mud) {
      // A poça entra e sai com um fade curto (o fim vem do tempo da fase; o servidor a tira em seguida).
      const fade = 0.25;
      const left = SWAMP_SPELL.durationMs / 1000 - t;
      d.mud.setAlpha(Math.max(0, Math.min(1, t / fade, left / fade)));
    }
  }

  private clear(d: Drawn) {
    d.rune?.destroy();
    d.strike?.destroy();
    d.mud?.destroy();
  }
}
