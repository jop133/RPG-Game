import Phaser from "phaser";
import { CRYSTAL_PULSE, SHARDS, SPELL_FLATTEN, ACID, type Vec2, type ZoneId } from "shared";
import type { Light, LightLook } from "./lighting";
import type { Particles } from "./particles";

// Efeitos das zonas hostis (só desenho; o que acontece de verdade é do servidor):
// - perigos do chão: poças ácidas dos slimes mortos, estilhaços de cristal e o anel das descargas carregando (com o
//   clarão ao disparar);
// - os olhos dos goblins no breu (chegam do servidor só como pontos);
// - o clima da zona em volta da câmera: névoa verde e bolhas nos slimes, neve soprando na diagonal nos lobos;
// - gotas de sangue em quem sangra.

export interface HazardView extends Vec2 {
  kind: string;
  active: boolean;
}

const ACID_COLOR = 0x4f8a1c;
const ACID_EDGE = 0x2a4a10;
const SHARD_COLORS = [0x9ff6ff, 0x3fc4e8, 0x1f6f9a];
const PULSE_COLOR = 0x5fe3ff;
const PULSE_LOOK: LightLook = { color: 0x5fe3ff, intensity: 1, effect: "steady" };
const PULSE_FLASH_MS = 220;
const EYE_COLORS = [0xffd34d, 0xff5a3a];
// Partículas de clima por segundo, espalhadas pela tela.
const MIST_PER_SECOND = 16;
const SNOW_PER_SECOND = 45;
const BLEED_PER_SECOND = 7;

interface Flash {
  x: number;
  y: number;
  at: number;
}

export class ZoneEffects {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly eyes: Phaser.GameObjects.Graphics;
  private hazards: (HazardView & { id: string })[] = [];
  private lastActive = new Map<string, boolean>();
  private flashes: Flash[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: Particles | undefined,
    groundDepth: number,
    glowDepth: number,
  ) {
    this.ground = scene.add.graphics().setDepth(groundDepth);
    this.eyes = scene.add.graphics().setDepth(glowDepth).setBlendMode(Phaser.BlendModes.ADD);
  }

  // Perigos do chão que o servidor mandou: desenha os da tela; descarga que parou de carregar = disparou (clarão).
  syncHazards(hazards: { forEach(callback: (hazard: HazardView, id: string) => void): void } | undefined, time: number) {
    const list: (HazardView & { id: string })[] = [];
    hazards?.forEach((h, id) => {
      list.push({ id, kind: h.kind, x: h.x, y: h.y, active: h.active });
      if (h.kind === "pulse") {
        if (this.lastActive.get(id) && !h.active) this.fire(h, time);
        this.lastActive.set(id, h.active);
      }
    });
    this.hazards = list;
    this.drawGround(time);
    this.flashes = this.flashes.filter((f) => time - f.at < PULSE_FLASH_MS);
  }

  // Luzes deste quadro: o anel carregando e o clarão das descargas.
  lights(): Light[] {
    const lights: Light[] = [];
    for (const h of this.hazards) {
      if (h.kind === "pulse" && h.active) lights.push({ x: h.x, y: h.y, radius: CRYSTAL_PULSE.radius, look: PULSE_LOOK, phase: 0, kind: "descarga" });
    }
    for (const f of this.flashes) lights.push({ x: f.x, y: f.y, radius: CRYSTAL_PULSE.radius * 1.8, look: PULSE_LOOK, phase: 0, kind: "descarga" });
    return lights;
  }

  // Olhos dos goblins no breu: dois pontinhos brilhando na altura da cabeça (x, y do goblin; o par sai do servidor).
  drawEyes(points: readonly Vec2[], time: number) {
    const g = this.eyes;
    g.clear();
    for (const [i, p] of points.entries()) {
      const blink = Math.sin(time / 700 + i * 1.7) > 0.96 ? 0.15 : 1;
      const color = EYE_COLORS[i % EYE_COLORS.length] ?? 0xffd34d;
      g.fillStyle(color, blink);
      g.fillRect(p.x - 4, p.y - 22, 2, 2);
      g.fillRect(p.x + 2, p.y - 22, 2, 2);
      g.fillStyle(color, 0.25 * blink);
      g.fillCircle(p.x - 3, p.y - 21, 3);
      g.fillCircle(p.x + 3, p.y - 21, 3);
    }
  }

