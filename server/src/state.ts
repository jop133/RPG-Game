import { schema, t, type SchemaType } from "@colyseus/schema";

// Tag de visão do dono: campos marcados com ela só vão para o próprio jogador. Tags precisam ser potência de 2.
export const OWNER_TAG = 1;

// attackSeq sobe a cada golpe; quem vê o jogador desenha o golpe quando o número muda, na direção attackAngle.
// hunger é privada: os outros veem a sua vida, não a sua fome.
export const PlayerState = schema(
  {
    x: t.number(),
    y: t.number(),
    hp: t.number(),
    attackSeq: t.number(),
    attackAngle: t.number(),
    hunger: t.number().view(OWNER_TAG),
  },
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
