import Phaser from "phaser";

// Iluminação (só desenho). Duas camadas do tamanho da tela, por cima do mundo e por baixo do HUD:
// 1. Lightmap (MULTIPLY): começa, a cada quadro, com a cor do ambiente, opaca; cada luz SOMA (ADD) a sua cor por
//    cima. Depois a camada inteira multiplica o mundo: onde não chega luz, o mundo fica na cor do ambiente.
// 2. Brilho (ADD): um halo colorido, menor e fraco, das luzes do mapa, somado por cima do mundo: o roxo do portal, o
//    ciano dos cristais, o verde do ácido aparecem até no chão escuro.
// A mancha de luz é um degradê de branco a preto sobre fundo PRETO OPACO: somar preto é somar zero, então o quadrado
// da textura nunca aparece, e luzes vizinhas só se somam (o centro de cada uma é sempre o ponto mais claro). Nada é
// desenhado com transparência no lightmap: a força de cada luz vai na cor (tint), não no alfa.
// No labirinto os raios são os mesmos que o servidor usa para decidir o que enviar (regra 4): a mancha chega ao preto
// em 94% do raio, e o brilho fica bem dentro dele.

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
  // Tipo da luz no mapa ("cristal-grande", "portal"...; "saida" para saída ativa). As partículas usam; só luzes com
  // tipo (as do mapa e as saídas) têm brilho colorido.
  kind?: string;
}

// Também serve de brilho solto (ADD): o preto do fundo soma zero (ver Bolts, em projectiles.ts).
export const LIGHT_KEY = "light";
const LIGHT_TEXTURE = 256;
// O degradê termina em 120 de 128 px: preto puro antes da borda da textura.
const LIGHT_EDGE = 120;
const VIGNETTE_KEY = "vignette";
// Brilho colorido: tamanho (fração do raio) e força (fração da cor da luz).
const GLOW_SIZE = 0.55;
const GLOW_STRENGTH = 0.22;
// Luzes do mesmo tipo a menos disto (px) viram uma só (as duas lanternas de um poste duplo, velas de uma mesa).
export const MERGE_DISTANCE = 32;

// Fase estável por posição: a mesma luz pisca igual toda vez que a cena é criada.
export function phaseAt(x: number, y: number): number {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % (Math.PI * 2);
}

// A cor multiplicada por k (0 a 1), canal por canal: é assim que a força da luz entra no ADD.
function scaled(color: number, k: number): number {
  const f = Math.max(0, Math.min(1, k));
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

// Junta luzes do mesmo tipo a menos de MERGE_DISTANCE: uma luz no meio, com a força de uma só, no lugar de duas manchas
// quase em cima uma da outra (que somadas estourariam no branco).
export function mergeNearby(lights: readonly Light[]): Light[] {
  const groups: Light[][] = [];
  for (const light of lights) {
    const group = groups.find(
      (g) => g[0]?.kind === light.kind && g.every((o) => Math.hypot(o.x - light.x, o.y - light.y) < MERGE_DISTANCE),
    );
    if (group) group.push(light);
    else groups.push([light]);
  }
  return groups.map((group) => {
    const first = group[0] as Light;
    if (group.length === 1) return first;
    const x = group.reduce((sum, l) => sum + l.x, 0) / group.length;
    const y = group.reduce((sum, l) => sum + l.y, 0) / group.length;
    return { ...first, x, y, radius: Math.max(...group.map((l) => l.radius)), phase: phaseAt(x, y) };
  });
}

export class Lighting {
  private readonly layer: Phaser.GameObjects.RenderTexture;
  private readonly glow: Phaser.GameObjects.RenderTexture;
  private readonly vignette: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private ambient: number,
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
    // Brilho logo acima do lightmap e abaixo das partículas (depth + 0.05) e da vinheta.
    this.glow = scene.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth + 0.02)
      .setBlendMode(Phaser.BlendModes.ADD);
    // Vinheta depois da luz e antes do HUD: escurece as bordas do mundo, não a barra de inventário.
    this.vignette = scene.add
      .image(0, 0, VIGNETTE_KEY)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth + 0.1)
      .setDisplaySize(width, height)
      .setAlpha(vignetteAlpha);
  }

  // Troca o ambiente e a força da vinheta (ex.: ao entrar num prédio, salão claro e quente; ao sair, a noite da rua).
  setLook(ambient: number, vignetteAlpha: number) {
    this.ambient = ambient;
    this.vignette.setAlpha(vignetteAlpha);
  }

  resize(width: number, height: number) {
    this.layer.resize(width, height);
    this.glow.resize(width, height);
    this.vignette.setDisplaySize(width, height);
  }

  // Redesenha as duas camadas com as luzes deste quadro. Luz fora da tela é pulada. Uma camada de cada vez: com as
  // duas abertas (beginDraw) ao mesmo tempo, o WebGL desenha tudo no mesmo framebuffer.
  draw(lights: readonly Light[], time: number) {
    const view = this.scene.cameras.main.worldView;
    const stamps = lights.flatMap((light) => {
      const r = light.radius;
      if (light.x + r < view.x || light.x - r > view.right || light.y + r < view.y || light.y - r > view.bottom) return [];
      const { strength, scale } = wobble(light, time);
      return [{ light, x: light.x - view.x, y: light.y - view.y, size: ((r * 2) / LIGHT_TEXTURE) * scale, strength }];
    });
    this.layer.clear().fill(this.ambient, 1).beginDraw();
    for (const s of stamps) stamp(this.layer, s.x, s.y, s.size, scaled(s.light.look.color, s.strength));
    this.layer.endDraw();
    this.glow.clear().fill(0x000000, 1).beginDraw();
    for (const s of stamps) {
      if (!s.light.kind) continue;
      stamp(this.glow, s.x, s.y, s.size * GLOW_SIZE, scaled(s.light.look.color, s.strength * GLOW_STRENGTH));
    }
    this.glow.endDraw();
  }
}

