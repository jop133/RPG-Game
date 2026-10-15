import Phaser from "phaser";

// Iluminação (só desenho). Uma camada do tamanho da tela, por cima do mundo e por baixo do HUD: começa com a cor do
// ambiente (escura) e cada luz soma a sua cor por cima; depois a camada inteira MULTIPLICA o que está embaixo dela.
// Onde não chega luz, o mundo fica com a cor do ambiente; no meio de uma luz, com a cor normal ou tingido por ela.
// No labirinto os raios são os mesmos que o servidor usa para decidir o que enviar (regra 4): a escuridão só cobre
// o mapa, nunca algo que o cliente recebeu.

export type LightEffect = "steady" | "flicker" | "pulse";

export interface LightLook {
  color: number;
  intensity: number;
  effect: LightEffect;
}

export interface Light {
  x: number;
  y: number;
  radius: number;
  look: LightLook;
  // Para luzes iguais não piscarem juntas.
  phase: number;
}

const LIGHT_KEY = "light";
const LIGHT_TEXTURE = 256;
const VIGNETTE_KEY = "vignette";

// Cor de multiplicar equivalente a pintar (r, g, b) com opacidade `alpha` por cima de tudo, que é como a escuridão
// costuma ser descrita ("rgba(8, 12, 22, 0.82)").
export function darkness(r: number, g: number, b: number, alpha: number): number {
  const mix = (c: number) => Math.round(255 - alpha * (255 - c));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

// Fase estável por posição: a mesma luz pisca igual toda vez que a cena é criada.
export function phaseAt(x: number, y: number): number {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % (Math.PI * 2);
}

export class Lighting {
  private readonly layer: Phaser.GameObjects.RenderTexture;
  private readonly vignette: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ambient: number,
    depth: number,
    vignetteAlpha: number,
  ) {
    createTextures(scene);
    const { width, height } = scene.scale;
    this.layer = scene.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    // Vinheta depois da luz e antes do HUD: escurece as bordas do mundo, não a barra de inventário.
    this.vignette = scene.add
      .image(0, 0, VIGNETTE_KEY)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth + 0.1)
      .setDisplaySize(width, height)
      .setAlpha(vignetteAlpha);
  }

  resize(width: number, height: number) {
    this.layer.resize(width, height);
    this.vignette.setDisplaySize(width, height);
  }

  // Redesenha a camada com as luzes deste quadro. Luz fora da tela é pulada.
  draw(lights: readonly Light[], time: number) {
    const view = this.scene.cameras.main.worldView;
    this.layer.clear().fill(this.ambient).beginDraw();
    for (const light of lights) {
      const r = light.radius;
      if (light.x + r < view.x || light.x - r > view.right || light.y + r < view.y || light.y - r > view.bottom) continue;
      const { alpha, scale } = wobble(light, time);
      this.layer.stamp(LIGHT_KEY, undefined, light.x - view.x, light.y - view.y, {
        scale: ((r * 2) / LIGHT_TEXTURE) * scale,
        tint: light.look.color,
        alpha,
        blendMode: Phaser.BlendModes.ADD,
        skipBatch: true,
      });
    }
    this.layer.endDraw();
  }
}

// Chama: brilho e tamanho tremem um pouco (senoides de frequências diferentes somadas). Pulso: respira devagar.
// O tamanho nunca passa do raio: no labirinto, o desenho não pode mostrar luz onde o servidor não ilumina.
function wobble(light: Light, time: number): { alpha: number; scale: number } {
  const t = time / 1000 + light.phase;
  const { intensity, effect } = light.look;
  if (effect === "flicker") {
    const n = 0.5 * Math.sin(t * 9.1) + 0.3 * Math.sin(t * 17.3 + 1.7) + 0.2 * Math.sin(t * 31.7 + 4.1);
    return { alpha: intensity * (0.88 + 0.12 * n), scale: 0.97 + 0.03 * n };
  }
  if (effect === "pulse") {
    const n = Math.sin(t * 2.2);
    return { alpha: intensity * (0.8 + 0.2 * n), scale: 0.95 + 0.05 * n };
  }
  return { alpha: intensity, scale: 1 };
}

// Texturas feitas no código: mancha de luz (branca no meio, sumindo até a borda) e vinheta (transparente no meio,
// preta nos cantos). Filtro linear: com pixelArt, ampliar o degradê em modo "vizinho mais próximo" faria degraus.
function createTextures(scene: Phaser.Scene) {
  radialTexture(scene, LIGHT_KEY, [
    [0, "rgba(255,255,255,1)"],
    [0.35, "rgba(255,255,255,0.75)"],
    [0.7, "rgba(255,255,255,0.25)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  radialTexture(scene, VIGNETTE_KEY, [
    [0, "rgba(0,0,0,0)"],
    [0.55, "rgba(0,0,0,0)"],
    [1, "rgba(0,0,0,1)"],
  ]);
}

function radialTexture(scene: Phaser.Scene, key: string, stops: [number, string][]) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, LIGHT_TEXTURE, LIGHT_TEXTURE);
  const ctx = texture?.getContext();
  if (!texture || !ctx) return;
  const half = LIGHT_TEXTURE / 2;
  // A vinheta vai até o canto (meia-diagonal); a luz, até a borda do círculo.
  const radius = key === VIGNETTE_KEY ? half * Math.SQRT2 : half;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, radius);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LIGHT_TEXTURE, LIGHT_TEXTURE);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
