import Phaser from "phaser";
import { GNOME_CASTER, GOBLIN_THROW, MAGIC_BOLT, type Vec2 } from "shared";
import { LIGHT_KEY, type Light, type LightLook } from "./lighting";
import type { Particles } from "./particles";

// Projéteis do cajado (só desenho), desenhados como a Bola de Fogo do mago. Voo, parede e acerto são do servidor
// (MAGIC_BOLT, shared/src/projectile.ts); o cliente recebe posição e ângulo a cada tick e desenha:
// - a bola de fogo animada (fireball_sheet, FIREBALL_FPS) girada para o ângulo, andando na mesma reta entre um tick e
//   outro (extrapolado até EXTRAPOLATE_MS);
// - a luz laranja dela, do mesmo raio que o servidor usa para decidir o que enviar (regra 4), e um rastro de brasas;
// - no fim (done: bateu ou acabou o alcance), a explosão de brasas no ponto do impacto;
// - o clarão na ponta do cajado no disparo (flash).
// Brilham por cima da camada de luz (glowDepth): aparecem no escuro.
// Os mobs também atiram (kind): o gnomo, o projétil mágico ciano (weapons/projetil_magico); o goblin, a adaga girando
// no ar (mobs/efeitos/adaga-*). Mesmo voo, outro desenho.

export interface ProjectileView extends Vec2 {
  angle: number;
  done: boolean;
  kind?: string;
}

// O desenho de cada tipo de projétil: textura (animada ou não), escala, giro no ar (voltas/s; sem giro, aponta para
// onde voa), velocidade (para seguir na reta entre um tick e outro), luz e cores do rastro e do impacto.
interface BoltLook {
  texture: string;
  animated: boolean;
  origin: { x: number; y: number };
  scale: number;
  spin: number;
  speed: number;
  light?: { radius: number; look: LightLook };
  trail: readonly number[];
  explosion: readonly number[];
  flashColor?: number;
}

// A tira de 4 quadros de 64x64 (tools/assets/process_spells.py): a frente da cabeça em (56, 32) em todos; a origem
// fica no meio da cabeça, que é onde o servidor diz que o projétil está.
export const FIREBALL_KEY = "spells/fireball_sheet";
export const FIREBALL_FPS = 18;
const FIREBALL_ORIGIN = { x: 0.82, y: 0.5 };
const BOLT_COLOR = 0xff7b00;
const BOLT_LIGHT: LightLook = { color: BOLT_COLOR, intensity: 1, effect: "flicker" };
// Rastro e explosão: brasas laranja, amarelas e vermelhas.
const TRAIL_COLORS = [0xff7b00, 0xffc23d, 0xff4a1c, 0xffe28a];
const TRAIL_PER_SECOND = 70;
const EXPLOSION_COLORS = [0xff7b00, 0xffd36b, 0xff3b1a, 0xfff1c2];
// Entre dois ticks do servidor (50 ms), segue andando na reta; além disso, espera a próxima posição.
const EXTRAPOLATE_MS = 60;
// Clarão: brilho que cresce e apaga, e uma luz no lightmap pelo mesmo tempo.
const FLASH_MS = 150;
const FLASH_RADIUS = { cast: 22, impact: 34 };
const FLASH_LIGHT_RADIUS = { cast: 70, impact: 110 };
const GNOME_COLOR = 0x22d3ee;
const LOOKS: Record<string, BoltLook> = {
  "": {
    texture: FIREBALL_KEY,
    animated: true,
    origin: FIREBALL_ORIGIN,
    scale: 1,
    spin: 0,
    speed: MAGIC_BOLT.speed,
    light: { radius: MAGIC_BOLT.lightRadius, look: BOLT_LIGHT },
    trail: TRAIL_COLORS,
    explosion: EXPLOSION_COLORS,
    flashColor: BOLT_COLOR,
  },
  gnome: {
    texture: "weapons/projetil_magico",
    animated: false,
    origin: { x: 0.75, y: 0.5 },
    scale: 1,
    spin: 0,
    speed: GNOME_CASTER.boltSpeed,
    light: { radius: 64, look: { color: GNOME_COLOR, intensity: 0.9, effect: "flicker" } },
    trail: [0x22d3ee, 0x67e8f9, 0xa5f3fc, 0x0891b2],
    explosion: [0x22d3ee, 0xa5f3fc, 0xffffff, 0x0e7490],
    flashColor: GNOME_COLOR,
  },
  dagger: {
    texture: "mobs/efeitos/adaga-north",
    animated: false,
    origin: { x: 0.5, y: 0.5 },
    scale: 0.55,
    spin: 3,
    speed: GOBLIN_THROW.speed,
    trail: [],
    explosion: [0x9ca3af, 0xd1d5db, 0x6b7280],
  },
};

interface Flying {
  image: Phaser.GameObjects.Sprite;
  look: BoltLook;
  serverX: number;
  serverY: number;
  seenAt: number;
  exploded: boolean;
}

interface Flash {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  at: number;
  kind: keyof typeof FLASH_RADIUS;
}

