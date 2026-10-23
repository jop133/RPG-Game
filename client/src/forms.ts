import Phaser from "phaser";
import formsInfo from "../../assets/effects/forms.json";
import poseUrl from "../../assets/effects/bear_pose.png?url";
import primalUrl from "../../assets/effects/primal.png?url";
import type { Particles } from "./particles";

// Desenho das habilidades de forma (só desenho; quem decide é o servidor, PlayerState.spirit e PlayerState.form):
// - Espírito Elemental do elfo: flutua ao lado dele (um pouco para o lado e para trás de onde ele olha, subindo e
//   descendo devagar), seguindo com atraso suave; vira para as 8 direções junto com o elfo e toca a animação de
//   flutuar quando o elfo anda (parado, a arte parada). Na tecla da skill, um estouro de partículas da cor dele.
// - Forma de Urso do Homem-Fera: a pose (effects/bear_pose, só de frente) no lugar do corpo enquanto form =
//   "transforming"; no ápice dela e na volta ("reverting"), a explosão primal (effects/primal) cobrindo o corpo. O corpo
//   de Homem-Urso é a aparência "urso" (assets/characters/urso, como uma classe), escolhida em main.ts.
// Arte de tools/assets/process_forms.py.

export const POSE_KEY = "effects/bear_pose";
export const PRIMAL_KEY = "effects/primal";
// A pose em pé com os pés no mesmo lugar do corpo: a linha dos pés da arte (forms.json).
export const POSE_FEET = formsInfo.pose.feet / formsInfo.pose.frame;
const PRIMAL_FEET = formsInfo.primal.feet / formsInfo.primal.frame;
const PRIMAL_SCALE = 1.35;
const PRIMAL_FPS = 14;
// A explosão sai quando a pose chega a esta fração (o ápice).
export const POSE_APEX = 0.6;

const SPIRIT_URLS = Object.entries(
  import.meta.glob<string>("../../assets/spirits/*.png", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ key: path.slice(path.indexOf("spirits/"), -".png".length), url }));
const SPIRIT_FRAME = 68;
const SPIRIT_FPS = 1000 / 150;
const SPIRIT_SCALE = 0.55;
// Onde o espírito fica em relação aos pés do elfo: SIDE px para a direita de onde ele olha, BACK px para trás, HEIGHT
// px acima do chão, subindo e descendo BOB px num ciclo de BOB_MS. FOLLOW_MS: quanto ele demora para alcançar.
const SPIRIT_SIDE = 24;
const SPIRIT_BACK = 8;
const SPIRIT_HEIGHT = 34;
const SPIRIT_BOB = 3;
const SPIRIT_BOB_MS = 1600;
const SPIRIT_FOLLOW_MS = 110;
const SPIRIT_COLORS: Record<string, readonly number[]> = {
  water: [0x38bdf8, 0x7dd3fc, 0xe0f2fe, 0x0ea5e9],
  fire: [0xff7b00, 0xffc23d, 0xff4a1c, 0xffe28a],
  earth: [0xa16207, 0xfacc15, 0x78716c, 0xd6d3d1],
  wind: [0x4ade80, 0xbbf7d0, 0xffffff, 0x22c55e],
};
const DIRECTION_VECTORS: Record<string, { x: number; y: number }> = {
  east: { x: 1, y: 0 },
  "south-east": { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  south: { x: 0, y: 1 },
  "south-west": { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  west: { x: -1, y: 0 },
  "north-west": { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  north: { x: 0, y: -1 },
  "north-east": { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
};

export function loadFormAssets(scene: Phaser.Scene) {
  if (!scene.textures.exists(POSE_KEY)) {
    scene.load.spritesheet(POSE_KEY, poseUrl, { frameWidth: formsInfo.pose.frame, frameHeight: formsInfo.pose.frame });
  }
  if (!scene.textures.exists(PRIMAL_KEY)) {
    scene.load.spritesheet(PRIMAL_KEY, primalUrl, { frameWidth: formsInfo.primal.frame, frameHeight: formsInfo.primal.frame });
  }
  for (const { key, url } of SPIRIT_URLS) {
    if (scene.textures.exists(key)) continue;
    if (key.includes("-float-")) scene.load.spritesheet(key, url, { frameWidth: SPIRIT_FRAME, frameHeight: SPIRIT_FRAME });
    else scene.load.image(key, url);
  }
}

// A pose em `poseMs` (o tempo do servidor), a explosão uma vez e o flutuar dos espíritos em laço.
export function createFormAnimations(scene: Phaser.Scene, poseMs: number) {
  if (!scene.anims.exists(POSE_KEY) && scene.textures.exists(POSE_KEY)) {
    const frames = scene.anims.generateFrameNumbers(POSE_KEY, {});
    scene.anims.create({ key: POSE_KEY, frames, frameRate: (frames.length * 1000) / poseMs, repeat: 0 });
  }
  if (!scene.anims.exists(PRIMAL_KEY) && scene.textures.exists(PRIMAL_KEY)) {
    scene.anims.create({ key: PRIMAL_KEY, frames: scene.anims.generateFrameNumbers(PRIMAL_KEY, {}), frameRate: PRIMAL_FPS, repeat: 0 });
  }
  for (const { key } of SPIRIT_URLS) {
    if (!key.includes("-float-") || scene.anims.exists(key)) continue;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(key, {}), frameRate: SPIRIT_FPS, repeat: -1 });
  }
}

// A explosão primal que cobre um personagem: segue os pés dele enquanto toca e some no fim.
export class PrimalBursts {
  private bursts = new Map<string, Phaser.GameObjects.Sprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(id: string, x: number, feet: number, depth: number) {
    this.bursts.get(id)?.destroy();
    const sprite = this.scene.add.sprite(x, feet, PRIMAL_KEY).setOrigin(0.5, PRIMAL_FEET).setScale(PRIMAL_SCALE).setDepth(depth);
    if (this.scene.anims.exists(PRIMAL_KEY)) sprite.play(PRIMAL_KEY);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      sprite.destroy();
      if (this.bursts.get(id) === sprite) this.bursts.delete(id);
    });
    this.bursts.set(id, sprite);
  }

  follow(id: string, x: number, feet: number, depth: number) {
    this.bursts.get(id)?.setPosition(x, feet).setDepth(depth);
  }
}

