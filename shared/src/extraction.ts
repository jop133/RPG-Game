import { EXIT_CHANNEL, EXIT_RADIUS } from "./balance";
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

// O portal em que o ponto está (o índice em `exits`), ou -1.
export function exitIndexAt(position: Vec2, exits: readonly Vec2[]): number {
  return exits.findIndex((exit) => Math.hypot(exit.x - position.x, exit.y - position.y) <= EXIT_RADIUS);
}

// Fase de um portal de saída (EXIT_CHANNEL): inativo; alguém canalizando; aberto para o grupo.
export type ExitPhase = "idle" | "channel" | "open";

// Um tick da canalização: parado e sem levar dano, soma; `disturbed` (andou ou levou dano) interrompe e zera. `done`
// quando completa EXIT_CHANNEL.channelMs.
export function stepChannel(elapsedMs: number, disturbed: boolean, dtMs: number): { elapsedMs: number; done: boolean; interrupted: boolean } {
  if (disturbed) return { elapsedMs: 0, done: false, interrupted: true };
  const next = Math.min(EXIT_CHANNEL.channelMs, elapsedMs + dtMs);
  return { elapsedMs: next, done: next >= EXIT_CHANNEL.channelMs, interrupted: false };
}

// Quem atende ao alarme de um portal: os mobs a até EXIT_CHANNEL.alertRadius dele.
export function alarmedMobs<T extends Vec2>(portal: Vec2, mobs: Iterable<[string, T]>): string[] {
  const out: string[] = [];
  for (const [id, mob] of mobs) if (Math.hypot(mob.x - portal.x, mob.y - portal.y) <= EXIT_CHANNEL.alertRadius) out.push(id);
  return out;
}
