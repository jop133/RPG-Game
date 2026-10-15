import type { AreaConfig } from "./areas";
import type { ItemStats } from "./inventory";
import type { DropEntry } from "./loot";
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
// essence: efeito ao consumir a essência, que passa a ocupar um slot de essência do personagem (até o nível).
// rarity: comum (comida e materiais de monstro), rara (fragmento de cristal e essências), épica (essência rara);
// lendária ainda não há. Por enquanto só decide a moldura do slot no HUD.
// Efeitos de essências iguais se somam. speedPercent: % de velocidade; damage: dano a mais no golpe; maxHp: vida máxima a mais.
// O rato saiu do 1º andar (a essência de velocidade agora é do lobo), mas os itens dele ficam: há personagens com eles.
export const ITEMS = {
  racao: { name: "Ração", rarity: "common", maxStack: 5, food: 40 },
  pele_de_rato: { name: "Pele de rato", rarity: "common", maxStack: 10 },
  dente_de_goblin: { name: "Dente de goblin", rarity: "common", maxStack: 10 },
  pele_de_lobo: { name: "Pele de lobo", rarity: "common", maxStack: 10 },
  fragmento_de_cristal: { name: "Fragmento de cristal", rarity: "rare", maxStack: 10 },
  gosma_de_slime: { name: "Gosma de slime", rarity: "common", maxStack: 10 },
  essencia_rato: { name: "Essência de rato", rarity: "rare", maxStack: 3, essence: { speedPercent: 15 } },
  essencia_lobo: { name: "Essência de lobo", rarity: "rare", maxStack: 3, essence: { speedPercent: 15 } },
  essencia_goblin: { name: "Essência de goblin", rarity: "rare", maxStack: 3, essence: { damage: 4 } },
  essencia_goblin_rara: { name: "Essência rara de goblin", rarity: "epic", maxStack: 3, essence: { maxHp: 25 } },
} satisfies Record<string, ItemStats>;

export type ItemId = keyof typeof ITEMS;

// Slots do inventário. Comida ocupa slot como qualquer item: mais comida = menos espaço para loot (GDD).
export const INVENTORY_SLOTS = 12;

// Com o que todo personagem novo entra. Provisório: quando houver loja (passo 9), a comida passa a ser comprada.
export const STARTING_ITEMS: Partial<Record<ItemId, number>> = { racao: 3 };

// O que cada tipo de mob larga ao morrer. Cada linha é sorteada à parte: com chance `chance` (0 a 1),
// cai uma quantidade entre `min` e `max`. Goblins às vezes carregam comida: fonte de ração dentro do labirinto.
// Gnomo e slime ainda não têm essência: só material (as essências deles são decisão de balanceamento futura).
export const MOB_DROPS: Record<MobKind, DropEntry[]> = {
  lobo: [
    { item: "pele_de_lobo", chance: 0.8, min: 1, max: 1 },
    { item: "essencia_lobo", chance: 0.15, min: 1, max: 1 },
  ],
  gnomo: [
    { item: "fragmento_de_cristal", chance: 0.9, min: 1, max: 2 },
    { item: "racao", chance: 0.15, min: 1, max: 1 },
  ],
  slime: [{ item: "gosma_de_slime", chance: 0.9, min: 1, max: 2 }],
  goblin: [
    { item: "dente_de_goblin", chance: 1, min: 1, max: 2 },
    { item: "racao", chance: 0.25, min: 1, max: 1 },
    { item: "essencia_goblin", chance: 0.2, min: 1, max: 1 },
    { item: "essencia_goblin_rara", chance: 0.05, min: 1, max: 1 },
  ],
};

// Distância, de centro a centro, em que o jogador alcança uma pilha para pegar (tecla F).
export const PICKUP_RADIUS = 40;

// XP: cada tipo de mob dá FIRST_KILL_XP na primeira vez que o personagem o mata (quem dá o golpe final).
export const FIRST_KILL_XP = 1;
// XP total para chegar a cada nível a partir do 2 (índice 0 = nível 2). Nível = número de slots de essência.
export const LEVEL_XP = [1, 2, 4, 7, 11, 16];

// Extração: dos pontos candidatos da camada "exits" do mapa, quantos ficam ativos em cada run (sorteados).
export const EXITS_ACTIVE = 2;
// Raio do portal, em pixels, contado do centro: o centro do jogador precisa estar dentro.
export const EXIT_RADIUS = 28;
// Tempo parado dentro do portal para extrair. Sair do portal zera; levar dano não.
export const EXTRACT_MS = 5000;

// Cidade: raio do portal para o labirinto, contado do centro. Dentro dele, a tecla E leva ao labirinto.
export const CITY_PORTAL_RADIUS = 28;

