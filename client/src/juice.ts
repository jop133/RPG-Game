import { ATTACK_LOCK_MS } from "shared";
import Phaser from "phaser";

// Efeitos de impacto ("juice"). Tudo aqui é só desenho: vem do que o servidor já mandou (vida que caiu, golpe
// novo, primeira morte) e não decide nada (regra 1). O recuo, por exemplo, mexe só no sprite; a posição de verdade
// continua a do servidor.

// ---------------------------------------------------------------- flash e recuo de quem levou golpe

const HIT_FLASH_MS = 90;
const RECOIL_PX = 4;
const RECOIL_MS = 110;

export interface HitReaction {
  flashUntil: number;
  recoilStart: number;
  recoilX: number;
  recoilY: number;
}

export function newReaction(): HitReaction {
  return { flashUntil: -Infinity, recoilStart: -Infinity, recoilX: 0, recoilY: 0 };
}

// Levou golpe agora: pisca e dá um tranco na direção (awayX, awayY), que não precisa estar normalizada.
export function startReaction(reaction: HitReaction, time: number, awayX: number, awayY: number) {
  const length = Math.hypot(awayX, awayY) || 1;
  reaction.flashUntil = time + HIT_FLASH_MS;
  reaction.recoilStart = time;
  reaction.recoilX = (awayX / length) * RECOIL_PX;
  reaction.recoilY = (awayY / length) * RECOIL_PX;
}

// Deslocamento do tranco neste instante: vai até RECOIL_PX e volta, numa meia senoide.
export function recoilOffset(reaction: HitReaction, time: number): { x: number; y: number } {
  const t = (time - reaction.recoilStart) / RECOIL_MS;
  if (t < 0 || t >= 1) return { x: 0, y: 0 };
  const k = Math.sin(Math.PI * t);
  return { x: reaction.recoilX * k, y: reaction.recoilY * k };
}

// Silhueta inteira de uma cor só durante o flash (o equivalente do "source-atop" do canvas).
export function applyFlash(
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  reaction: HitReaction,
  time: number,
  color: number,
) {
  if (time < reaction.flashUntil) sprite.setTintFill(color);
  else if (sprite.isTinted) sprite.clearTint();
}

// ---------------------------------------------------------------- números flutuantes

// dealt: dano em mob ou em outro jogador. taken: dano em você. heal: vida que voltou. xp: experiência ganha.
export type NumberKind = "dealt" | "taken" | "heal" | "xp";

const NUMBER_STYLE: Record<NumberKind, { color: string; size: number }> = {
  dealt: { color: "#ffffff", size: 14 },
  taken: { color: "#ff5252", size: 15 },
  heal: { color: "#69f0ae", size: 14 },
  xp: { color: "#64b5f6", size: 13 },
};
const NUMBER_LIFE_MS = 800;
const NUMBER_FADE_FROM_MS = 450;
const NUMBER_JUMP = -120; // px/s para cima
const NUMBER_GRAVITY = 260; // px/s²

interface FloatingNumber {
  text: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
  born: number;
}

// Número que salta acima do alvo, cai um pouco com gravidade leve e some aos poucos.
export class FloatingNumbers {
  private items: FloatingNumber[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  spawn(x: number, y: number, label: string, kind: NumberKind, time: number) {
    const style = NUMBER_STYLE[kind];
    // Resolução 1: a tela é ampliada com pixels nítidos, então o texto fica com cara de fonte pixelada.
    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: '"Courier New", monospace',
        fontStyle: "bold",
        fontSize: `${style.size}px`,
        color: style.color,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(this.depth);
    this.items.push({ text, vx: Phaser.Math.Between(-30, 30), vy: NUMBER_JUMP, born: time });
  }

  update(time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.items = this.items.filter((item) => {
      const age = time - item.born;
      if (age >= NUMBER_LIFE_MS) {
        item.text.destroy();
        return false;
      }
      item.vy += NUMBER_GRAVITY * dt;
      item.text.x += item.vx * dt;
      item.text.y += item.vy * dt;
      item.text.setAlpha(age < NUMBER_FADE_FROM_MS ? 1 : 1 - (age - NUMBER_FADE_FROM_MS) / (NUMBER_LIFE_MS - NUMBER_FADE_FROM_MS));
      return true;
    });
  }
}

// ---------------------------------------------------------------- tremor de tela

const SHAKE_DECAY_MS = 90; // tempo para o tremor cair a ~37%
const SHAKE_MAX_PX = 8;

// Tremor amortecido: cada pancada põe a força no máximo entre a atual e a nova, e ela decai sozinha.
// Usa o deslocamento de "seguir" da câmera: não briga com ela seguindo o jogador.
export class ScreenShake {
  private amplitude = 0;

  kick(amplitude: number) {
    this.amplitude = Math.min(SHAKE_MAX_PX, Math.max(this.amplitude, amplitude));
  }

