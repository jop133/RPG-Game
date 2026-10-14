import { schema, t, type SchemaType } from "@colyseus/schema";

export const PlayerState = schema({ x: t.number(), y: t.number() }, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;

// `.view()`: cada cliente só recebe os jogadores que o servidor adicionou à visão dele (regra 5).
export const GameState = schema({ players: t.map(PlayerState).view() }, "GameState");
export type GameState = SchemaType<typeof GameState>;