export class Bolts {
  private flying = new Map<string, Flying>();
  private flashes: Flash[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: Particles | undefined,
    private readonly glowDepth: number,
  ) {}

  // Uma vez por quadro, com os projéteis que o servidor mandou (só os que este jogador vê).
  sync(projectiles: { forEach(callback: (bolt: ProjectileView, id: string) => void): void } | undefined, time: number, delta: number) {
    const seen = new Set<string>();
    projectiles?.forEach((bolt, id) => {
      seen.add(id);
      let fly = this.flying.get(id);
      if (!fly) {
        const look = LOOKS[bolt.kind ?? ""] ?? (LOOKS[""] as BoltLook);
        const image = this.scene.add.sprite(bolt.x, bolt.y, look.texture).setOrigin(look.origin.x, look.origin.y).setScale(look.scale);
        image.setDepth(this.glowDepth);
        if (look.animated && this.scene.anims.exists(look.texture)) image.play(look.texture);
        fly = { image, look, serverX: bolt.x, serverY: bolt.y, seenAt: time, exploded: false };
        this.flying.set(id, fly);
      }
      if (bolt.x !== fly.serverX || bolt.y !== fly.serverY) {
        fly.serverX = bolt.x;
        fly.serverY = bolt.y;
        fly.seenAt = time;
      }
      if (bolt.done) {
        if (!fly.exploded) this.explode(fly, bolt, time);
        return;
      }
      const ahead = (fly.look.speed * Math.min(time - fly.seenAt, EXTRAPOLATE_MS)) / 1000;
      const x = fly.serverX + Math.cos(bolt.angle) * ahead;
      const y = fly.serverY + Math.sin(bolt.angle) * ahead;
      const rotation = fly.look.spin ? (time / 1000) * fly.look.spin * Math.PI * 2 : bolt.angle;
      fly.image.setPosition(x, y).setRotation(rotation);
      this.trail(fly.look, x, y, bolt.angle, time, delta);
    });
    for (const [id, fly] of this.flying) {
      if (seen.has(id)) continue;
      fly.image.destroy();
      this.flying.delete(id);
    }
    this.updateFlashes(time);
  }

  // Clarão na ponta do cajado, no disparo.
  flash(x: number, y: number, time: number) {
    this.addFlash(x, y, time, "cast");
  }

  // Luzes deste quadro: a de cada projétil em voo e a dos clarões.
  lights(): Light[] {
    const lights: Light[] = [];
    for (const fly of this.flying.values()) {
      if (fly.exploded || !fly.look.light) continue;
      lights.push({ x: fly.image.x, y: fly.image.y, radius: fly.look.light.radius, look: fly.look.light.look, phase: 0, kind: "projetil" });
    }
    for (const f of this.flashes) {
      lights.push({ x: f.x, y: f.y, radius: FLASH_LIGHT_RADIUS[f.kind], look: BOLT_LIGHT, phase: 0, kind: "projetil" });
    }
    return lights;
  }

  destroy() {
    for (const fly of this.flying.values()) fly.image.destroy();
    for (const f of this.flashes) f.image.destroy();
    this.flying.clear();
    this.flashes = [];
  }

  private explode(fly: Flying, at: Vec2, time: number) {
    fly.exploded = true;
    fly.image.setVisible(false);
    this.particles?.explode(at.x, at.y, fly.look.explosion, time);
    if (fly.look.flashColor !== undefined) this.addFlash(at.x, at.y, time, "impact", fly.look.flashColor);
  }

  // Brasas soltas para trás, com um pouco de espalhamento (em média TRAIL_PER_SECOND por segundo).
  private trail(look: BoltLook, x: number, y: number, angle: number, time: number, delta: number) {
    if (!this.particles || look.trail.length === 0) return;
    const count = Math.floor((TRAIL_PER_SECOND * delta) / 1000 + Math.random());
    for (let i = 0; i < count; i++) {
      const back = angle + Math.PI + Phaser.Math.FloatBetween(-0.5, 0.5);
      const speed = Phaser.Math.FloatBetween(20, 60);
      const color = look.trail[Phaser.Math.Between(0, look.trail.length - 1)] ?? BOLT_COLOR;
      this.particles.spark(x, y + Phaser.Math.FloatBetween(-2, 2), color, Math.cos(back) * speed, Math.sin(back) * speed, Phaser.Math.Between(180, 320), time);
    }
  }

  private addFlash(x: number, y: number, time: number, kind: Flash["kind"], color = BOLT_COLOR) {
    const image = this.scene.add
      .image(x, y, LIGHT_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setDepth(this.glowDepth)
      .setScale(0);
    this.flashes.push({ image, x, y, at: time, kind });
  }

  private updateFlashes(time: number) {
    this.flashes = this.flashes.filter((f) => {
      const t = (time - f.at) / FLASH_MS;
      if (t >= 1) {
        f.image.destroy();
        return false;
      }
      const size = (2 * FLASH_RADIUS[f.kind]) / f.image.width;
      f.image.setScale(size * (0.6 + 0.4 * t)).setAlpha(1 - t);
      return true;
    });
  }
}
