import type { MobKind } from "./balance";

// Mensagem "death" que o servidor manda ao jogador antes de tirá-lo da sala.
// hazard: o ambiente das zonas hostis (poça ácida, descarga de cristal, estilhaços, sangramento).
export type HazardKind = "acid" | "crystal" | "shards" | "bleed";
export type DeathCause = { kind: "starvation" } | { kind: "mob"; mob: MobKind } | { kind: "player" } | { kind: "hazard"; hazard: HazardKind };
