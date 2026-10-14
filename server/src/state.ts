import { schema, t, type SchemaType } from "@colyseus/schema";

// attackSeq sobe a cada golpe; quem vê o jogador desenha o golpe quando o número muda, na direção attackAngle.
export const PlayerState = schema(
  { x: t.number(), y: t.number(), hp: t.number(), attackSeq: t.number(), attackAngle: t.number() },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

// `kind` é uma chave de MOB_KINDS (shared/src/balance.ts); o cliente usa para saber tamanho, cor e vida máxima.
// windup + attackAngle são o telegrafo: o cliente desenha onde o golpe vai cair enquanto o mob prepara.
export const MobState = schema(
  { kind: t.string(), x: t.number(), y: t.number(), hp: t.number(), windup: t.boolean(), attackAngle: t.number() },
  "MobState",
);
export type MobState = SchemaType<typeof MobState>;

// `.view()`: cada cliente só recebe o que o servidor adicionou à visão dele (regra 5).
export const GameState = schema(
  {
    players: t.map(PlayerState).view(),
    mobs: t.map(MobState).view(),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
