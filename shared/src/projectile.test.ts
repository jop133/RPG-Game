import { describe, expect, it } from "vitest";
import { MAGIC_BOLT } from "./balance";
import type { CollisionGrid } from "./collision";
import { advanceProjectile, launchProjectile, stepProjectile, type Projectile } from "./projectile";

const TILE = 32;

// '#' = parede, qualquer outro caractere = chão.
function gridFrom(rows: string[]): CollisionGrid {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tileSize: TILE,
    solid: rows.flatMap((row) => [...row].map((c) => c === "#")),
  };
}

// Corredor de 20 tiles (640 px), sem paredes no caminho.
const OPEN = gridFrom(["....................", "....................", "...................."]);
const START = { x: 16, y: 48 };

function bolt(x: number, traveled = 0, angle = 0): Projectile {
  return { x, y: START.y, angle, traveled };
}

describe("launchProjectile", () => {
  it("nasce na ponta do cajado: spawnOffset px à frente de quem atira", () => {
    const step = launchProjectile(START, 0, OPEN, []);
    expect(step.kind).toBe("flying");
    if (step.kind !== "flying") return;
    expect(step.projectile.x).toBeCloseTo(START.x + MAGIC_BOLT.spawnOffset);
    expect(step.projectile.y).toBeCloseTo(START.y);
    expect(step.projectile.traveled).toBeCloseTo(MAGIC_BOLT.spawnOffset);
  });

  it("encostado num mob, acerta na hora", () => {
    const step = launchProjectile(START, 0, OPEN, [{ id: "mob-1", x: START.x + 14, y: START.y, radius: 10 }]);
    expect(step).toMatchObject({ kind: "hit", id: "mob-1" });
  });

  it("de cara para a parede, bate nela antes de sair", () => {
    const step = launchProjectile({ x: 48, y: 48 }, Math.PI, gridFrom(["#...", "#...", "#..."]), []);
    expect(step.kind).toBe("wall");
  });
});

describe("stepProjectile", () => {
  it("anda speed px/s na direção do ângulo", () => {
    const step = stepProjectile(bolt(40, 20, Math.PI / 2), 100, OPEN, []);
    expect(step.kind).toBe("flying");
    if (step.kind !== "flying") return;
    expect(step.projectile.x).toBeCloseTo(40);
    expect(step.projectile.y).toBeCloseTo(START.y + MAGIC_BOLT.speed * 0.1);
    expect(step.projectile.traveled).toBeCloseTo(20 + MAGIC_BOLT.speed * 0.1);
  });
});

describe("advanceProjectile", () => {
  it("para antes da parede, sem entrar nela", () => {
    // Parede no tile 5 (x 160 a 192).
    const step = advanceProjectile(bolt(40), 300, gridFrom([".....#....", ".....#....", ".....#...."]), []);
    expect(step.kind).toBe("wall");
    if (step.kind !== "wall") return;
    expect(step.at.x).toBeLessThan(160);
    expect(step.at.x).toBeGreaterThan(150);
  });

  it("não atravessa a quina de uma parede de um tile, mesmo num passo grande", () => {
    const step = advanceProjectile(bolt(40), 200, gridFrom(["...#......", "...#......", "...#......"]), []);
    expect(step.kind).toBe("wall");
  });

  it("acerta o primeiro alvo do caminho, não o de trás", () => {
    const targets = [
      { id: "longe", x: 200, y: START.y, radius: 10 },
      { id: "perto", x: 120, y: START.y, radius: 10 },
    ];
    const step = advanceProjectile(bolt(40), 300, OPEN, targets);
    expect(step).toMatchObject({ kind: "hit", id: "perto" });
    if (step.kind === "hit") expect(step.at.x).toBeLessThan(120);
  });

  it("passa ao lado de quem não está na linha", () => {
    const step = advanceProjectile(bolt(40), 100, OPEN, [{ id: "mob-1", x: 100, y: START.y + 30, radius: 10 }]);
    expect(step.kind).toBe("flying");
  });

  it("acaba no alcance, contado do centro de quem atirou", () => {
    const step = advanceProjectile(bolt(START.x + 300, 300), 100, OPEN, []);
    expect(step.kind).toBe("spent");
    if (step.kind !== "spent") return;
    expect(step.at.x).toBeCloseTo(START.x + MAGIC_BOLT.range);
  });

  it("alvo depois do alcance não é atingido", () => {
    const beyond = START.x + MAGIC_BOLT.range + 30;
    const step = advanceProjectile(bolt(START.x + 300, 300), 200, OPEN, [{ id: "mob-1", x: beyond, y: START.y, radius: 10 }]);
    expect(step.kind).toBe("spent");
  });
});
