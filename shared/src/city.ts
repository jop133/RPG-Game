import { CITY_INTERACT_RADIUS, CITY_PORTAL_RADIUS } from "./balance";
import type { Vec2 } from "./movement";

// Se o centro do jogador está dentro de algum portal da cidade (o que permite entrar no labirinto).
export function isAtPortal(position: Vec2, portals: readonly Vec2[]): boolean {
  return portals.some((portal) => Math.hypot(portal.x - position.x, portal.y - position.y) <= CITY_PORTAL_RADIUS);
}

// Prédios da cidade com janela (E na frente da porta). O id é o nome do ponto na camada "interacoes" do mapa;
// um prédio pode ter mais de um ponto (a Estalagem tem a porta da taverna e a do cofre).
export const BUILDINGS = ["guild", "inn", "blacksmith"] as const;
export type BuildingId = (typeof BUILDINGS)[number];

export interface BuildingPoint extends Vec2 {
  building: BuildingId;
}

export function isBuildingId(value: string): value is BuildingId {
  return (BUILDINGS as readonly string[]).includes(value);
}

// O prédio em cuja porta o jogador está: o ponto mais perto dentro de CITY_INTERACT_RADIUS. Nenhum = undefined.
export function buildingAt(position: Vec2, points: readonly BuildingPoint[]): BuildingId | undefined {
  let nearest: BuildingId | undefined;
  let nearestDistance = CITY_INTERACT_RADIUS;
  for (const point of points) {
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance > nearestDistance) continue;
    nearest = point.building;
    nearestDistance = distance;
  }
  return nearest;
}
