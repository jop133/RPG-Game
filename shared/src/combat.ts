import { PLAYER_ATTACK_COOLDOWN_MS } from "./balance";
import type { WeaponStats } from "./equipment";
import type { Vec2 } from "./movement";

// Vem do cliente: só aceita { angle: número finito }. Ângulo em radianos, 0 = direita, y cresce para baixo.
export function parseAttackAngle(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const angle = (raw as Record<string, unknown>).angle;
  return typeof angle === "number" && Number.isFinite(angle) ? angle : undefined;
}

export function isOffCooldown(lastAttackMs: number | undefined, nowMs: number): boolean {
  return lastAttackMs === undefined || nowMs - lastAttackMs >= PLAYER_ATTACK_COOLDOWN_MS;
}

// Diferença entre dois ângulos, sempre em [0, π]: 350° e 10° estão a 20°, não a 340°.
function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

export interface Arc {
  // Do centro de quem golpeia até a borda do alvo, em pixels.
  range: number;
  degrees: number;
}

// `target` está no arco se estiver no alcance (contado da borda dele) e dentro da abertura à frente.
export function isInArc(origin: Vec2, angle: number, arc: Arc, target: Vec2, targetHalf: number): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance > arc.range + targetHalf) return false;
  if (distance === 0) return true;
  return angleBetween(Math.atan2(dy, dx), angle) <= (arc.degrees * Math.PI) / 180 / 2;
}

// Golpe do jogador, com o alcance e o arco da arma dele (ou do soco).
export function isInSwing(attacker: Vec2, angle: number, attack: WeaponStats, target: Vec2, targetHalf: number): boolean {
  return isInArc(attacker, angle, { range: attack.range, degrees: attack.arcDegrees }, target, targetHalf);
}

export function applyDamage(hp: number, damage: number): number {
  return Math.max(0, hp - damage);
}
