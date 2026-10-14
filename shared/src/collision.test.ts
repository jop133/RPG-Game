import { describe, expect, it } from "vitest";
import { type CollisionGrid, boxFits, isSolid, moveWithCollision } from "./collision";

const TILE = 32;
const HALF = 12;

// '#' = parede, qualquer outro caractere = chão.
function gridFrom(rows: string[]): CollisionGrid {
  const width = rows[0]?.length ?? 0;
  return {
    width,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

describe("isSolid", () => {
  it("fora do mapa conta como parede", () => {
    const grid = gridFrom([".."]);
    expect(isSolid(grid, -1, 0)).toBe(true);
    expect(isSolid(grid, 2, 0)).toBe(true);
    expect(isSolid(grid, 0, 1)).toBe(true);
    expect(isSolid(grid, 0, 0)).toBe(false);
  });
});

describe("boxFits", () => {
  const grid = gridFrom(["...", ".#.", "..."]);

  it("caixa inteira em chão cabe", () => {
    expect(boxFits(grid, { x: 16, y: 16 }, HALF)).toBe(true);
  });

  it("caixa encostando num tile de parede não cabe", () => {
    // x=40 ± 12 vai de 28 a 52: entra na coluna 1, que tem parede na linha 1.
    expect(boxFits(grid, { x: 40, y: 48 }, HALF)).toBe(false);
  });

  it("caixa saindo do mapa não cabe", () => {
    expect(boxFits(grid, { x: 4, y: 16 }, HALF)).toBe(false);
  });
});

describe("moveWithCollision", () => {
  it("sem parede no caminho, anda o delta inteiro", () => {
    const grid = gridFrom(["....."]);
    expect(moveWithCollision(grid, { x: 16, y: 16 }, { x: 40, y: 0 }, HALF)).toEqual({ x: 56, y: 16 });
  });

  it("para encostado na parede, sem atravessar", () => {
    const grid = gridFrom(["..#.."]);
    // A parede começa em x=64; a borda direita do jogador para ali.
    expect(moveWithCollision(grid, { x: 16, y: 16 }, { x: 100, y: 0 }, HALF).x).toBe(64 - HALF);
  });

  it("encostado na parede, continuar empurrando não faz tremer", () => {
    const grid = gridFrom(["..#.."]);
    const flush = { x: 64 - HALF, y: 16 };
    expect(moveWithCollision(grid, flush, { x: 8, y: 0 }, HALF)).toEqual(flush);
  });

  it("parede à esquerda também bloqueia", () => {
    const grid = gridFrom(["#...."]);
    expect(moveWithCollision(grid, { x: 80, y: 16 }, { x: -100, y: 0 }, HALF).x).toBe(32 + HALF);
  });

  it("andando na diagonal contra a parede, desliza ao longo dela", () => {
    const grid = gridFrom(["..#", "..#", "..#"]);
    const next = moveWithCollision(grid, { x: 64 - HALF, y: 40 }, { x: 5, y: 5 }, HALF);
    expect(next).toEqual({ x: 64 - HALF, y: 45 });
  });

  it("não sai pelos limites do mapa", () => {
    const grid = gridFrom(["...", "...", "..."]);
    expect(moveWithCollision(grid, { x: 48, y: 48 }, { x: -500, y: -500 }, HALF)).toEqual({
      x: HALF,
      y: HALF,
    });
  });

  it("deslocamento enorme (lag) não atravessa parede fina", () => {
    const grid = gridFrom(["...#......."]);
    expect(moveWithCollision(grid, { x: 16, y: 16 }, { x: 1000, y: 0 }, HALF).x).toBe(96 - HALF);
  });

  it("passa por corredor de 1 tile (jogador de 24 px, tile de 32)", () => {
    const grid = gridFrom(["#####", ".....", "#####"]);
    expect(moveWithCollision(grid, { x: 16, y: 48 }, { x: 100, y: 0 }, HALF)).toEqual({ x: 116, y: 48 });
  });

  it("caixa que ocupa duas linhas é bloqueada por parede em qualquer uma delas", () => {
    const grid = gridFrom(["....", "..#."]);
    // y=32 ± 12 cobre as linhas 0 e 1; a parede está só na linha 1.
    expect(moveWithCollision(grid, { x: 16, y: 32 }, { x: 100, y: 0 }, HALF).x).toBe(64 - HALF);
  });

  it("borda de baixo exatamente na divisa não conta como dentro da linha de baixo", () => {
    const grid = gridFrom(["....", "....", "..#."]);
    // y=52 ± 12 vai de 40 a 64. A linha 2 começa em 64, então a caixa ocupa só a linha 1, que está livre.
    expect(moveWithCollision(grid, { x: 16, y: 52 }, { x: 50, y: 0 }, HALF).x).toBe(66);
  });
});
