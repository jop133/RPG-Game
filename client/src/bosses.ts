import Phaser from "phaser";
import {
  FENRIR_CLAW,
  FENRIR_HOWL,
  FIZBAN_ESCAPE,
  FIZBAN_POTIONS,
  KING_EXPLOSION,
  KING_SLAM,
  KRAG_KICK,
  KRAG_TORNADO,
  MOB_KINDS,
  type MobKind,
  type MobStats,
} from "shared";
import bossArt from "../../assets/mobs/bosses.json";

// Minibosses no cliente (só desenho; quem decide é o servidor). A arte (tools/assets/process_bosses.py) vem toda num
// quadro só por chefe (canvas) com os pés na mesma linha, então uma origem serve para tudo: parado, andando e ações.
// - Krag: "attack" (o golpe), "tornado-prep" (braços abertos), "tornado-act" (o tornado, em laço), "kick" (o chute);
// - Rei Slime: "slam" (o pulo, uma direção só), "explosion" (a explosão, uma direção só);
// - Fizban: "potions" (o braço do arremesso, a mesma arte do golpe), "escape" (o pulo de fuga);
// - Fenrir: "howl" (o uivo), "claws" (o ataque de garras).
// Avisos no chão: a linha do chute, o círculo do tornado, o da queda do pulo e o da explosão. Barra de vida grande
// com o nome em cima, dourada.

interface BossAnim {
  frame: number;
  frames: Record<string, number>;
  feet: number;
}
interface BossInfo {
  canvas: number;
  feet: number;
  anims: Record<string, BossAnim>;
}
export const BOSS_INFO = bossArt as Record<string, BossInfo>;

export const BOSS_NAMES: Partial<Record<MobKind, string>> = {
  krag: "Krag, o Carrasco Hobgoblin",
  rei_slime: "Rei Slime Abissal",
  fizban: "Fizban, o Artífice Corrompido",
  fenrir: "Fenrir, o Lobo Alfa Atroz",
};

export function isBoss(kind: string): boolean {
  return Object.hasOwn(MOB_KINDS, kind) && (MOB_KINDS[kind as MobKind] as MobStats).boss === true;
}

// A animação da ação de um chefe agora (chave e duração em ms), ou undefined.
export function bossActionAnim(kind: string, action: string, facing: string): { key: string; ms: number } | undefined {
  switch (action) {
    case "tornado-prep":
      return { key: `mobs/${kind}/openarm-${facing}`, ms: KRAG_TORNADO.poseMs };
    case "tornado-act":
      return { key: `mobs/${kind}/tornado`, ms: TORNADO_LOOP_MS };
    case "kick":
      return { key: `mobs/${kind}/kick-${facing}`, ms: KRAG_KICK.windupMs + 250 };
    case "slam":
      return { key: `mobs/${kind}/jump`, ms: KING_SLAM.crouchMs + KING_SLAM.airMs };
    case "explosion":
      return { key: `mobs/${kind}/explosion`, ms: KING_EXPLOSION.warnMs + 150 };
    case "potions":
      return { key: `mobs/${kind}/attack-${facing}`, ms: FIZBAN_POTIONS.windupMs + 200 };
    case "escape":
      return { key: `mobs/${kind}/jump-${facing}`, ms: FIZBAN_ESCAPE.crouchMs + FIZBAN_ESCAPE.airMs };
    case "howl":
      return { key: `mobs/${kind}/howl-${facing}`, ms: FENRIR_HOWL.prepMs };
    case "claws":
      return { key: `mobs/${kind}/claw-${facing}`, ms: FENRIR_CLAW.windupMs + 250 };
    default:
      return undefined;
  }
}

// Uma volta do tornado (em laço enquanto dura).
const TORNADO_LOOP_MS = 650;
// Em laço: o tornado, as fumaças do Fizban e o golpe de garra voando.
export const LOOPING_BOSS_ANIMS = /\/tornado$|\/smoke-|\/clawfx-/;

const TELEGRAPH = 0xff1744;
const FLATTEN = 0.55;

// Os avisos dos ataques dos chefes, no chão.
export function drawBossWarning(g: Phaser.GameObjects.Graphics, mob: { x: number; y: number; action?: string; attackAngle: number; aimX?: number; aimY?: number }, time: number) {
  const pulse = 0.22 + 0.14 * Math.sin(time / 60);
  const ring = (x: number, y: number, radius: number) => {
    g.fillStyle(TELEGRAPH, pulse).fillEllipse(x, y, radius * 2, radius * 2 * FLATTEN);
    g.lineStyle(2, TELEGRAPH, 0.85).strokeEllipse(x, y, radius * 2, radius * 2 * FLATTEN);
  };
  switch (mob.action) {
    case "kick": {
      const end = { x: mob.x + Math.cos(mob.attackAngle) * KRAG_KICK.length, y: mob.y + Math.sin(mob.attackAngle) * KRAG_KICK.length };
      g.lineStyle(KRAG_KICK.width, TELEGRAPH, pulse).lineBetween(mob.x, mob.y, end.x, end.y);
      return;
    }
    case "tornado-prep":
    case "tornado-act":
      ring(mob.x, mob.y, KRAG_TORNADO.hitRadius);
      return;
    case "slam":
      ring(mob.aimX ?? mob.x, mob.aimY ?? mob.y, KING_SLAM.hitRadius);
      return;
    case "explosion":
      ring(mob.x, mob.y, KING_EXPLOSION.radius);
      return;
    case "howl":
      ring(mob.x, mob.y, FENRIR_HOWL.radius);
      return;
    case "claws": {
      const end = { x: mob.x + Math.cos(mob.attackAngle) * FENRIR_CLAW.length, y: mob.y + Math.sin(mob.attackAngle) * FENRIR_CLAW.length };
      g.lineStyle(FENRIR_CLAW.width, TELEGRAPH, pulse).lineBetween(mob.x, mob.y, end.x, end.y);
    }
  }
}

const BAR = { width: 96, height: 8, gap: 6 };

// Barra de vida do chefe: maior, com moldura dourada; o nome logo acima (um Text por chefe, criado na primeira vez).
export class BossBars {
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  draw(g: Phaser.GameObjects.Graphics, id: string, kind: string, x: number, top: number, fraction: number) {
    const left = x - BAR.width / 2;
    const y = top - BAR.height;
    g.fillStyle(0x1a0f08, 0.9).fillRect(left - 2, y - 2, BAR.width + 4, BAR.height + 4);
    g.lineStyle(1, 0xd4a64a, 1).strokeRect(left - 2, y - 2, BAR.width + 4, BAR.height + 4);
    g.fillStyle(0x5a1010, 1).fillRect(left, y, BAR.width, BAR.height);
    g.fillStyle(0xd62828, 1).fillRect(left, y, BAR.width * Math.max(0, Math.min(1, fraction)), BAR.height);
    let label = this.labels.get(id);
    if (!label) {
      label = this.scene.add
        .text(x, y, BOSS_NAMES[kind as MobKind] ?? kind, {
          fontFamily: "Palatino Linotype, Georgia, serif",
          fontSize: "12px",
          color: "#f0d48a",
          stroke: "#140d08",
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(this.depth);
      this.labels.set(id, label);
    }
    label.setPosition(x, y - BAR.gap);
  }

  // Os chefes que não estão mais no estado perdem o nome.
  sweep(alive: ReadonlySet<string>) {
    for (const [id, label] of this.labels) {
      if (alive.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }
}