interface Spirit {
  sprite: Phaser.GameObjects.Sprite;
  kind: string;
  x: number;
  y: number;
}

// Os espíritos que flutuam ao lado dos elfos, um por jogador.
export class Spirits {
  private spirits = new Map<string, Spirit>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly particles: Particles | undefined,
    private readonly sortDepth: (y: number) => number,
  ) {}

  // Uma vez por quadro por jogador. kind "" = sem espírito (o que havia some).
  sync(id: string, kind: string, owner: { x: number; feet: number; facing: string; moving: boolean }, time: number, delta: number, alpha: number) {
    let spirit = this.spirits.get(id);
    if (!kind) {
      this.remove(id);
      return;
    }
    const dir = DIRECTION_VECTORS[owner.facing] ?? { x: 0, y: 1 };
    // À direita de quem olha (perpendicular) e um pouco para trás.
    const targetX = owner.x - dir.y * SPIRIT_SIDE - dir.x * SPIRIT_BACK;
    const targetY = owner.feet + dir.x * SPIRIT_SIDE * 0.5 - dir.y * SPIRIT_BACK;
    if (!spirit || spirit.kind !== kind) {
      spirit?.sprite.destroy();
      const sprite = this.scene.add.sprite(targetX, targetY, `spirits/${kind}-${owner.facing}`).setScale(SPIRIT_SCALE).setOrigin(0.5, 1);
      spirit = { sprite, kind, x: targetX, y: targetY };
      this.spirits.set(id, spirit);
    }
    const k = 1 - Math.exp(-delta / SPIRIT_FOLLOW_MS);
    spirit.x += (targetX - spirit.x) * k;
    spirit.y += (targetY - spirit.y) * k;
    const bob = SPIRIT_BOB * Math.sin((2 * Math.PI * time) / SPIRIT_BOB_MS);
    const float = `spirits/${kind}-float-${owner.facing}`;
    const still = `spirits/${kind}-${owner.facing}`;
    const sprite = spirit.sprite;
    if (owner.moving && this.scene.anims.exists(float)) {
      if (sprite.anims.currentAnim?.key !== float) sprite.play({ key: float, startFrame: sprite.anims.isPlaying ? (sprite.anims.currentFrame?.index ?? 1) - 1 : 0 });
    } else {
      if (sprite.anims.isPlaying) sprite.stop();
      if (sprite.texture.key !== still && this.scene.textures.exists(still)) sprite.setTexture(still);
    }
    sprite.setPosition(spirit.x, spirit.y - SPIRIT_HEIGHT + bob).setDepth(this.sortDepth(spirit.y)).setAlpha(alpha);
  }

  // A tecla da skill: o espírito estoura em partículas da cor dele.
  pulse(id: string, time: number) {
    const spirit = this.spirits.get(id);
    if (!spirit) return;
    const s = spirit.sprite;
    this.particles?.explode(s.x, s.y - (s.displayHeight / 2), SPIRIT_COLORS[spirit.kind] ?? SPIRIT_COLORS.wind ?? [], time);
  }

  remove(id: string) {
    this.spirits.get(id)?.sprite.destroy();
    this.spirits.delete(id);
  }
}
