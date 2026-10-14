import { describe, expect, it } from "vitest";
import { type Area, areaAt, rectContains, validateAreas } from "./areas";

const rect = { x: 10, y: 20, width: 100, height: 50 };

describe("rectContains", () => {
  it("ponto no meio está dentro", () => {
    expect(rectContains(rect, { x: 50, y: 40 })).toBe(true);
  });

  it("borda esquerda e de cima contam como dentro", () => {
    expect(rectContains(rect, { x: 10, y: 20 })).toBe(true);
  });

  it("borda direita e de baixo contam como fora (vizinhos não disputam o ponto)", () => {
    expect(rectContains(rect, { x: 110, y: 40 })).toBe(false);
    expect(rectContains(rect, { x: 50, y: 70 })).toBe(false);
  });
});

const areas: Area[] = [
  { name: "salao", rects: [{ x: 0, y: 0, width: 100, height: 100 }] },
  // Área em L: dois retângulos com o mesmo nome.
  {
    name: "tuneis",
    rects: [
      { x: 200, y: 0, width: 50, height: 200 },
      { x: 200, y: 200, width: 200, height: 50 },
    ],
  },
];

describe("areaAt", () => {
  it("acha a área pelo retângulo que contém o ponto", () => {
    expect(areaAt(areas, { x: 50, y: 50 })?.name).toBe("salao");
  });

  it("qualquer retângulo da área conta (área em L)", () => {
    expect(areaAt(areas, { x: 220, y: 10 })?.name).toBe("tuneis");
    expect(areaAt(areas, { x: 380, y: 220 })?.name).toBe("tuneis");
  });

  it("fora de todos os retângulos, nenhuma área", () => {
    // Dentro da "caixa" do L, mas fora dos dois retângulos.
    expect(areaAt(areas, { x: 380, y: 10 })).toBeUndefined();
  });
});

describe("validateAreas", () => {
  const configs = { salao: { playerEntry: true }, tuneis: { playerEntry: false } };

  it("mapa e configuração batendo, sem erros", () => {
    expect(validateAreas(areas, configs, [{ x: 50, y: 50 }])).toEqual([]);
  });

  it("área no mapa sem configuração", () => {
    expect(validateAreas(areas, { salao: { playerEntry: true } }, [])).toEqual([
      expect.stringContaining('"tuneis" do mapa não está em AREAS'),
    ]);
  });

  it("configuração sem área no mapa (erro de digitação, por exemplo)", () => {
    expect(validateAreas(areas, { ...configs, tunesi: { playerEntry: true } }, [])).toEqual([
      expect.stringContaining('AREAS tem "tunesi"'),
    ]);
  });

  it("ponto de spawn fora de qualquer área", () => {
    expect(validateAreas(areas, configs, [{ x: 380, y: 10 }])).toEqual([
      expect.stringContaining("(380, 10) está fora de qualquer área"),
    ]);
  });
});
