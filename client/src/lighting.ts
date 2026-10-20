import Phaser from "phaser";
import { type CollisionGrid, lightReach, type Vec2 } from "shared";

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
// No labirinto a parede corta a luz (setOccluder): cada luz vira um leque de raios que param na primeira parede
// (lightReach, a mesma regra do servidor), desenhado em triângulos com a cor em cada vértice seguindo o mesmo degradê
// da mancha; o ambiente é preto puro. Por cima, a vista de quem joga: tudo o que está atrás de parede, a partir dele,
// fica preto opaco (com uma borda suave de VIEW_SOFT px), mesmo que alguma luz chegue lá.

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
// Degradê da mancha (o de lightTexture), em fração do raio: a textura de 256 px cobre o diâmetro, e o degradê vai do
// centro até LIGHT_EDGE com as paradas 0, 0,25, 0,65 e 1. Força da cor em cada parada.
const FALLOFF_STOPS = [0, 0.25, 0.65, 1].map((t) => (t * LIGHT_EDGE) / (LIGHT_TEXTURE / 2));
const FALLOFF_LEVELS = [1, 220 / 255, 90 / 255, 0];
// A luz entra um pouco na parede que a para: a face do muro de frente para a luz fica iluminada. Para cima entra mais
// (até WALL_REVEAL + WALL_REVEAL_UP): na vista 3/4 a face do muro ao norte ocupa o tile de cima, e a cabeça de quem
// está encostado nele também.
const WALL_REVEAL = 10;
const WALL_REVEAL_UP = 30;
// Raios por luz: um a cada ~10 px da borda, entre 48 e 160.
const MIN_RAYS = 48;
const MAX_RAYS = 160;
// Vista de quem joga: raios em volta dele e a borda suave da sombra das paredes.
const VIEW_RAYS = 360;
const VIEW_SOFT = 12;
// Leques das luzes paradas guardados (as do mapa e as saídas); passou disto, começa de novo.
const FAN_CACHE_MAX = 4000;

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
  // Com parede cortando a luz: a grade, os triângulos das luzes (ADD), a sombra da vista (preto) e os leques guardados.
  private occluder?: CollisionGrid;
  private readonly fans: Phaser.GameObjects.Graphics;
  private readonly shade: Phaser.GameObjects.Graphics;
  private readonly fanCache = new Map<string, Float32Array>();

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
    // Fora da cena: só são desenhados dentro das camadas.
    this.fans = scene.make.graphics({}, false).setBlendMode(Phaser.BlendModes.ADD);
    this.shade = scene.make.graphics({}, false);
  }

  // Liga a parede cortando a luz (labirinto). Sem isto, a luz é um círculo (cidade).
  setOccluder(grid: CollisionGrid) {
    this.occluder = grid;
    this.fanCache.clear();
  }

  // Troca o ambiente e a força da vinheta (ex.: ao entrar num prédio, salão claro e quente; ao sair, a noite da rua).
  setLook(ambient: number, vignetteAlpha: number) {
    this.ambient = ambient;
    this.vignette.setAlpha(vignetteAlpha);
  }

  // Cor da vinheta (branco = a da arte, preta; outra cor pinta a borda inteira dela, ex.: azul-gelo na zona dos lobos).
  // Preenche em vez de multiplicar: preto multiplicado por qualquer cor continua preto.
  setVignetteTint(color: number) {
    if (color === 0xffffff) this.vignette.clearTint();
    else this.vignette.setTintFill(color);
  }

  resize(width: number, height: number) {
    this.layer.resize(width, height);
    this.glow.resize(width, height);
    this.vignette.setDisplaySize(width, height);
  }

  // Redesenha as duas camadas com as luzes deste quadro. Luz fora da tela é pulada. Uma camada de cada vez: com as
  // duas abertas (beginDraw) ao mesmo tempo, o WebGL desenha tudo no mesmo framebuffer. `viewer`: de onde quem joga
  // olha (com parede cortando a luz, o que está atrás de parede a partir dele fica preto).
  draw(lights: readonly Light[], time: number, viewer?: Vec2) {
    const view = this.scene.cameras.main.worldView;
    const stamps = lights.flatMap((light) => {
      const r = light.radius;
      if (light.x + r < view.x || light.x - r > view.right || light.y + r < view.y || light.y - r > view.bottom) return [];
      const { strength, scale } = wobble(light, time);
      return [{ light, x: light.x - view.x, y: light.y - view.y, size: ((r * 2) / LIGHT_TEXTURE) * scale, strength, scale }];
    });
    if (this.occluder) {
      this.drawOccluded(this.occluder, stamps, view, viewer);
      return;
    }
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

  // Luz com parede: os leques das luzes somados (ADD) sobre o ambiente e, por cima, a sombra da vista. O brilho
  // colorido usa os mesmos leques, menores, e a mesma sombra.
  private drawOccluded(
    grid: CollisionGrid,
    stamps: readonly { light: Light; x: number; y: number; strength: number; scale: number }[],
    view: Phaser.Geom.Rectangle,
    viewer: Vec2 | undefined,
  ) {
    const fans = stamps.map((s) => ({ ...s, fan: this.fanOf(grid, s.light) }));
    this.shade.clear();
    if (viewer) drawViewShade(this.shade, grid, viewer, view);
    this.fans.clear();
    for (const f of fans) fillFan(this.fans, f.x, f.y, f.fan, f.light.radius * f.scale, scaled(f.light.look.color, f.strength));
    this.layer.clear().fill(this.ambient, 1);
    this.layer.draw(this.fans);
    this.layer.draw(this.shade);
    this.fans.clear();
    for (const f of fans) {
      if (!f.light.kind) continue;
      fillFan(this.fans, f.x, f.y, f.fan, f.light.radius * f.scale * GLOW_SIZE, scaled(f.light.look.color, f.strength * GLOW_STRENGTH));
    }
    this.glow.clear().fill(0x000000, 1);
    this.glow.draw(this.fans);
    this.glow.draw(this.shade);
  }

  // Leque de uma luz: as do mapa e as saídas não se mexem e ficam guardadas; as outras, a cada quadro.
  private fanOf(grid: CollisionGrid, light: Light): Float32Array {
    if (!light.kind) return castFan(grid, light, light.radius);
    const key = `${light.x},${light.y},${light.radius}`;
    let fan = this.fanCache.get(key);
    if (!fan) {
      if (this.fanCache.size >= FAN_CACHE_MAX) this.fanCache.clear();
      fan = castFan(grid, light, light.radius);
      this.fanCache.set(key, fan);
    }
    return fan;
  }
}

