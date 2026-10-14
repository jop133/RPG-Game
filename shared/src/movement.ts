import { PLAYER_SPEED } from "./balance";

export interface Vec2 {
  x: number;
  y: number;
}

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const NO_INPUT: MoveInput = { up: false, down: false, left: false, right: false };

// Vem do cliente: não confiar no formato. Qualquer coisa que não seja `true` vira `false`.
export function parseMoveInput(raw: unknown): MoveInput {
  if (typeof raw !== "object" || raw === null) return NO_INPUT;
  const r = raw as Record<string, unknown>;
  return {
    up: r.up === true,
    down: r.down === true,
    left: r.left === true,
    right: r.right === true,
  };
}

export function inputToDirection(input: MoveInput): Vec2 {
  const x = Number(input.right) - Number(input.left);
  const y = Number(input.down) - Number(input.up);
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

// Deslocamento desejado, ainda sem considerar paredes. `speed` muda com essências (pixels por segundo).
export function movementDelta(input: MoveInput, dtMs: number, speed: number = PLAYER_SPEED): Vec2 {
  const direction = inputToDirection(input);
  const distance = (speed * dtMs) / 1000;
  return { x: direction.x * distance, y: direction.y * distance };
}