function stamp(target: Phaser.GameObjects.RenderTexture, x: number, y: number, scale: number, tint: number) {
  target.stamp(LIGHT_KEY, undefined, x, y, { scale, tint, alpha: 1, blendMode: Phaser.BlendModes.ADD, skipBatch: true });
}

// Chama: brilho e tamanho tremem um pouco (senoides de frequências diferentes somadas). Pulso: respira devagar.
// O tamanho nunca passa do raio: no labirinto, o desenho não pode mostrar luz onde o servidor não ilumina.
function wobble(light: Light, time: number): { strength: number; scale: number } {
  const t = time / 1000 + light.phase;
  const { intensity, effect } = light.look;
  if (effect === "flicker") {
    const n = 0.5 * Math.sin(t * 9.1) + 0.3 * Math.sin(t * 17.3 + 1.7) + 0.2 * Math.sin(t * 31.7 + 4.1);
    return { strength: intensity * (0.88 + 0.12 * n), scale: 0.97 + 0.03 * n };
  }
  if (effect === "pulse") {
    const n = Math.sin(t * 2.2);
    return { strength: intensity * (0.8 + 0.2 * n), scale: 0.95 + 0.05 * n };
  }
  return { strength: intensity, scale: 1 };
}

// Texturas feitas no código. Filtro linear: com pixelArt, ampliar o degradê em modo "vizinho mais próximo" faria
// degraus.
function createTextures(scene: Phaser.Scene) {
  lightTexture(scene);
  vignetteTexture(scene);
}

// Mancha de luz: fundo preto opaco e degradê branco -> preto até LIGHT_EDGE (somada em ADD, o preto não muda nada).
function lightTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(LIGHT_KEY)) return;
  const texture = scene.textures.createCanvas(LIGHT_KEY, LIGHT_TEXTURE, LIGHT_TEXTURE);
  const ctx = texture?.getContext();
  if (!texture || !ctx) return;
  const half = LIGHT_TEXTURE / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, LIGHT_TEXTURE, LIGHT_TEXTURE);
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, LIGHT_EDGE);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(220,220,220,1)");
  gradient.addColorStop(0.65, "rgba(90,90,90,1)");
  gradient.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LIGHT_TEXTURE, LIGHT_TEXTURE);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

// Vinheta: transparente no meio, preta nos cantos (até a meia-diagonal).
function vignetteTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(VIGNETTE_KEY)) return;
  const texture = scene.textures.createCanvas(VIGNETTE_KEY, LIGHT_TEXTURE, LIGHT_TEXTURE);
  const ctx = texture?.getContext();
  if (!texture || !ctx) return;
  const half = LIGHT_TEXTURE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half * Math.SQRT2);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LIGHT_TEXTURE, LIGHT_TEXTURE);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
