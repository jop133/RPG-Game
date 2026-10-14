import type { MobKind } from "./balance";

// Mensagem "death" que o servidor manda ao jogador antes de tirá-lo da sala.
export type DeathCause = { kind: "starvation" } | { kind: "mob"; mob: MobKind } | { kind: "player" };