// Cos e sen de n raios em volta (cada quantidade de raios calculada uma vez).
const DIRECTIONS = new Map<number, { cos: Float32Array; sin: Float32Array }>();
function directions(n: number): { cos: Float32Array; sin: Float32Array } {
  let dirs = DIRECTIONS.get(n);
  if (!dirs) {
    const cos = new Float32Array(n);
    const sin = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      cos[i] = Math.cos((i / n) * Math.PI * 2);
      sin[i] = Math.sin((i / n) * Math.PI * 2);
    }
    dirs = { cos, sin };
    DIRECTIONS.set(n, dirs);
  }
  return dirs;
}

// Até onde vai cada raio de uma luz (px do centro): o raio inteiro, ou a primeira parede (entrando nela WALL_REVEAL, e
// mais para cima).
function castFan(grid: CollisionGrid, from: Vec2, radius: number, rays = Math.min(MAX_RAYS, Math.max(MIN_RAYS, Math.ceil((Math.PI * 2 * radius) / 10)))): Float32Array {
  const { cos, sin } = directions(rays);
  const out = new Float32Array(rays);
  for (let i = 0; i < rays; i++) {
    const t = lightReach(grid, from, { x: from.x + (cos[i] ?? 0) * radius, y: from.y + (sin[i] ?? 0) * radius });
    const reveal = WALL_REVEAL + WALL_REVEAL_UP * Math.max(0, -(sin[i] ?? 0));
    out[i] = t >= 1 ? radius : Math.min(radius, t * radius + reveal);
  }
  return out;
}

// Força do degradê a uma distância d do centro, numa luz de raio r (linear entre as paradas, como no canvas).
function falloff(d: number, r: number): number {
  const t = d / r;
  for (let k = 1; k < FALLOFF_STOPS.length; k++) {
    const t1 = FALLOFF_STOPS[k] ?? 1;
    if (t > t1) continue;
    const t0 = FALLOFF_STOPS[k - 1] ?? 0;
    const l0 = FALLOFF_LEVELS[k - 1] ?? 0;
    const l1 = FALLOFF_LEVELS[k] ?? 0;
    return l0 + ((l1 - l0) * (t - t0)) / (t1 - t0 || 1);
  }
  return 0;
}

