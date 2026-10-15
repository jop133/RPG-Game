import { CITY_PORTAL_RADIUS } from "./balance";
import type { Vec2 } from "./movement";

// Se o centro do jogador está dentro de algum portal da cidade (o que permite entrar no labirinto).
export function isAtPortal(position: Vec2, portals: readonly Vec2[]): boolean {
  return portals.some((portal) => Math.hypot(portal.x - position.x, portal.y - position.y) <= CITY_PORTAL_RADIUS);
}
