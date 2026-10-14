import { describe, expect, it } from "vitest";
import { PLAYER_ATTACK } from "./balance";
import { applyDamage, isInSwing, isOffCooldown, parseAttackAngle } from "./combat";

const origin = { x: 0, y: 0 };
const HALF = 8;
const RIGHT = 0;
const DOWN = Math.PI / 2;
const halfArc = (PLAYER_ATTACK.arcDegrees * Math.PI) / 180 / 2;
// Ponto a `distance` pixels do atacante, na direção `angle`.
const at = (angle: number, distance: number) => ({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });

describe("parseAttackAngle", () => {
  it("aceita número finito", () => {
    expect(parseAttackAngle({ angle: 1.5 })).toBe(1.5);
  });

  it("recusa o que não é número finito (cliente malicioso)", () => {
    expect(parseAttackAngle({ angle: "1.5" })).toBeUndefined();
    expect(parseAttackAngle({ angle: Number.NaN })).toBeUndefined();
    expect(parseAttackAngle({ angle: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(parseAttackAngle(null)).toBeUndefined();
    expect(parseAttackAngle(3)).toBeUndefined();
  });
});

describe("isOffCooldown", () => {
  it("primeiro golpe sempre pode", () => {
    expect(isOffCooldown(undefined, 0)).toBe(true);
  });

  it("antes do tempo de recarga, não pode; a partir dele, pode", () => {
    expect(isOffCooldown(1000, 1000 + PLAYER_ATTACK.cooldownMs - 1)).toBe(false);
    expect(isOffCooldown(1000, 1000 + PLAYER_ATTACK.cooldownMs)).toBe(true);
  });
});

describe("isInSwing", () => {
  it("alvo à frente, no alcance, é atingido", () => {
    expect(isInSwing(origin, RIGHT, at(RIGHT, 30), HALF)).toBe(true);
  });

  it("alcance conta da borda do alvo: alvo maior é atingido mais longe", () => {
    const distance = PLAYER_ATTACK.range + 10;
    expect(isInSwing(origin, RIGHT, at(RIGHT, distance), 8)).toBe(false);
    expect(isInSwing(origin, RIGHT, at(RIGHT, distance), 12)).toBe(true);
  });

  it("alvo atrás não é atingido", () => {
    expect(isInSwing(origin, RIGHT, at(Math.PI, 20), HALF)).toBe(false);
  });

  it("borda do arco: um pouco dentro acerta, um pouco fora não", () => {
    expect(isInSwing(origin, RIGHT, at(halfArc - 0.01, 30), HALF)).toBe(true);
    expect(isInSwing(origin, RIGHT, at(halfArc + 0.01, 30), HALF)).toBe(false);
  });

  it("arco atravessando o ângulo 0: mirando a 350°, alvo a 10° está dentro", () => {
    const aim = (350 * Math.PI) / 180;
    expect(isInSwing(origin, aim, at((10 * Math.PI) / 180, 30), HALF)).toBe(true);
  });

  it("y cresce para baixo, como na tela: mirar para baixo acerta quem está embaixo", () => {
    expect(isInSwing(origin, DOWN, { x: 0, y: 30 }, HALF)).toBe(true);
    expect(isInSwing(origin, DOWN, { x: 0, y: -30 }, HALF)).toBe(false);
  });

  it("alvo exatamente em cima do atacante é atingido", () => {
    expect(isInSwing(origin, RIGHT, origin, HALF)).toBe(true);
  });
});

describe("applyDamage", () => {
  it("tira o dano da vida", () => {
    expect(applyDamage(30, 10)).toBe(20);
  });

  it("nunca fica negativa", () => {
    expect(applyDamage(5, 10)).toBe(0);
  });
});
