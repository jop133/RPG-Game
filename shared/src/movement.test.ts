import { describe, expect, it } from "vitest";
import { PLAYER_SPEED } from "./balance";
import { NO_INPUT, inputToDirection, movementDelta, parseMoveInput } from "./movement";

describe("movementDelta", () => {
  it("anda PLAYER_SPEED pixels em 1 segundo", () => {
    expect(movementDelta({ ...NO_INPUT, right: true }, 1000)).toEqual({ x: PLAYER_SPEED, y: 0 });
  });

  it("y cresce para baixo, como na tela", () => {
    expect(movementDelta({ ...NO_INPUT, down: true }, 1000).y).toBe(PLAYER_SPEED);
  });

  it("diagonal não é mais rápida que andar reto", () => {
    const delta = movementDelta({ ...NO_INPUT, right: true, down: true }, 1000);
    expect(Math.hypot(delta.x, delta.y)).toBeCloseTo(PLAYER_SPEED);
  });

  it("sem tecla, fica parado", () => {
    expect(movementDelta(NO_INPUT, 1000)).toEqual({ x: 0, y: 0 });
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
