import { type MapSchema, schema, t, type SchemaType } from "@colyseus/schema";
import { EQUIP_SLOTS, type Equipment } from "shared";

// Tag de visão do dono: campos marcados com ela só vão para o próprio jogador. Tags precisam ser potência de 2.
export const OWNER_TAG = 1;

// Slot de inventário como o cliente vê. Vazio = item "" e count 0. A verdade fica no servidor (Inventory em shared).
export const ItemSlotState = schema({ item: t.string(), count: t.number() }, "ItemSlotState");
export type ItemSlotState = SchemaType<typeof ItemSlotState>;

// attackSeq sobe a cada golpe; quem vê o jogador desenha o golpe quando o número muda, na direção attackAngle.
// hunger e inventory são privados: os outros veem a sua vida, não a sua fome nem o que você carrega.
export const PlayerState = schema(
  {
    // Públicos: os outros veem nome e classe (o desenho do personagem) e o que ele tem equipado (slot -> item; slot
    // ausente = vazio): a arma na mão e a armadura no corpo.
    name: t.string(),
    classId: t.string(),
    equipment: t.map("string"),
    x: t.number(),
    y: t.number(),
    hp: t.number(),
    // Pública: a barra de vida dos outros precisa dela (essência de vida aumenta).
    maxHp: t.number(),
    attackSeq: t.number(),
    attackAngle: t.number(),
    hunger: t.number().view(OWNER_TAG),
    inventory: t.array(ItemSlotState).view(OWNER_TAG),
    // Quanto já ficou no portal (ms). Só o dono vê a própria contagem.
    extractMs: t.number().view(OWNER_TAG),
    // Progressão do personagem (vem do banco). Nível = número de slots de essência.
    xp: t.number().view(OWNER_TAG),
    level: t.number().view(OWNER_TAG),
    // Essências equipadas (ids de item). Ocupam os slots; tirar só com NPC, mais à frente.
    essences: t.array("string").view(OWNER_TAG),
    // Moedas da linhagem, só para o HUD: no labirinto não se ganha nem se gasta moeda.
    coins: t.number().view(OWNER_TAG),
    // Recarga que falta (ms) das magias do mago (Raio no Q, Pântano no R), para o HUD. 0 = pronta.
    lightningCooldownMs: t.number().view(OWNER_TAG),
    swampCooldownMs: t.number().view(OWNER_TAG),
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

// Pilha de loot no chão. Só a posição é enviada; o conteúdo fica no servidor até alguém pegar.
export const LootState = schema({ x: t.number(), y: t.number() }, "LootState");
export type LootState = SchemaType<typeof LootState>;

// Portal de saída ativo nesta run. Passa pelo filtro de visão: é preciso explorar para achar.
export const ExitState = schema({ x: t.number(), y: t.number() }, "ExitState");
export type ExitState = SchemaType<typeof ExitState>;

// Projétil Mágico em voo (MAGIC_BOLT). angle: para onde voa (o cliente gira o desenho). done: bateu ou acabou o
// alcance; fica um tick parado no ponto do impacto, para o cliente desenhar a explosão ali, e sai.
export const ProjectileState = schema(
  { x: t.number(), y: t.number(), angle: t.number(), done: t.boolean() },
  "ProjectileState",
);
export type ProjectileState = SchemaType<typeof ProjectileState>;

// Magia lançada no chão: kind "lightning" (fases "warn" → "strike") ou "swamp" ("cast" → "active"). O cliente desenha
// cada fase; os tempos são os de LIGHTNING_SPELL e SWAMP_SPELL.
export const SpellState = schema({ kind: t.string(), x: t.number(), y: t.number(), phase: t.string() }, "SpellState");
export type SpellState = SchemaType<typeof SpellState>;

// `.view()`: cada cliente só recebe o que o servidor adicionou à visão dele (regra 5).
export const GameState = schema(
  {
    players: t.map(PlayerState).view(),
    mobs: t.map(MobState).view(),
    loot: t.map(LootState).view(),
    exits: t.map(ExitState).view(),
    projectiles: t.map(ProjectileState).view(),
    spells: t.map(SpellState).view(),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;

// Jogador na cidade. Sem vida nem fome: a cidade é segura.
// Só o dono vê a própria progressão, o inventário e o que é da linhagem (moedas e baú), para o HUD e as janelas.
export const CityPlayerState = schema(
  {
    name: t.string(),
    classId: t.string(),
    // Público, como no labirinto: o que está equipado (a arma na mão e a armadura no corpo).
    equipment: t.map("string"),
    x: t.number(),
    y: t.number(),
    xp: t.number().view(OWNER_TAG),
    level: t.number().view(OWNER_TAG),
    essences: t.array("string").view(OWNER_TAG),
    inventory: t.array(ItemSlotState).view(OWNER_TAG),
    coins: t.number().view(OWNER_TAG),
    // Baú da linhagem (STASH_SLOTS slots). Espelha o servidor; só a Estalagem mexe nele.
    stash: t.array(ItemSlotState).view(OWNER_TAG),
    // Para o Bestiário da Guilda: tipos que a linhagem já matou e os que este personagem já matou (XP já obtido).
    // Na cidade não se mata nada: lidos uma vez, ao entrar.
    bestiary: t.array("string").view(OWNER_TAG),
    kills: t.array("string").view(OWNER_TAG),
  },
  "CityPlayerState",
);
export type CityPlayerState = SchemaType<typeof CityPlayerState>;

// Mesmo na cidade, cada cliente só recebe quem está no raio de visão dele (regra 5).
export const CityState = schema({ players: t.map(CityPlayerState).view() }, "CityState");
export type CityState = SchemaType<typeof CityState>;

// Copia o equipamento (verdade do servidor) para o mapa público do jogador: só os slots ocupados.
export function mirrorEquipment(view: MapSchema<string>, equipment: Equipment) {
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    if (item && view.get(slot) !== item) view.set(slot, item);
    if (!item && view.has(slot)) view.delete(slot);
  }
}