// Desenha o leque de uma luz centrada em (cx, cy) (na camada) com raio r e cor `color`: entre cada dois raios, um anel
// por trecho do degradê, cortado onde cada raio bateu na parede. A cor de cada vértice é a do degradê ali; a placa de
// vídeo interpola no meio.
function fillFan(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fan: Float32Array, r: number, color: number) {
  const n = fan.length;
  const { cos, sin } = directions(n);
  const rings = FALLOFF_STOPS.map((t) => t * r);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const di = fan[i] ?? 0;
    const dj = fan[j] ?? 0;
    const ci = cos[i] ?? 0;
    const si = sin[i] ?? 0;
    const cj = cos[j] ?? 0;
    const sj = sin[j] ?? 0;
    for (let k = 0; k + 1 < rings.length; k++) {
      const i0 = Math.min(rings[k] ?? 0, di);
      const i1 = Math.min(rings[k + 1] ?? 0, di);
      const j0 = Math.min(rings[k] ?? 0, dj);
      const j1 = Math.min(rings[k + 1] ?? 0, dj);
      // Os dois raios já tinham parado antes deste anel: nada a desenhar.
      if (i0 === i1 && j0 === j1) continue;
      const a = scaled(color, falloff(i0, r));
      const b = scaled(color, falloff(i1, r));
      const c = scaled(color, falloff(j1, r));
      const d = scaled(color, falloff(j0, r));
      g.fillGradientStyle(a, b, c, c);
      g.fillTriangle(cx + ci * i0, cy + si * i0, cx + ci * i1, cy + si * i1, cx + cj * j1, cy + sj * j1);
      if (k === 0) continue;
      g.fillGradientStyle(a, c, d, d);
      g.fillTriangle(cx + ci * i0, cy + si * i0, cx + cj * j1, cy + sj * j1, cx + cj * j0, cy + sj * j0);
    }
  }
}

// Sombra da vista: a partir de quem joga, tudo além da primeira parede (entrando WALL_REVEAL nela) fica preto opaco,
// com VIEW_SOFT px de passagem suave. Desenhado em coordenadas da camada (o canto da tela é a origem).
function drawViewShade(g: Phaser.GameObjects.Graphics, grid: CollisionGrid, viewer: Vec2, view: Phaser.Geom.Rectangle) {
  const reach = Math.hypot(view.width, view.height);
  const far = reach * 2;
  const fan = castFan(grid, viewer, reach, VIEW_RAYS);
  const { cos, sin } = directions(VIEW_RAYS);
  const cx = viewer.x - view.x;
  const cy = viewer.y - view.y;
  for (let i = 0; i < VIEW_RAYS; i++) {
    const j = (i + 1) % VIEW_RAYS;
    const di = fan[i] ?? reach;
    const dj = fan[j] ?? reach;
    // Raio que não bateu em nada já passou da tela: não há sombra a desenhar dele.
    if (di >= reach && dj >= reach) continue;
    const ci = cos[i] ?? 0;
    const si = sin[i] ?? 0;
    const cj = cos[j] ?? 0;
    const sj = sin[j] ?? 0;
    const oi = di + VIEW_SOFT;
    const oj = dj + VIEW_SOFT;
    // Borda suave: de transparente (na parede) a preto (VIEW_SOFT px depois).
    g.fillGradientStyle(0, 0, 0, 0, 0, 0, 1, 1);
    g.fillTriangle(cx + ci * di, cy + si * di, cx + cj * dj, cy + sj * dj, cx + ci * oi, cy + si * oi);
    g.fillGradientStyle(0, 0, 0, 0, 0, 1, 1, 1);
    g.fillTriangle(cx + cj * dj, cy + sj * dj, cx + cj * oj, cy + sj * oj, cx + ci * oi, cy + si * oi);
    // Daí para fora, preto.
    g.fillStyle(0x000000, 1);
    g.fillTriangle(cx + ci * oi, cy + si * oi, cx + cj * oj, cy + sj * oj, cx + cj * far, cy + sj * far);
    g.fillTriangle(cx + ci * oi, cy + si * oi, cx + cj * far, cy + sj * far, cx + ci * far, cy + si * far);
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
