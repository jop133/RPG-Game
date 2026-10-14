import { EXIT_RADIUS, EXTRACT_MS } from "./balance";
import type { ItemStack } from "./inventory";
import type { Vec2 } from "./movement";

// Mensagem "extracted" que o servidor manda ao jogador antes de tirá-lo da sala.
export interface ExtractionResult {
  items: ItemStack[];
}

// Sorteia `count` portais diferentes entre os candidatos. `random` devolve [0, 1); vem de fora para ser testável.
export function pickActiveExits(candidates: readonly Vec2[], count: number, random: () => number): Vec2[] {
  const pool = [...candidates];
  const picked: Vec2[] = [];
  while (picked.length < count && pool.length > 0) {
    const [exit] = pool.splice(Math.floor(random() * pool.length), 1);
    if (exit) picked.push(exit);
  }
  return picked;
}

export function isInsideExit(position: Vec2, exits: readonly Vec2[]): boolean {
  return exits.some((exit) => Math.hypot(exit.x - position.x, exit.y - position.y) <= EXIT_RADIUS);
}

// Um tick da contagem de extração: dentro do portal soma, fora zera. `done` quando completa EXTRACT_MS.
export function stepExtraction(progressMs: number, inside: boolean, dtMs: number): { progressMs: number; done: boolean } {
  if (!inside) return { progressMs: 0, done: false };
  const next = Math.min(EXTRACT_MS, progressMs + dtMs);
  return { progressMs: next, done: next >= EXTRACT_MS };
}
