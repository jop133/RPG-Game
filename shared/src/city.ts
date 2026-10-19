import { CITY_INTERACT_RADIUS, CITY_PORTAL_RADIUS } from "./balance";
import type { Vec2 } from "./movement";

// Se o centro do jogador está dentro de algum portal da cidade (o que permite entrar no labirinto).
export function isAtPortal(position: Vec2, portals: readonly Vec2[]): boolean {
  return portals.some((portal) => Math.hypot(portal.x - position.x, portal.y - position.y) <= CITY_PORTAL_RADIUS);
}

// Prédios com interior. Cada um tem a porta da rua (ponto com o id do prédio; a Estalagem tem duas), a porta de
// dentro (`<prédio>-exit`) e os móveis com E. Os ids são os nomes dos pontos da camada "interacoes" do mapa.
export const BUILDINGS = ["guild", "inn", "blacksmith"] as const;
export type BuildingId = (typeof BUILDINGS)[number];
export type ExitId = `${BuildingId}-exit`;
export const EXITS = BUILDINGS.map((building) => `${building}-exit` as ExitId);
// Móveis com E, dentro dos prédios: balcão e mesa do Bestiário (Guilda), balcão de comida e Baú da Linhagem
// (Estalagem), balcão e bigorna (Forja).
export const STATIONS = [
  "guild-counter",
  "guild-bestiary",
  "inn-counter",
  "inn-chest",
  "blacksmith-counter",
  "blacksmith-anvil",
] as const;
export type StationId = (typeof STATIONS)[number];
export type InteractionId = BuildingId | ExitId | StationId;
export const INTERACTIONS: readonly InteractionId[] = [...BUILDINGS, ...EXITS, ...STATIONS];

// Onde cada pedido da cidade tem de ser feito: o servidor só aceita com o jogador neste móvel (regra 1).
export const STATION_FOR = { sell: "guild-counter", buy: "inn-counter", stash: "inn-chest", forge: "blacksmith-counter" } as const satisfies Record<
  string,
  StationId
>;

export interface InteractionPoint extends Vec2 {
  id: InteractionId;
}

export function isInteractionId(value: string): value is InteractionId {
  return (INTERACTIONS as readonly string[]).includes(value);
}

export function isBuildingId(value: string): value is BuildingId {
  return (BUILDINGS as readonly string[]).includes(value);
}

export function isStationId(value: string): value is StationId {
  return (STATIONS as readonly string[]).includes(value);
}

// O ponto de interação em que o jogador está: o mais perto dentro de CITY_INTERACT_RADIUS. Nenhum = undefined.
export function interactionAt(position: Vec2, points: readonly InteractionPoint[]): InteractionId | undefined {
  let nearest: InteractionId | undefined;
  let nearestDistance = CITY_INTERACT_RADIUS;
  for (const point of points) {
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance > nearestDistance) continue;
    nearest = point.id;
    nearestDistance = distance;
  }
  return nearest;
}

// Para onde leva a porta `id`: a da rua, à chegada de dentro do prédio; a de dentro, à porta da rua do prédio.
// undefined = não é porta (móvel, ou nada).
export function doorDestination(
  id: InteractionId | undefined,
  arrivals: Readonly<Record<BuildingId, Vec2>>,
  streetDoors: Readonly<Record<BuildingId, Vec2>>,
): Vec2 | undefined {
  if (id === undefined) return undefined;
  if (isBuildingId(id)) return arrivals[id];
  const leaving = BUILDINGS.find((building) => id === `${building}-exit`);
  return leaving ? streetDoors[leaving] : undefined;
}
