import Phaser from "phaser";

// Partículas (só desenho). Quadradinhos de 1 pixel de textura ampliados, nítidos como o resto da arte:
// - gotas de impacto: saltam do mob atingido e caem (sangue escuro; ácido verde no slime);
// - esporos: pontinhos ciano subindo devagar perto de cristais, minério e cogumelos;
// - espiral: faíscas roxas subindo em volta dos portais.
// Esporos e espiral brilham (soma de cor) por cima da camada de luz: aparecem mesmo no escuro.

const PIXEL_KEY = "pixel";

type Motion = "drop" | "drift" | "spiral";

interface Particle {
  image: Phaser.GameObjects.Image;
  motion: Motion;
  born: number;
  life: number;
  vx: number;
  vy: number;
  // Só na espiral: centro, ângulo e raio da volta.
  cx: number;
  cy: number;
  angle: number;
  radius: number;
}

const DROP_GRAVITY = 420; // px/s²
const DROP_COUNT = { min: 5, max: 10 };
const SPIRAL_TURNS_PER_SECOND = 0.9;
const SPIRAL_RISE = 38; // px/s
// Limite de partículas vivas: se muita coisa acontecer junto, as novas esperam vaga.
const MAX_PARTICLES = 400;

export class Particles {
  private items: Particle[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly glowDepth: number,
  ) {
    if (!scene.textures.exists(PIXEL_KEY)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1).generateTexture(PIXEL_KEY, 1, 1);
      g.destroy();
    }
  }

  // Gotas saltando do ponto atingido, para longe de quem bateu (awayX, awayY), em leque. depth: na frente do mob.
  burst(x: number, y: number, colors: readonly number[], awayX: number, awayY: number, depth: number, time: number) {
    const base = Math.atan2(awayY, awayX) || -Math.PI / 2;
    const count = Phaser.Math.Between(DROP_COUNT.min, DROP_COUNT.max);
    for (let i = 0; i < count; i++) {
      const angle = base + Phaser.Math.FloatBetween(-0.9, 0.9);
      const speed = Phaser.Math.FloatBetween(60, 150);
      const color = colors[i % colors.length] ?? 0xffffff;
      this.add(x, y, color, Phaser.Math.Between(2, 3), depth, false, {
        motion: "drop",
        life: Phaser.Math.Between(300, 550),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 70,
        time,
      });
    }
  }

  spore(x: number, y: number, color: number, time: number) {
    this.add(x, y, color, 3, this.glowDepth, true, {
      motion: "drift",
      life: Phaser.Math.Between(2200, 3800),
      vx: Phaser.Math.FloatBetween(-6, 6),
      vy: Phaser.Math.FloatBetween(-18, -7),
      time,
    });
  }

  spiral(cx: number, cy: number, color: number, time: number) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const radius = Phaser.Math.FloatBetween(14, 26);
    const particle = this.add(cx, cy, color, 3, this.glowDepth, true, { motion: "spiral", life: 1600, vx: 0, vy: 0, time });
    if (!particle) return;
    particle.cx = cx;
    particle.cy = cy;
    particle.angle = angle;
    particle.radius = radius;
  }

  update(time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.items = this.items.filter((p) => {
      const age = time - p.born;
      if (age >= p.life) {
        p.image.destroy();
        return false;
      }
      const t = age / p.life;
      if (p.motion === "drop") {
        p.vy += DROP_GRAVITY * dt;
        p.image.x += p.vx * dt;
        p.image.y += p.vy * dt;
        p.image.setAlpha(1 - t * t);
      } else if (p.motion === "drift") {
        p.image.x += (p.vx + Math.sin((time + p.born) / 400) * 4) * dt;
        p.image.y += p.vy * dt;
        p.image.setAlpha(Math.sin(Math.PI * t)); // acende e apaga devagar
      } else {
        // Espiral: dá voltas, sobe e abre um pouco o raio.
        p.angle += SPIRAL_TURNS_PER_SECOND * Math.PI * 2 * dt;
        const r = p.radius * (1 + 0.5 * t);
        p.image.setPosition(p.cx + Math.cos(p.angle) * r, p.cy - SPIRAL_RISE * (age / 1000) + Math.sin(p.angle) * r * 0.35);
        p.image.setAlpha(Math.sin(Math.PI * t));
      }
      return true;
    });
  }

  private add(
    x: number,
    y: number,
    color: number,
    size: number,
    depth: number,
    glow: boolean,
    spec: { motion: Motion; life: number; vx: number; vy: number; time: number },
  ): Particle | undefined {
    if (this.items.length >= MAX_PARTICLES) return undefined;
    const image = this.scene.add.image(x, y, PIXEL_KEY).setScale(size).setTint(color).setDepth(depth);
    if (glow) image.setBlendMode(Phaser.BlendModes.ADD);
    const particle: Particle = {
      image,
      motion: spec.motion,
      born: spec.time,
      life: spec.life,
      vx: spec.vx,
      vy: spec.vy,
      cx: x,
      cy: y,
      angle: 0,
      radius: 0,
    };
    this.items.push(particle);
    return particle;
  }
}