  update(camera: Phaser.Cameras.Scene2D.Camera, deltaMs: number) {
    this.amplitude *= Math.exp(-deltaMs / SHAKE_DECAY_MS);
    if (this.amplitude < 0.2) this.amplitude = 0;
    const a = this.amplitude;
    camera.setFollowOffset(a ? Phaser.Math.FloatBetween(-a, a) : 0, a ? Phaser.Math.FloatBetween(-a, a) : 0);
  }
}

// ---------------------------------------------------------------- golpe de cada classe

export interface Swing {
  x: number;
  y: number;
  angle: number;
  classId: string;
  startMs: number;
  // Tamanho do golpe de quem bateu (o alcance e o arco da arma dele, ou do soco).
  radius: number;
  halfArc: number;
  // Para as partículas do mago não serem iguais em todo golpe.
  seed: number;
}

// Quanto tempo cada rastro fica na tela. Golpe pesado demora mais; o do elfo é um risco rápido.
const SWING_MS: Record<string, number> = { barbaro: 220, mago: 200, elfo: 120, homem_fera: 160 };
const DEFAULT_SWING_MS = 150;

export function swingDuration(classId: string): number {
  return SWING_MS[classId] ?? DEFAULT_SWING_MS;
}

// ---------------------------------------------------------------- arma girando no golpe e o corpo indo junto

// A espada varre de (ângulo do golpe - WEAPON_SWEEP) até (+ WEAPON_SWEEP) em WEAPON_SWING_MS, rápido no começo e
// devagar no fim (cubic ease-out), com um "pop" de escala no meio. O arco de acerto de verdade é o do servidor
// (o arcDegrees da arma); a varrida é só desenho.
export const WEAPON_SWING_MS = 160;
const WEAPON_SWEEP = (55 * Math.PI) / 180;
const WEAPON_POP = 0.15;
// Por quanto tempo o personagem olha para o golpe (e a animação de ataque toca): o mesmo da trava do servidor, em que
// ele fica parado (ATTACK_LOCK_MS).
export const ATTACK_FACING_MS = ATTACK_LOCK_MS;
// Impulso do corpo: vai LUNGE_PX para a frente em LUNGE_OUT_MS, com uma compressão elástica, e volta em LUNGE_BACK_MS.
const LUNGE_PX = 4;
const LUNGE_OUT_MS = 55;
const LUNGE_BACK_MS = 125;
const LUNGE_SQUASH = { x: 0.07, y: -0.06 };
// Bote dos mobs quando o golpe sai (fim do windup): vai e volta MOB_LUNGE_PX em MOB_LUNGE_MS.
const MOB_LUNGE_PX = 8;
const MOB_LUNGE_MS = 150;

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// Pose da arma neste instante: ângulo, escala e se ainda aparece. p vai de 0 (golpe saiu) a 1.
export function weaponPose(startMs: number, angle: number, time: number): { visible: boolean; angle: number; scale: number; p: number } {
  const p = (time - startMs) / WEAPON_SWING_MS;
  if (p < 0 || p >= 1) return { visible: false, angle, scale: 1, p: 1 };
  const e = easeOutCubic(p);
  return { visible: true, angle: angle - WEAPON_SWEEP + 2 * WEAPON_SWEEP * e, scale: 1 + WEAPON_POP * Math.sin(Math.PI * p), p };
}

// Disparo do cajado (canalização, no lugar da varrida da espada): em STAFF_CAST_MS o cajado inclina da guarda até
// STAFF_TILT do caminho para a mira e volta, e avança até STAFF_PUSH_PX na direção do disparo, com o cabo na mão.
export const STAFF_CAST_MS = 160;
const STAFF_TILT = 0.7;
const STAFF_PUSH_PX = 5;

export function staffPose(startMs: number, aim: number, guard: number, time: number): { visible: boolean; angle: number; push: number } {
  const p = (time - startMs) / STAFF_CAST_MS;
  if (p < 0 || p >= 1) return { visible: false, angle: guard, push: 0 };
  const k = Math.sin(Math.PI * easeOutCubic(p));
  // O caminho mais curto da guarda até a mira (nunca a volta longa pelo outro lado).
  const turn = Math.atan2(Math.sin(aim - guard), Math.cos(aim - guard));
  return { visible: true, angle: guard + turn * STAFF_TILT * k, push: STAFF_PUSH_PX * k };
}

// Impulso do corpo no golpe: deslocamento e escala do sprite (a posição de verdade continua a do servidor).
export function lungeOffset(startMs: number, angle: number, time: number): { x: number; y: number; sx: number; sy: number } {
  const t = time - startMs;
  if (t < 0 || t >= LUNGE_OUT_MS + LUNGE_BACK_MS) return { x: 0, y: 0, sx: 1, sy: 1 };
  // Sai depressa (ease-out) e volta suave (ease-in-out).
  const k = t < LUNGE_OUT_MS ? easeOutCubic(t / LUNGE_OUT_MS) : 0.5 + 0.5 * Math.cos(Math.PI * ((t - LUNGE_OUT_MS) / LUNGE_BACK_MS));
  return {
    x: Math.cos(angle) * LUNGE_PX * k,
    y: Math.sin(angle) * LUNGE_PX * k,
    sx: 1 + LUNGE_SQUASH.x * k,
    sy: 1 + LUNGE_SQUASH.y * k,
  };
}

// Bote do mob quando o golpe sai: vai e volta numa meia senoide.
export function mobLungeOffset(startMs: number, angle: number, time: number): { x: number; y: number } {
  const t = (time - startMs) / MOB_LUNGE_MS;
  if (t < 0 || t >= 1) return { x: 0, y: 0 };
  const k = Math.sin(Math.PI * t);
  return { x: Math.cos(angle) * MOB_LUNGE_PX * k, y: Math.sin(angle) * MOB_LUNGE_PX * k };
}
