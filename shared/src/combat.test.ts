import { describe, expect, it } from "vitest";
import { ITEMS, PLAYER_ATTACK_COOLDOWN_MS, UNARMED_ATTACK } from "./balance";
import { applyDamage, isInArc, isInSwing, isOffCooldown, parseAttackAngle } from "./combat";

const origin = { x: 0, y: 0 };
const HALF = 8;
const RIGHT = 0;
const DOWN = Math.PI / 2;
const SWORD = ITEMS.espada_ferro.equip.weapon;
const halfArc = (SWORD.arcDegrees * Math.PI) / 180 / 2;
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
    expect(isOffCooldown(1000, 1000 + PLAYER_ATTACK_COOLDOWN_MS - 1)).toBe(false);
    expect(isOffCooldown(1000, 1000 + PLAYER_ATTACK_COOLDOWN_MS)).toBe(true);
  });
});

describe("isInSwing", () => {
  it("alvo à frente, no alcance, é atingido", () => {
    expect(isInSwing(origin, RIGHT, SWORD, at(RIGHT, 30), HALF)).toBe(true);
  });

  it("alcance conta da borda do alvo: alvo maior é atingido mais longe", () => {
    const distance = SWORD.range + 10;
    expect(isInSwing(origin, RIGHT, SWORD, at(RIGHT, distance), 8)).toBe(false);
    expect(isInSwing(origin, RIGHT, SWORD, at(RIGHT, distance), 12)).toBe(true);
  });

  it("o soco alcança menos que a espada", () => {
    const target = at(RIGHT, (UNARMED_ATTACK.range + SWORD.range) / 2);
    expect(isInSwing(origin, RIGHT, SWORD, target, 0)).toBe(true);
    expect(isInSwing(origin, RIGHT, UNARMED_ATTACK, target, 0)).toBe(false);
  });

  it("alvo atrás não é atingido", () => {
    expect(isInSwing(origin, RIGHT, SWORD, at(Math.PI, 20), HALF)).toBe(false);
  });

  it("borda do arco: um pouco dentro acerta, um pouco fora não", () => {
    expect(isInSwing(origin, RIGHT, SWORD, at(halfArc - 0.01, 30), HALF)).toBe(true);
    expect(isInSwing(origin, RIGHT, SWORD, at(halfArc + 0.01, 30), HALF)).toBe(false);
  });

  it("arco atravessando o ângulo 0: mirando a 350°, alvo a 10° está dentro", () => {
    const aim = (350 * Math.PI) / 180;
    expect(isInSwing(origin, aim, SWORD, at((10 * Math.PI) / 180, 30), HALF)).toBe(true);
  });

  it("y cresce para baixo, como na tela: mirar para baixo acerta quem está embaixo", () => {
    expect(isInSwing(origin, DOWN, SWORD, { x: 0, y: 30 }, HALF)).toBe(true);
    expect(isInSwing(origin, DOWN, SWORD, { x: 0, y: -30 }, HALF)).toBe(false);
  });

  it("alvo exatamente em cima do atacante é atingido", () => {
    expect(isInSwing(origin, RIGHT, SWORD, origin, HALF)).toBe(true);
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

describe("isInArc (arco genérico, usado pelo golpe dos mobs)", () => {
  const arc = { range: 30, degrees: 90 };

  it("usa o alcance e a abertura recebidos, não os do jogador", () => {
    expect(isInArc(origin, RIGHT, arc, at(RIGHT, 35), 8)).toBe(true);
    expect(isInArc(origin, RIGHT, arc, at(RIGHT, 39), 8)).toBe(false);
    expect(isInArc(origin, RIGHT, arc, at(Math.PI / 4 - 0.01, 20), 8)).toBe(true);
    expect(isInArc(origin, RIGHT, arc, at(Math.PI / 4 + 0.01, 20), 8)).toBe(false);
  });
});
