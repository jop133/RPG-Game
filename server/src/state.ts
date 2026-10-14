import { schema, t, type SchemaType } from "@colyseus/schema";

export const PlayerState = schema({ x: t.number(), y: t.number() }, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema({ players: t.map(PlayerState) }, "GameState");
export type GameState = SchemaType<typeof GameState>;
