import type { AreaConfig } from "./areas";
import type { ItemStats } from "./inventory";
import type { MobStats } from "./mobs";

// Pixels por segundo.
export const PLAYER_SPEED = 160;

// Lado da caixa de colisão do jogador, em pixels. Também é o tamanho desenhado.
export const PLAYER_SIZE = 24;

export const PLAYER_MAX_HP = 100;

// Fome: começa cheia e cai continuamente no tick do servidor (regra 6). Com 1/3 por segundo, esvazia em 5 minutos.
export const HUNGER_MAX = 100;
export const HUNGER_DECAY_PER_SECOND = 1 / 3;

// Com a fome zerada, o jogador perde esta vida por segundo até comer ou morrer.
export const STARVATION_DAMAGE_PER_SECOND = 2;

// Itens. Placeholders: nomes e números ainda não são o conteúdo de verdade.
// maxStack: quantos cabem num slot. food: fome recuperada ao comer um (só itens comestíveis têm).
export const ITEMS = {
  racao: { name: "Ração", maxStack: 5, food: 40 },
  pele_de_rato: { name: "Pele de rato", maxStack: 10 },
  dente_de_goblin: { name: "Dente de goblin", maxStack: 10 },
} satisfies Record<string, ItemStats>;

export type ItemId = keyof typeof ITEMS;

// Slots do inventário. Comida ocupa slot como qualquer item: mais comida = menos espaço para loot (GDD).
export const INVENTORY_SLOTS = 12;

// Com o que todo personagem novo entra. Provisório: quando houver loja (passo 9), a comida passa a ser comprada.
export const STARTING_ITEMS: Partial<Record<ItemId, number>> = { racao: 3 };

// Golpe do jogador: arma placeholder única até o passo 8 (maestria de armas).
// range: alcance em pixels, contado da borda do alvo. arcDegrees: abertura do arco à frente.
export const PLAYER_ATTACK = { damage: 10, range: 40, arcDegrees: 100, cooldownMs: 500 };

// Ticks de simulação do servidor por segundo.
export const TICK_RATE = 20;

// Distância, em pixels, até onde o servidor envia entidades a um jogador.
// Maior que a meia-diagonal da tela (800×600 → 500): em área iluminada, nada surge do nada dentro da tela.
export const VIEW_RADIUS = 520;

// Folga para deixar de ver: quem já é visto só some além de VIEW_RADIUS + isto. Evita piscar na borda.
export const VIEW_HYSTERESIS = 32;

// Tipos de mob. Placeholders do mapa de teste: nomes e números ainda não são o bestiário de verdade.
// size: lado da caixa de colisão em pixels (não pode passar do tamanho do tile). speed: pixels por segundo.
// aggroRadius: distância em que o mob nota um jogador (precisa também de linha de visão).
// reach: distância, de borda a borda, em que o mob para ao alcançar o alvo e começa a preparar o golpe.
// Golpe (telegrafado): prepara por windupMs parado, com a direção travada; então acerta quem estiver no arco
// (attackArcDegrees) até attackReach de borda a borda; depois fica parado por recoverMs.
// attackReach > reach de propósito: para escapar é preciso sair do arco de verdade, não só dar um passo para trás.
export const MOB_KINDS = {
  rato: {
    size: 16,
    speed: 90,
    maxHp: 20,
    aggroRadius: 160,
    reach: 8,
    windupMs: 500,
    attackDamage: 6,
    attackReach: 24,
    attackArcDegrees: 90,
    recoverMs: 600,
  },
  goblin: {
    size: 22,
    speed: 70,
    maxHp: 40,
    aggroRadius: 224,
    reach: 12,
    windupMs: 800,
    attackDamage: 15,
    attackReach: 32,
    attackArcDegrees: 100,
    recoverMs: 900,
  },
} satisfies Record<string, MobStats>;

export type MobKind = keyof typeof MOB_KINDS;

// Mobs vagando: alternam entre parados e andando numa direção aleatória. Durações em ms, sorteadas no intervalo.
export const WANDER_IDLE_MS = { min: 500, max: 3000 };
export const WANDER_WALK_MS = { min: 800, max: 2500 };

// Perseguindo: sem ver o alvo por este tempo (ms), o mob desiste e volta para a própria área.
// Enquanto persegue, enxerga até VIEW_RADIUS, a mesma distância dos jogadores.
export const MOB_LOSE_TRACK_MS = 3000;

// Uma entrada por área do mapa (camada "areas" no Tiled). Os nomes precisam bater com os do mapa.
// mobs: quantos de cada tipo nascem na área quando a sala é criada.
// Valores do mapa de teste (assets/maps/test.json).
export const AREAS: Record<string, AreaConfig> = {
  salao: { playerEntry: true, mobs: { rato: 3 } },
  galeria: { playerEntry: false, mobs: { rato: 2, goblin: 2 } },
  tuneis: { playerEntry: true, mobs: { rato: 4 } },
  toca: { playerEntry: false, mobs: { goblin: 5 } },
};
