import { PLAYER_ATTACK } from "./balance";
import type { Vec2 } from "./movement";

// Vem do cliente: só aceita { angle: número finito }. Ângulo em radianos, 0 = direita, y cresce para baixo.
export function parseAttackAngle(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const angle = (raw as Record<string, unknown>).angle;
  return typeof angle === "number" && Number.isFinite(angle) ? angle : undefined;
}

export function isOffCooldown(lastAttackMs: number | undefined, nowMs: number): boolean {
  return lastAttackMs === undefined || nowMs - lastAttackMs >= PLAYER_ATTACK.cooldownMs;
}

// Diferença entre dois ângulos, sempre em [0, π]: 350° e 10° estão a 20°, não a 340°.
function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

// O golpe acerta `target` se ele estiver no alcance (contado da borda dele) e dentro do arco à frente.
export function isInSwing(attacker: Vec2, angle: number, target: Vec2, targetHalf: number): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const distance = Math.hypot(dx, dy);
  if (distance > PLAYER_ATTACK.range + targetHalf) return false;
  if (distance === 0) return true;
  const halfArc = (PLAYER_ATTACK.arcDegrees * Math.PI) / 180 / 2;
  return angleBetween(Math.atan2(dy, dx), angle) <= halfArc;
}

export function applyDamage(hp: number, damage: number): number {
  return Math.max(0, hp - damage);
}
