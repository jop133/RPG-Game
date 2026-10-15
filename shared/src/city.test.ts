import { describe, expect, it } from "vitest";
import { CITY_PORTAL_RADIUS } from "./balance";
import { isAtPortal } from "./city";

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
