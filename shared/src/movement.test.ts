import { describe, expect, it } from "vitest";
import { PLAYER_SPEED } from "./balance";
import { NO_INPUT, inputToDirection, parseMoveInput, stepPosition } from "./movement";

const origin = { x: 0, y: 0 };

describe("stepPosition", () => {
  it("anda PLAYER_SPEED pixels em 1 segundo", () => {
    const next = stepPosition(origin, { ...NO_INPUT, right: true }, 1000);
    expect(next).toEqual({ x: PLAYER_SPEED, y: 0 });
  });

  it("y cresce para baixo, como na tela", () => {
    const next = stepPosition(origin, { ...NO_INPUT, down: true }, 1000);
    expect(next.y).toBe(PLAYER_SPEED);
  });

  it("diagonal não é mais rápida que andar reto", () => {
    const next = stepPosition(origin, { ...NO_INPUT, right: true, down: true }, 1000);
    expect(Math.hypot(next.x, next.y)).toBeCloseTo(PLAYER_SPEED);
  });

  it("sem tecla, fica parado", () => {
    expect(stepPosition({ x: 5, y: 7 }, NO_INPUT, 1000)).toEqual({ x: 5, y: 7 });
  });

  it("teclas opostas se anulam", () => {
    expect(inputToDirection({ up: true, down: true, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });
});

describe("parseMoveInput", () => {
  it("aceita booleanos", () => {
    expect(parseMoveInput({ up: true, down: false, left: false, right: true })).toEqual({
      up: true,
      down: false,
      left: false,
      right: true,
    });
  });

  it("valor que não é exatamente true vira false (cliente malicioso)", () => {
    expect(parseMoveInput({ up: 1, down: "true", left: 9999, right: {} })).toEqual(NO_INPUT);
  });

  it("lixo inteiro vira sem input", () => {
    expect(parseMoveInput(null)).toEqual(NO_INPUT);
    expect(parseMoveInput("up")).toEqual(NO_INPUT);
    expect(parseMoveInput(undefined)).toEqual(NO_INPUT);
  });
});
