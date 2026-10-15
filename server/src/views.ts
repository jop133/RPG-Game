import type { StateView } from "@colyseus/schema";
import { VIEW_RADIUS, shouldSee, type Vec2 } from "shared";

type Entity = Parameters<StateView["add"]>[0] & Vec2;

// Interest management (regra 5): põe na visão do observador o que entrou no raio e tira o que saiu.
export function updateVisibility(view: StateView, observer: Vec2, entity: Entity) {
  const seen = view.has(entity);
  const see = shouldSee(observer, entity, VIEW_RADIUS, seen);
  if (see && !seen) view.add(entity);
  if (!see && seen) view.remove(entity);
}
