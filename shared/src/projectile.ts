import { MAGIC_BOLT } from "./balance";
import { isSolid, type CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

// Projétil Mágico em voo (MAGIC_BOLT): onde está, para onde vai (radianos, 0 = direita) e quanto já andou desde o
// centro de quem atirou (px). Tudo decidido no servidor; o cliente só desenha (regra 1).
// Velocidade (px/s), alcance (px, do centro de quem atirou), raio para acertar e de onde nasce (px à frente) de um tipo
// de projétil. Sem nada, o Projétil Mágico (MAGIC_BOLT); os mobs têm os seus (adaga do goblin, projétil do gnomo).
export interface ProjectileSpec {
  speed: number;
  range: number;
  radius: number;
  spawnOffset: number;
}

export interface Projectile extends Vec2 {
  angle: number;
  traveled: number;
}

// Quem pode ser atingido: um círculo de raio `radius` (mob ou jogador).
export interface ProjectileTarget extends Vec2 {
  id: string;
  radius: number;
}

// Resultado de mover um projétil: continua voando, acertou alguém, bateu na parede ou acabou o alcance. `at` é onde
// ele parou (o ponto do impacto, para o cliente desenhar a explosão).
export type ProjectileStep =
  | { kind: "flying"; projectile: Projectile }
  | { kind: "hit"; id: string; at: Vec2 }
  | { kind: "wall"; at: Vec2 }
  | { kind: "spent"; at: Vec2 };

// Passo máximo do teste de colisão, em px: menor que um tile e que qualquer alvo, então nada é atravessado.
const SUBSTEP_PX = 4;

// O disparo: nasce no centro de quem atira e já anda MAGIC_BOLT.spawnOffset px (até a ponta do cajado), testando
// parede e alvos no caminho; atirar encostado na parede ou num mob acerta na hora.
export function launchProjectile(
  from: Vec2,
  angle: number,
  grid: CollisionGrid,
  targets: readonly ProjectileTarget[],
  spec: ProjectileSpec = MAGIC_BOLT,
): ProjectileStep {
  return advanceProjectile({ x: from.x, y: from.y, angle, traveled: 0 }, spec.spawnOffset, grid, targets, spec);
}

// Um tick de voo: anda MAGIC_BOLT.speed px/s.
export function stepProjectile(
  projectile: Projectile,
  dtMs: number,
  grid: CollisionGrid,
  targets: readonly ProjectileTarget[],
  spec: ProjectileSpec = MAGIC_BOLT,
): ProjectileStep {
  return advanceProjectile(projectile, (spec.speed * dtMs) / 1000, grid, targets, spec);
}

// Anda `distance` px em linha reta, em passos de até SUBSTEP_PX. Em cada passo: parede (o centro entra num tile
// sólido) para antes dela; alvo (círculo encostando no do projétil) para nele, o mais próximo primeiro; passar do
// alcance (MAGIC_BOLT.range, contado do centro de quem atirou) acaba no ponto do alcance.
export function advanceProjectile(
  projectile: Projectile,
  distance: number,
  grid: CollisionGrid,
  targets: readonly ProjectileTarget[],
  spec: ProjectileSpec = MAGIC_BOLT,
): ProjectileStep {
  const dx = Math.cos(projectile.angle);
  const dy = Math.sin(projectile.angle);
  const total = Math.min(distance, spec.range - projectile.traveled);
  let moved = 0;
  let at: Vec2 = { x: projectile.x, y: projectile.y };
  while (moved < total) {
    const step = Math.min(SUBSTEP_PX, total - moved);
    const next = { x: at.x + dx * step, y: at.y + dy * step };
    if (isSolid(grid, Math.floor(next.x / grid.tileSize), Math.floor(next.y / grid.tileSize))) return { kind: "wall", at };
    const hit = nearestTouching(next, targets, spec.radius);
    if (hit) return { kind: "hit", id: hit.id, at: next };
    at = next;
    moved += step;
  }
  const traveled = projectile.traveled + moved;
  if (traveled >= spec.range - 1e-9) return { kind: "spent", at };
  return { kind: "flying", projectile: { ...at, angle: projectile.angle, traveled } };
}

function nearestTouching(point: Vec2, targets: readonly ProjectileTarget[], radius: number): ProjectileTarget | undefined {
  let best: ProjectileTarget | undefined;
  let bestDistance = Infinity;
  for (const target of targets) {
    const d = Math.hypot(target.x - point.x, target.y - point.y);
    if (d <= target.radius + radius && d < bestDistance) {
      best = target;
      bestDistance = d;
    }
  }
  return best;
}
