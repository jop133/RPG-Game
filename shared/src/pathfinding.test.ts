import { describe, expect, it } from "vitest";
import { type CollisionGrid, isSolid } from "./collision";
import type { Vec2 } from "./movement";
import { findPath } from "./pathfinding";

const TILE = 32;

function gridFrom(rows: string[]): CollisionGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

const center = (col: number, row: number): Vec2 => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
const tile = (p: Vec2) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;

// Confere as regras que valem para qualquer caminho e devolve o custo total (1 reto, √2 diagonal).
function checkPath(grid: CollisionGrid, from: Vec2, path: Vec2[]): number {
  let [col, row] = tile(from);
  let cost = 0;
  for (const step of path) {
    const [c, r] = tile(step);
    const dc = c - col;
    const dr = r - row;
    expect(Math.abs(dc) <= 1 && Math.abs(dr) <= 1 && (dc !== 0 || dr !== 0)).toBe(true);
    expect(isSolid(grid, c, r)).toBe(false);
    if (dc !== 0 && dr !== 0) {
      expect(isSolid(grid, col + dc, row) || isSolid(grid, col, row + dr)).toBe(false);
      cost += Math.SQRT2;
    } else {
      cost += 1;
    }
    expect(step).toEqual(center(c, r));
    [col, row] = [c, r];
  }
  return cost;
}

describe("findPath", () => {
  it("em linha reta, passa pelos centros dos tiles", () => {
    const grid = gridFrom(["....."]);
    expect(findPath(grid, center(0, 0), center(3, 0))).toEqual([center(1, 0), center(2, 0), center(3, 0)]);
  });

  it("usa diagonal quando está livre", () => {
    const grid = gridFrom(["...", "...", "..."]);
    expect(findPath(grid, center(0, 0), center(2, 2))).toEqual([center(1, 1), center(2, 2)]);
  });

  it("não corta quina: com parede ao lado, a diagonal vira dois passos retos", () => {
    const grid = gridFrom([".#", ".."]);
    expect(findPath(grid, center(0, 0), center(1, 1))).toEqual([center(0, 1), center(1, 1)]);
  });

  it("já no destino (mesmo tile), caminho vazio", () => {
    const grid = gridFrom(["..."]);
    expect(findPath(grid, { x: 5, y: 5 }, { x: 25, y: 20 })).toEqual([]);
  });

  it("contorna parede pelo caminho mais curto", () => {
    const grid = gridFrom([
      ".......",
      "...#...",
      "...#...",
      "...#...",
      ".......",
    ]);
    const from = center(1, 2);
    const path = findPath(grid, from, center(5, 2));
    expect(path).toBeDefined();
    // Mínimo possível sem cortar quina: chegar ao lado da ponta da parede (1 + √2), passar por ela andando reto
    // (2 passos: as diagonais ali cortariam a quina) e descer do outro lado (1 + √2) = 4 + 2√2.
    expect(checkPath(grid, from, path as Vec2[])).toBeCloseTo(4 + 2 * Math.SQRT2);
    expect(path?.at(-1)).toEqual(center(5, 2));
  });

  it("de uma sala para outra pela porta de 1 tile", () => {
    const grid = gridFrom([
      "#########",
      "#...#...#",
      "#.......#",
      "#...#...#",
      "#########",
    ]);
    const from = center(1, 1);
    const path = findPath(grid, from, center(7, 3));
    expect(path).toBeDefined();
    checkPath(grid, from, path as Vec2[]);
    expect(path).toContainEqual(center(4, 2));
  });

  it("destino fora de alcance (sala fechada): vai até o tile mais perto dele", () => {
    const grid = gridFrom(["..#..", "..#..", "..#.."]);
    expect(findPath(grid, center(0, 1), center(4, 1))).toEqual([center(1, 1)]);
  });

  it("fora de alcance e já no tile mais perto: [] (fica onde está)", () => {
    const grid = gridFrom([".#..", ".#..", ".#.."]);
    expect(findPath(grid, center(0, 1), center(3, 1))).toEqual([]);
  });

  it("destino dentro de parede: sem caminho", () => {
    const grid = gridFrom(["..#"]);
    expect(findPath(grid, center(0, 0), center(2, 0))).toBeUndefined();
  });

  it("no mapa de teste inteiro (40×30), cruza salas e respeita todas as regras", () => {
    const rows = Array.from({ length: 30 }, (_, r) =>
      Array.from({ length: 40 }, (_, c) => {
        const border = r === 0 || r === 29 || c === 0 || c === 39;
        const middle = r === 14 && c !== 6 && c !== 30 && c !== 31;
        const top = c === 20 && r < 14 && r !== 5 && r !== 6;
        const bottom = c === 26 && r > 14 && r !== 22;
        return border || middle || top || bottom ? "#" : ".";
      }).join(""),
    );
    const grid = gridFrom(rows);
    const from = center(2, 2);
    const path = findPath(grid, from, center(36, 26));
    expect(path).toBeDefined();
    checkPath(grid, from, path as Vec2[]);
  });
});

