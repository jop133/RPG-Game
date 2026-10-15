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
  // Para as partículas do mago não serem iguais em todo golpe.
  seed: number;
}

// Quanto tempo cada rastro fica na tela. Golpe pesado demora mais; o do elfo é um risco rápido.
const SWING_MS: Record<string, number> = { barbaro: 220, mago: 200, elfo: 120, homem_fera: 160 };
const DEFAULT_SWING_MS = 150;

export function swingDuration(classId: string): number {
  return SWING_MS[classId] ?? DEFAULT_SWING_MS;
}

// Desenha o rastro do golpe. Toda classe mostra a área de acerto de verdade (fatia clara: a arma é a mesma para
// todos, passo 8); por cima vai o enfeite da classe. p vai de 0 (golpe saiu) a 1 (rastro some).
export function drawSwing(g: Phaser.GameObjects.Graphics, swing: Swing, time: number, radius: number, halfArc: number) {
  const p = Math.min(1, (time - swing.startMs) / swingDuration(swing.classId));
  const fade = 1 - p;
  const a0 = swing.angle - halfArc;
  const a1 = swing.angle + halfArc;
  g.fillStyle(0xffffff, 0.18 * fade);
  g.slice(swing.x, swing.y, radius, a0, a1);
  g.fillPath();
  if (swing.classId === "barbaro") drawHeavyArc(g, swing, radius, a0, a1, fade);
  else if (swing.classId === "mago") drawArcane(g, swing, radius, a0, a1, p);
  else if (swing.classId === "elfo") drawQuickTrail(g, swing, radius, a0, a1, p);
  else if (swing.classId === "homem_fera") drawClaws(g, swing, radius, fade);
}

// Bárbaro: arco grosso e pesado, branco por dentro e vermelho por fora.
function drawHeavyArc(g: Phaser.GameObjects.Graphics, s: Swing, radius: number, a0: number, a1: number, fade: number) {
  g.lineStyle(7, 0xb71c1c, 0.8 * fade);
  g.beginPath();
  g.arc(s.x, s.y, radius - 3, a0, a1);
  g.strokePath();
  g.lineStyle(3, 0xffebee, fade);
  g.beginPath();
  g.arc(s.x, s.y, radius - 3, a0, a1);
  g.strokePath();
}

// Mago: contorno roxo e faíscas azuis e roxas saindo do centro para fora do arco.
function drawArcane(g: Phaser.GameObjects.Graphics, s: Swing, radius: number, a0: number, a1: number, p: number) {
  const fade = 1 - p;
  g.lineStyle(3, 0xb388ff, 0.9 * fade);
  g.beginPath();
  g.arc(s.x, s.y, radius, a0, a1);
  g.strokePath();
  const random = new Phaser.Math.RandomDataGenerator([String(s.seed)]);
  for (let i = 0; i < 14; i++) {
    const angle = random.realInRange(a0, a1);
    const r = radius * (0.3 + random.realInRange(0.4, 0.9) * (0.4 + p));
    g.fillStyle(i % 2 ? 0x40c4ff : 0xd500f9, fade);
    g.fillRect(s.x + Math.cos(angle) * r - 2, s.y + Math.sin(angle) * r - 2, 4, 4);
  }
}

// Elfo: três riscos finos, dourado e verde, varrendo o arco depressa.
function drawQuickTrail(g: Phaser.GameObjects.Graphics, s: Swing, radius: number, a0: number, a1: number, p: number) {
  const sweep = a0 + (a1 - a0) * Math.min(1, p * 2.5);
  const fade = 1 - p;
  [
    [radius, 0xffd54f],
    [radius * 0.8, 0x69f0ae],
    [radius * 0.6, 0xffd54f],
  ].forEach(([r, color]) => {
    g.lineStyle(2, color as number, fade);
    g.beginPath();
    g.arc(s.x, s.y, r as number, a0, sweep);
    g.strokePath();
  });
}

// Homem fera: três rasgos de garra vermelhos e paralelos, atravessados na frente do golpe.
function drawClaws(g: Phaser.GameObjects.Graphics, s: Swing, radius: number, fade: number) {
  const tilt = s.angle + Math.PI / 2 + 0.35; // rasgo quase perpendicular ao golpe, um pouco inclinado
  const half = radius * 0.4;
  for (const offset of [-7, 0, 7]) {
    const cx = s.x + Math.cos(s.angle) * (radius * 0.6 + offset);
    const cy = s.y + Math.sin(s.angle) * (radius * 0.6 + offset);
    const x0 = cx - Math.cos(tilt) * half;
    const y0 = cy - Math.sin(tilt) * half;
    const x1 = cx + Math.cos(tilt) * half;
    const y1 = cy + Math.sin(tilt) * half;
    g.lineStyle(5, 0x3e0000, 0.7 * fade);
    g.lineBetween(x0, y0, x1, y1);
    g.lineStyle(2, 0xff1744, fade);
    g.lineBetween(x0, y0, x1, y1);
  }
}
