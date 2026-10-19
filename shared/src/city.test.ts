import { describe, expect, it } from "vitest";
import { CITY_INTERACT_RADIUS, CITY_PORTAL_RADIUS } from "./balance";
import {
  BUILDINGS,
  STATION_FOR,
  doorDestination,
  interactionAt,
  isAtPortal,
  isInteractionId,
  type InteractionPoint,
} from "./city";

const portals = [
  { x: 100, y: 100 },
  { x: 500, y: 500 },
];

describe("isAtPortal", () => {
  it("dentro do raio de qualquer portal conta, inclusive na borda", () => {
    expect(isAtPortal({ x: 100, y: 100 }, portals)).toBe(true);
    expect(isAtPortal({ x: 500 + CITY_PORTAL_RADIUS, y: 500 }, portals)).toBe(true);
  });

  it("logo além do raio não conta", () => {
    expect(isAtPortal({ x: 100 + CITY_PORTAL_RADIUS + 1, y: 100 }, portals)).toBe(false);
  });

  it("sem portais, nunca está num", () => {
    expect(isAtPortal({ x: 100, y: 100 }, [])).toBe(false);
  });
});

// Uma rua com as portas e, longe dela, as três salas com a porta de dentro e os móveis.
const points: InteractionPoint[] = [
  { id: "guild", x: 100, y: 100 },
  { id: "inn", x: 400, y: 100 },
  { id: "inn", x: 560, y: 100 },
  { id: "blacksmith", x: 400, y: 100 + CITY_INTERACT_RADIUS * 1.5 },
  { id: "guild-exit", x: 4000, y: 700 },
  { id: "guild-counter", x: 4000, y: 300 },
  { id: "guild-bestiary", x: 4300, y: 350 },
  { id: "inn-counter", x: 7000, y: 300 },
  { id: "inn-chest", x: 7500, y: 250 },
];
const arrivals = { guild: { x: 4000, y: 620 }, inn: { x: 7100, y: 620 }, blacksmith: { x: 5500, y: 520 } };
const streetDoors = { guild: { x: 100, y: 100 }, inn: { x: 400, y: 100 }, blacksmith: { x: 400, y: 172 } };

describe("interactionAt", () => {
  it("na frente de um ponto, até a borda do raio: o ponto", () => {
    expect(interactionAt({ x: 100, y: 100 }, points)).toBe("guild");
    expect(interactionAt({ x: 100 + CITY_INTERACT_RADIUS, y: 100 }, points)).toBe("guild");
  });

  it("qualquer porta do prédio serve (a Estalagem tem duas)", () => {
    expect(interactionAt({ x: 560, y: 110 }, points)).toBe("inn");
  });

  it("perto de dois pontos: vale o mais próximo", () => {
    expect(interactionAt({ x: 400, y: 100 + CITY_INTERACT_RADIUS * 0.6 }, points)).toBe("inn");
    expect(interactionAt({ x: 400, y: 100 + CITY_INTERACT_RADIUS * 0.9 }, points)).toBe("blacksmith");
  });

  it("móveis valem só na frente deles: um passo além do raio não é o balcão", () => {
    expect(interactionAt({ x: 4000, y: 300 + CITY_INTERACT_RADIUS }, points)).toBe("guild-counter");
    expect(interactionAt({ x: 4000, y: 300 + CITY_INTERACT_RADIUS + 1 }, points)).toBeUndefined();
    expect(interactionAt({ x: 7500, y: 250 }, points)).toBe("inn-chest");
  });

  it("longe de todos: nenhum", () => {
    expect(interactionAt({ x: 100 + CITY_INTERACT_RADIUS + 1, y: 100 }, points)).toBeUndefined();
    expect(interactionAt({ x: 100, y: 100 }, [])).toBeUndefined();
  });
});

describe("doorDestination (entrar e sair dos prédios)", () => {
  it("a porta da rua de cada prédio leva à chegada de dentro dele", () => {
    for (const building of BUILDINGS) expect(doorDestination(building, arrivals, streetDoors)).toEqual(arrivals[building]);
  });

  it("a porta de dentro leva de volta à porta da rua do mesmo prédio", () => {
    for (const building of BUILDINGS) {
      expect(doorDestination(`${building}-exit`, arrivals, streetDoors)).toEqual(streetDoors[building]);
    }
  });

  it("móvel ou nada não é porta", () => {
    expect(doorDestination("guild-counter", arrivals, streetDoors)).toBeUndefined();
    expect(doorDestination("inn-chest", arrivals, streetDoors)).toBeUndefined();
    expect(doorDestination(undefined, arrivals, streetDoors)).toBeUndefined();
  });

  it("entrar e sair volta exatamente para a porta da rua", () => {
    const inside = doorDestination("inn", arrivals, streetDoors);
    const pointAtExit = { id: "inn-exit" as const, x: 7100, y: 700 };
    expect(inside).toEqual(arrivals.inn);
    expect(doorDestination(interactionAt({ x: 7100, y: 690 }, [pointAtExit]), arrivals, streetDoors)).toEqual(streetDoors.inn);
  });
});

describe("STATION_FOR (onde cada pedido vale)", () => {
  it("vender no balcão da Guilda, comprar no balcão de comida, mexer no baú no Baú da Linhagem, comprar peças no balcão do ferreiro", () => {
    expect(STATION_FOR).toEqual({ sell: "guild-counter", buy: "inn-counter", stash: "inn-chest", forge: "blacksmith-counter" });
  });

  it("todo id de ponto conhecido é aceito; nome errado no mapa, não", () => {
    for (const id of ["guild", "inn-exit", "blacksmith-anvil", "guild-bestiary"]) expect(isInteractionId(id)).toBe(true);
    expect(isInteractionId("church")).toBe(false);
    expect(isInteractionId("guild-door")).toBe(false);
  });
});
