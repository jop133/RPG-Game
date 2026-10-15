import { describe, expect, it } from "vitest";
import { CITY_INTERACT_RADIUS, CITY_PORTAL_RADIUS } from "./balance";
import { buildingAt, isAtPortal, isBuildingId, type BuildingPoint } from "./city";

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

describe("buildingAt", () => {
  const doors: BuildingPoint[] = [
    { building: "guild", x: 100, y: 100 },
    { building: "inn", x: 400, y: 100 },
    { building: "inn", x: 560, y: 100 },
    { building: "blacksmith", x: 400, y: 100 + CITY_INTERACT_RADIUS * 1.5 },
  ];

  it("na frente de uma porta, até a borda do raio: o prédio dela", () => {
    expect(buildingAt({ x: 100, y: 100 }, doors)).toBe("guild");
    expect(buildingAt({ x: 100 + CITY_INTERACT_RADIUS, y: 100 }, doors)).toBe("guild");
  });

  it("qualquer porta do prédio serve (a Estalagem tem duas)", () => {
    expect(buildingAt({ x: 560, y: 110 }, doors)).toBe("inn");
  });

  it("perto de duas portas: vale a mais próxima", () => {
    expect(buildingAt({ x: 400, y: 100 + CITY_INTERACT_RADIUS * 0.6 }, doors)).toBe("inn");
    expect(buildingAt({ x: 400, y: 100 + CITY_INTERACT_RADIUS * 0.9 }, doors)).toBe("blacksmith");
  });

  it("longe de todas: nenhum", () => {
    expect(buildingAt({ x: 100 + CITY_INTERACT_RADIUS + 1, y: 100 }, doors)).toBeUndefined();
    expect(buildingAt({ x: 100, y: 100 }, [])).toBeUndefined();
  });
});

describe("isBuildingId", () => {
  it("só os três prédios com janela", () => {
    expect(["guild", "inn", "blacksmith"].every(isBuildingId)).toBe(true);
    expect(isBuildingId("church")).toBe(false);
    expect(isBuildingId("")).toBe(false);
  });
});