  // Clima em volta da câmera, pela zona de quem joga.
  weather(zone: ZoneId | undefined, view: Phaser.Geom.Rectangle, time: number, delta: number) {
    const p = this.particles;
    if (!p) return;
    const chance = (perSecond: number) => Math.floor((perSecond * delta) / 1000 + Math.random());
    if (zone === "slime") {
      // Névoa verde baixa e algumas bolhas subindo.
      for (let i = chance(MIST_PER_SECOND); i > 0; i--) {
        const x = Phaser.Math.FloatBetween(view.x, view.right);
        const y = Phaser.Math.FloatBetween(view.y + view.height * 0.3, view.bottom);
        p.flake(x, y, 0x6fae3a, Phaser.Math.FloatBetween(-8, 8), Phaser.Math.FloatBetween(-6, -2), Phaser.Math.Between(1800, 3200), 4, false, time);
      }
      if (Math.random() < delta / 400) {
        const x = Phaser.Math.FloatBetween(view.x, view.right);
        p.flake(x, Phaser.Math.FloatBetween(view.y, view.bottom), 0xb6f07a, 0, Phaser.Math.FloatBetween(-24, -12), 1200, 2, true, time);
      }
    } else if (zone === "lobo") {
      // Neve soprando na diagonal, de cima à esquerda.
      for (let i = chance(SNOW_PER_SECOND); i > 0; i--) {
        const x = Phaser.Math.FloatBetween(view.x - view.width * 0.3, view.right);
        const y = Phaser.Math.FloatBetween(view.y - 20, view.bottom);
        p.flake(x, y, 0xe6f3ff, Phaser.Math.FloatBetween(50, 90), Phaser.Math.FloatBetween(60, 110), Phaser.Math.Between(1400, 2400), Phaser.Math.Between(1, 2), true, time);
      }
    }
  }

  // Gotas de sangue de quem está sangrando.
  bleed(at: Vec2, time: number, delta: number) {
    if (!this.particles || Math.random() > (BLEED_PER_SECOND * delta) / 1000) return;
    this.particles.burst(at.x + Phaser.Math.FloatBetween(-4, 4), at.y - 18, [0x8a0f12, 0xb3191c], 0, 1, at.y + 1, time);
  }

  destroy() {
    this.ground.destroy();
    this.eyes.destroy();
  }

  private fire(at: Vec2, time: number) {
    this.flashes.push({ x: at.x, y: at.y, at: time });
    this.particles?.explode(at.x, at.y, [0x9ff6ff, 0x5fe3ff, 0xffffff], time);
  }

  private drawGround(time: number) {
    const g = this.ground;
    g.clear();
    const view = this.scene.cameras.main.worldView;
    for (const h of this.hazards) {
      if (!view.contains(h.x, h.y) && Phaser.Math.Distance.Between(h.x, h.y, view.centerX, view.centerY) > view.width) continue;
      if (h.kind === "acid") this.drawAcid(g, h, time);
      else if (h.kind === "shard") this.drawShard(g, h);
      else if (h.kind === "pulse") this.drawPulse(g, h, time);
    }
    for (const f of this.flashes) {
      const t = (time - f.at) / PULSE_FLASH_MS;
      g.lineStyle(3, 0xffffff, 1 - t);
      g.strokeEllipse(f.x, f.y, CRYSTAL_PULSE.radius * 2 * (0.8 + 0.4 * t), CRYSTAL_PULSE.radius * 2 * SPELL_FLATTEN * (0.8 + 0.4 * t));
    }
  }

  // Poça de lodo ácido: elipse verde-escura com borda e uma bolha que sobe e estoura.
  private drawAcid(g: Phaser.GameObjects.Graphics, h: Vec2, time: number) {
    const w = ACID.radius * 2;
    g.fillStyle(ACID_EDGE, 0.85);
    g.fillEllipse(h.x, h.y, w + 6, (w + 6) * SPELL_FLATTEN);
    g.fillStyle(ACID_COLOR, 0.85);
    g.fillEllipse(h.x, h.y, w, w * SPELL_FLATTEN);
    const bubble = (time / 600 + h.x) % 1;
    g.fillStyle(0xa6e05a, 0.9 * (1 - bubble));
    g.fillCircle(h.x - 6 + 10 * Math.sin(h.y), h.y - 2 - bubble * 3, 1 + 2 * bubble);
  }

  // Estilhaços: três lascas pontudas de cristal no chão.
  private drawShard(g: Phaser.GameObjects.Graphics, h: Vec2) {
    const r = SHARDS.radius;
    const spikes = [
      [-r * 0.6, 0, 4, 11],
      [0, 2, 5, 15],
      [r * 0.55, 1, 4, 9],
    ] as const;
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(h.x, h.y + 2, r * 2.2, r * 0.8);
    spikes.forEach(([dx, dy, half, height], i) => {
      g.fillStyle(SHARD_COLORS[i % SHARD_COLORS.length] ?? 0x9ff6ff, 1);
      g.fillTriangle(h.x + dx - half, h.y + dy, h.x + dx + half, h.y + dy, h.x + dx + half * 0.3, h.y + dy - height);
    });
  }

  // Cristal da descarga carregando: anel ciano no chão enchendo do centro para a borda.
  private drawPulse(g: Phaser.GameObjects.Graphics, h: HazardView, time: number) {
    if (!h.active) return;
    const r = CRYSTAL_PULSE.radius;
    const fill = 0.5 + 0.5 * Math.sin(time / 60);
    g.lineStyle(2, PULSE_COLOR, 0.9);
    g.strokeEllipse(h.x, h.y, r * 2, r * 2 * SPELL_FLATTEN);
    g.fillStyle(PULSE_COLOR, 0.12 + 0.12 * fill);
    g.fillEllipse(h.x, h.y, r * 2, r * 2 * SPELL_FLATTEN);
  }
}
