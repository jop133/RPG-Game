import Phaser from "phaser";
import { ICE_BARRIER, type Vec2 } from "shared";
import magicArt from "../../assets/spells/magic.json";
import type { Light, LightLook } from "./lighting";
import type { Particles } from "./particles";

// Barreira de Gelo (só desenho; onde fica, o que bloqueia e a vida são do servidor, ICE_BARRIER). Cada uma chega como
// BarrierState (lugar, direção, vida, fase) e é desenhada assim:
// - ao surgir: o círculo de gelo (spells/circle_ice) no chão, girando e apagando em CIRCLE_MS, e a parede
//   (spells/ice_wall-<direção>, a da direção que veio) subindo do chão em RAISE_MS;
// - de pé: a parede com a barra de vida em cima; levou dano, pisca branca por FLASH_MS e solta cacos;
// - "broken": a parede some e toca a quebra (spells/ice_break-<direção>, os 9 quadros no tempo ICE_BARRIER.breakMs).
// Arte de tools/assets/process_magic.py, desenhada em SCALE (a parede ocupa ICE_BARRIER.cells tiles).

export interface BarrierView extends Vec2 {
  angle: number;
  hp: number;
  maxHp: number;
  phase: string;
}

const DIRECTIONS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
const SCALE = 1.5;
const CIRCLE_KEY = "spells/circle_ice";
const CIRCLE_SCALE = 1.8;
const CIRCLE_FLATTEN = 0.55;
const CIRCLE_MS = 900;
const RAISE_MS = 220;
const FLASH_MS = 90;
const ICE_COLOR = 0x7dd3fc;
const ICE_SHARDS = [0x7dd3fc, 0xe0f2fe, 0xbae6fd, 0xffffff];
const ICE_LOOK: LightLook = { color: ICE_COLOR, intensity: 0.7, effect: "steady" };
const ICE_LIGHT_RADIUS = 70;
// Barra de vida: largura, altura e quanto acima do meio da parede.
const BAR = { width: 40, height: 4, above: 40 };

interface Drawn {
  wall: Phaser.GameObjects.Image;
  circle: Phaser.GameObjects.Container;
  breaking?: Phaser.GameObjects.Sprite;
  direction: string;
  bornAt: number;
  flashAt: number;
  lastHp: number;
  phase: string;
  x: number;
  y: number;
}

function directionOf(angle: number): string {
  const octant = Math.round(angle / (Math.PI / 4));
  return DIRECTIONS[((octant % 8) + 8) % 8] ?? "south";
}

export class Barriers {
  private drawn = new Map<string, Drawn>();
  private readonly bars: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: Particles | undefined,
    private readonly groundDepth: number,
    private readonly sortDepth: (y: number) => number,
    barDepth: number,
  ) {
    this.bars = scene.add.graphics().setDepth(barDepth);
    const frameRate = (magicArt.iceBreak.frames * 1000) / ICE_BARRIER.breakMs;
    for (const direction of DIRECTIONS) {
      const key = `spells/ice_break-${direction}`;
      if (scene.anims.exists(key) || !scene.textures.exists(key)) continue;
      scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(key, {}), frameRate, repeat: 0 });
    }
  }

  sync(barriers: { forEach(callback: (barrier: BarrierView, id: string) => void): void } | undefined, time: number) {
    const seen = new Set<string>();
    this.bars.clear();
    barriers?.forEach((barrier, id) => {
      seen.add(id);
      const d = this.drawn.get(id) ?? this.create(id, barrier, time);
      if (barrier.hp < d.lastHp) this.hit(d, time);
      d.lastHp = barrier.hp;
      if (d.phase !== barrier.phase && barrier.phase === "broken") this.shatter(d, time);
      d.phase = barrier.phase;
      this.animate(d, barrier, time);
    });
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      this.clear(d);
      this.drawn.delete(id);
    }
  }

  // Um brilho frio em cada barreira de pé (desenho; a luz que decide o que é enviado é do servidor).
  lights(): Light[] {
    return [...this.drawn.values()]
      .filter((d) => d.phase === "up")
      .map((d) => ({ x: d.x, y: d.y, radius: ICE_LIGHT_RADIUS, look: ICE_LOOK, phase: 0, kind: "gelo" }));
  }

  destroy() {
    for (const d of this.drawn.values()) this.clear(d);
    this.drawn.clear();
    this.bars.destroy();
  }

  private create(id: string, barrier: BarrierView, time: number): Drawn {
    const direction = directionOf(barrier.angle);
    // A base da parede nos pés: o meio do tile da barreira, um pouco abaixo (a arte tem o pé perto da borda de baixo).
    const wall = this.scene.add
      .image(barrier.x, barrier.y + 12, `spells/ice_wall-${direction}`)
      .setOrigin(0.5, 0.85)
      .setScale(SCALE, 0)
      .setDepth(this.sortDepth(barrier.y + 12));
    const circleImage = this.scene.add.image(0, 0, CIRCLE_KEY).setBlendMode(Phaser.BlendModes.ADD);
    const circle = this.scene.add
      .container(barrier.x, barrier.y, [circleImage])
      .setScale(CIRCLE_SCALE, CIRCLE_SCALE * CIRCLE_FLATTEN)
      .setDepth(this.groundDepth + 0.01);
    this.particles?.explode(barrier.x, barrier.y, ICE_SHARDS, time);
    const d: Drawn = { wall, circle, direction, bornAt: time, flashAt: -Infinity, lastHp: barrier.hp, phase: barrier.phase, x: barrier.x, y: barrier.y };
    this.drawn.set(id, d);
    return d;
  }

  private hit(d: Drawn, time: number) {
    d.flashAt = time;
    this.particles?.explode(d.x, d.y - 16, ICE_SHARDS, time);
  }

  // Quebrou: a parede some e a animação da quebra toca no lugar dela.
  private shatter(d: Drawn, time: number) {
    d.wall.setVisible(false);
    const key = `spells/ice_break-${d.direction}`;
    d.breaking = this.scene.add.sprite(d.x, d.y + 12, key).setOrigin(0.5, 0.85).setScale(SCALE).setDepth(this.sortDepth(d.y + 12));
    if (this.scene.anims.exists(key)) d.breaking.play(key);
    this.particles?.explode(d.x, d.y - 10, ICE_SHARDS, time);
  }

  private animate(d: Drawn, barrier: BarrierView, time: number) {
    const age = time - d.bornAt;
    const circle = d.circle.list[0] as Phaser.GameObjects.Image | undefined;
    circle?.setRotation((time / 1000) * Math.PI);
    d.circle.setAlpha(Math.max(0, 1 - age / CIRCLE_MS));
    if (d.phase !== "up") return;
    d.wall.setScale(SCALE, SCALE * Math.min(1, age / RAISE_MS));
    if (time - d.flashAt < FLASH_MS) d.wall.setTintFill(0xffffff);
    else if (d.wall.isTinted) d.wall.clearTint();
    const top = d.y - BAR.above;
    const fraction = Math.max(0, barrier.hp / (barrier.maxHp || 1));
    this.bars.fillStyle(0x0b1220, 0.85).fillRect(d.x - BAR.width / 2 - 1, top - 1, BAR.width + 2, BAR.height + 2);
    this.bars.fillStyle(ICE_COLOR, 1).fillRect(d.x - BAR.width / 2, top, BAR.width * fraction, BAR.height);
  }

  private clear(d: Drawn) {
    d.wall.destroy();
    d.circle.destroy();
    d.breaking?.destroy();
  }
}