describe("findPath com limite de tiles explorados", () => {
  // Corredor em U em volta de um bloco sólido: de baixo à esquerda até em cima à direita é preciso dar a volta.
  // (Bolsão sem saída mais perto do destino que o limite consegue explorar prenderia o trecho parcial: ver DECISIONS.)
  const corridor = gridFrom([
    "..........",
    ".########.",
    ".########.",
    ".########.",
    ".########.",
    "..........",
  ]);

  it("sem limite apertado, chega ao destino", () => {
    const path = findPath(corridor, center(0, 0), center(9, 0));
    expect(path?.at(-1)).toEqual(center(9, 0));
  });

  it("limite baixo: caminho parcial válido (sem cortar quina) até o tile explorado mais perto do destino", () => {
    const from = center(0, 0);
    const goal = center(9, 0);
    const path = findPath(corridor, from, goal, 6) as Vec2[];
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).not.toEqual(goal);
    checkPath(corridor, from, path);
    const last = tile(path.at(-1) as Vec2);
    expect(Math.abs(9 - last[0])).toBeLessThan(9);
  });

  it("seguir os trechos parciais, um após o outro, chega ao destino", () => {
    let at = center(0, 5);
    const goal = center(9, 0);
    for (let leg = 0; leg < 20 && !(tile(at)[0] === 9 && tile(at)[1] === 0); leg++) {
      const path = findPath(corridor, at, goal, 4) as Vec2[];
      expect(path.length).toBeGreaterThan(0);
      checkPath(corridor, at, path);
      at = path.at(-1) as Vec2;
    }
    expect(at).toEqual(goal);
  });
});

describe("findPath num andar 500x500 (250.000 tiles)", () => {
  // Pilares espalhados (parede a cada 7 tiles, com vãos) e uma sala fechada no canto oposto.
  const SIZE = 500;
  const solid: boolean[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const pillar = r % 7 === 3 && c % 11 < 8;
      const vault = c >= 480 && r >= 480 && (c === 480 || r === 480);
      solid.push(pillar || vault);
    }
  }
  const big: CollisionGrid = { width: SIZE, height: SIZE, tileSize: TILE, solid };

  function averageMs(run: () => void, times = 30): number {
    run();
    const startedAt = performance.now();
    for (let i = 0; i < times; i++) run();
    return (performance.now() - startedAt) / times;
  }

  it("destino do outro lado do mapa: caminho parcial na direção certa, em poucos ms", () => {
    const from = center(2, 2);
    const path = findPath(big, from, center(470, 495)) as Vec2[];
    expect(path.length).toBeGreaterThan(0);
    checkPath(big, from, path);
    const [c, r] = tile(path.at(-1) as Vec2);
    expect(c + r).toBeGreaterThan(2 + 2);
    expect(averageMs(() => findPath(big, from, center(470, 495)))).toBeLessThan(10);
  });

  it("destino trancado numa sala: não varre o mapa inteiro, também em poucos ms", () => {
    const path = findPath(big, center(250, 250), center(490, 490)) as Vec2[];
    expect(path.length).toBeGreaterThan(0);
    expect(averageMs(() => findPath(big, center(250, 250), center(490, 490)))).toBeLessThan(10);
  });
});