// Golpe do jogador: arma placeholder única até o passo 8 (maestria de armas).
// range: alcance em pixels, contado da borda do alvo. arcDegrees: abertura do arco à frente.
export const PLAYER_ATTACK = { damage: 10, range: 40, arcDegrees: 100, cooldownMs: 500 };

// Ticks de simulação do servidor por segundo.
export const TICK_RATE = 20;

// Metade da diagonal da área do mundo que aparece na tela, em pixels. A janela pode ter qualquer formato: o cliente
// escolhe largura e altura do jogo para manter esta diagonal e amplia a imagem. Monitor maior não vê mais longe.
export const SCREEN_HALF_DIAGONAL = 500;

// Distância, em pixels, até onde o servidor envia entidades a um jogador.
// Maior que SCREEN_HALF_DIAGONAL: em área iluminada, nada surge do nada dentro da tela, qualquer que seja a janela.
export const VIEW_RADIUS = 520;

// Folga para deixar de ver: quem já é visto só some além de VIEW_RADIUS + isto. Evita piscar na borda.
export const VIEW_HYSTERESIS = 32;

// Escuridão (regra 4). No labirinto, o servidor só envia a um jogador os mobs e as pilhas que estão iluminados: perto
// de algum jogador (cada um carrega luz até PLAYER_LIGHT_RADIUS), dentro do raio de uma luz do mapa ou de uma saída
// ativa. Jogadores e saídas brilham: continuam sendo vistos até VIEW_RADIUS. O cliente desenha a escuridão com estes
// mesmos raios, então a máscara escura só cobre o mapa, que todo mundo já tem. Na cidade a luz é só desenho.
export const PLAYER_LIGHT_RADIUS = 240;
export const EXIT_LIGHT_RADIUS = 200;
// Raio de cada tipo de luz da camada "luzes" dos mapas (o nome do ponto é o tipo), em pixels.
export const LIGHT_RADIUS = {
  "cristal-grande": 170,
  "cristal-medio": 130,
  "cristal-pequeno": 90,
  minerio: 110,
  cogumelos: 100,
  tocha: 180,
  portal: 230,
  poste: 150,
  chafariz: 120,
  janela: 70,
  braseiro: 140,
  forja: 180,
  vela: 70,
} satisfies Record<string, number>;

export type LightKind = keyof typeof LIGHT_RADIUS;

// Tipos de mob do 1º andar (Caverna de Cristal). Números iniciais, para ajustar jogando.
// size: lado da caixa de colisão em pixels (não pode passar do tamanho do tile). speed: pixels por segundo.
// aggroRadius: distância em que o mob nota um jogador (precisa também de linha de visão).
// reach: distância, de borda a borda, em que o mob para ao alcançar o alvo e começa a preparar o golpe.
// Golpe (telegrafado): prepara por windupMs parado, com a direção travada; então acerta quem estiver no arco
// (attackArcDegrees) até attackReach de borda a borda; depois fica parado por recoverMs.
// attackReach > reach de propósito: para escapar é preciso sair do arco de verdade, não só dar um passo para trás.
// Lobo: rápido e frágil, morde rápido de perto. Gnomo: pequeno, golpe de picareta largo. Slime: lento e resistente,
// golpe demorado que pega em volta quase toda.
export const MOB_KINDS = {
  lobo: {
    size: 20,
    speed: 120,
    maxHp: 30,
    aggroRadius: 256,
    reach: 8,
    windupMs: 450,
    attackDamage: 10,
    attackReach: 26,
    attackArcDegrees: 80,
    recoverMs: 700,
  },
  gnomo: {
    size: 18,
    speed: 75,
    maxHp: 30,
    aggroRadius: 192,
    reach: 10,
    windupMs: 700,
    attackDamage: 12,
    attackReach: 30,
    attackArcDegrees: 110,
    recoverMs: 800,
  },
  slime: {
    size: 24,
    speed: 45,
    maxHp: 55,
    aggroRadius: 160,
    reach: 6,
    windupMs: 900,
    attackDamage: 14,
    attackReach: 26,
    attackArcDegrees: 180,
    recoverMs: 1000,
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
// Valores do 1º andar (assets/maps/dungeon_floor1.json, gerado por tools/assets/build_labyrinth.py).
// Centro: onde se chega, com poucos mobs. Cada região de fora tem o seu povo.
export const AREAS: Record<string, AreaConfig> = {
  centro: { playerEntry: true, mobs: { goblin: 1, lobo: 1, gnomo: 1, slime: 1 } },
  norte: { playerEntry: false, mobs: { goblin: 12 } },
  leste: { playerEntry: false, mobs: { lobo: 10 } },
  oeste: { playerEntry: false, mobs: { gnomo: 10 } },
  sul: { playerEntry: false, mobs: { slime: 10 } },
};
