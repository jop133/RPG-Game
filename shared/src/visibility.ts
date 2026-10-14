import { VIEW_HYSTERESIS } from "./balance";
import type { Vec2 } from "./movement";

// `radius` é parâmetro porque vai variar: escuridão é raio menor (regra 4).
export function shouldSee(observer: Vec2, target: Vec2, radius: number, currentlySeen: boolean): boolean {
  const limit = currentlySeen ? radius + VIEW_HYSTERESIS : radius;
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  return dx * dx + dy * dy <= limit * limit;
}
