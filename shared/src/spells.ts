import { GNOME_CASTER, LIGHTNING_SPELL, SPELL_CAST_RANGE, SPELL_FLATTEN, SWAMP_SPELL } from "./balance";
import { isSolid, type CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

// Magias do mago no chão: Raio Celestial (área com aviso) e Pântano de Lama (zona que deixa lento). O cliente manda só
// o slot da skill e o ponto do mouse (skills.ts); onde ela cai, quem é atingido e quem fica lento é decidido aqui e no
// servidor (regra 1).

// As magias que caem no chão (Raio e Pântano do mago; a Erupção de Cristal do gnomo). A Bola de Fogo é um projétil
// (shared/src/projectile.ts).
export type SpellKind = "lightning" | "swamp" | "crystal";

// Onde a magia cai: o ponto do mouse, puxado para dentro de SPELL_CAST_RANGE se estiver mais longe. Em parede (ou fora
// do mapa), não cai: undefined.
export function spellTarget(caster: Vec2, target: Vec2, grid: CollisionGrid): Vec2 | undefined {
  const dx = target.x - caster.x;
  const dy = target.y - caster.y;
  const distance = Math.hypot(dx, dy);
  const k = distance > SPELL_CAST_RANGE ? SPELL_CAST_RANGE / distance : 1;
  const point = { x: caster.x + dx * k, y: caster.y + dy * k };
  if (isSolid(grid, Math.floor(point.x / grid.tileSize), Math.floor(point.y / grid.tileSize))) return undefined;
  return point;
}

// Elipse no chão: centro e semieixos.
export interface GroundEllipse extends Vec2 {
  radiusX: number;
  radiusY: number;
}

export function lightningArea(at: Vec2): GroundEllipse {
  return { x: at.x, y: at.y, radiusX: LIGHTNING_SPELL.radiusX, radiusY: LIGHTNING_SPELL.radiusX * SPELL_FLATTEN };
}

// O círculo da Erupção de Cristal do gnomo (achatado como o chão).
export function crystalArea(at: Vec2): GroundEllipse {
  return { x: at.x, y: at.y, radiusX: GNOME_CASTER.crystalRadiusX, radiusY: GNOME_CASTER.crystalRadiusX * SPELL_FLATTEN };
}

export function swampArea(at: Vec2): GroundEllipse {
  return { x: at.x, y: at.y, radiusX: SWAMP_SPELL.radiusX, radiusY: SWAMP_SPELL.radiusY };
}

// Os pés de alguém (centro + `half` para baixo) dentro da elipse, com uma folga (`margin`, achatada na vertical como o
// chão): o raio acerta quem encosta na área (folga = o tamanho dele); a lama só prende quem pisa nela (folga 0).
export function feetInside(area: GroundEllipse, center: Vec2, half: number, margin = half): boolean {
  const dx = (center.x - area.x) / (area.radiusX + margin);
  const dy = (center.y + half - area.y) / (area.radiusY + margin * SPELL_FLATTEN);
  return dx * dx + dy * dy <= 1;
}

// Fator de velocidade de alguém: SWAMP_SPELL.slow se os pés estão em alguma poça ativa que não é dele, senão 1.
export function swampSlow(center: Vec2, half: number, id: string, swamps: readonly (GroundEllipse & { owner: string })[]): number {
  return swamps.some((swamp) => swamp.owner !== id && feetInside(swamp, center, half, 0)) ? SWAMP_SPELL.slow : 1;
}
