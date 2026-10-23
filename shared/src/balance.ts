import type { AreaConfig } from "./areas";
import type { ClassId } from "./classes";
import type { Equipment } from "./equipment";
import type { ForgeItem } from "./forge";
import type { ItemStats } from "./inventory";
import type { DropEntry } from "./loot";
import type { MobStats } from "./mobs";
import type { AdventurerRank } from "./progression";

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
// Efeitos de essências iguais se somam (StatBonus, em stats.ts). speedPercent: % de velocidade; physicalDamage: dano
// físico a mais no golpe; maxHp: vida máxima a mais.
// equip: o item se equipa no slot dado; arma (weapon) troca o golpe: dano, alcance e arco (como UNARMED_ATTACK);
// weaponType "staff": em vez do golpe, dispara um Projétil Mágico (MAGIC_BOLT) com o Dano Mágico de quem atira;
// bonus: o que a peça soma aos status (StatBonus), enquanto equipada; allowedClasses: só essas classes equipam.
// O rato saiu do 1º andar (a essência de velocidade agora é do lobo), mas os itens dele ficam: há personagens com eles.
export const ITEMS = {
  racao: { name: "Ração", rarity: "common", maxStack: 5, food: 40 },
  pele_de_rato: { name: "Pele de rato", rarity: "common", maxStack: 10 },
  dente_de_goblin: { name: "Dente de goblin", rarity: "common", maxStack: 10 },
  pele_de_lobo: { name: "Pele de lobo", rarity: "common", maxStack: 10 },
  fragmento_de_cristal: { name: "Fragmento de cristal", rarity: "rare", maxStack: 10 },
  gosma_de_slime: { name: "Gosma de slime", rarity: "common", maxStack: 10 },
  essencia_rato: { name: "Essência de rato", rarity: "rare", maxStack: 3, essence: { speedPercent: 15 } },
  // As 4 essências dos monstros (mesma arte, status diferentes): absorvidas nos slots de essência (usar o item).
  essencia_goblin: {
    name: "Essência de Goblin",
    rarity: "rare",
    maxStack: 3,
    essence: { speedPercent: 12, attackSpeedPercent: 15, perceptionPercent: 20 },
  },
  essencia_slime: {
    name: "Essência de Slime",
    rarity: "rare",
    maxStack: 3,
    essence: { maxHp: 45, regenPerSecond: 3, defensePercent: 5 },
  },
  essencia_lobo: {
    name: "Essência de Lobo",
    rarity: "rare",
    maxStack: 3,
    essence: { physicalDamage: 10, lifestealPercent: 8, woundedDamagePercent: 15 },
  },
  essencia_gnomo: {
    name: "Essência de Gnomo",
    rarity: "rare",
    maxStack: 3,
    essence: { maxMana: 50, manaRegenPerSecond: 2.5, magicDamagePercent: 18 },
  },
  // O que os monstros largam (com as essências): vende-se na Guilda.
  cristal_magico: { name: "Cristal Mágico", rarity: "common", maxStack: 30 },
  essencia_goblin_rara: { name: "Essência rara de goblin", rarity: "epic", maxStack: 3, essence: { maxHp: 25 } },
  espada_ferro: {
    name: "Espada de Ferro",
    rarity: "common",
    maxStack: 1,
    equip: { slot: "weapon", weapon: { damage: 10, range: 40, arcDegrees: 100 } },
  },
  // Arma do mago: o clique é uma batida corpo a corpo, como a espada (as magias são habilidades, Q e R).
  cajado_arcano: {
    name: "Cajado Arcano",
    rarity: "rare",
    maxStack: 1,
    equip: {
      slot: "weapon",
      weapon: { damage: 8, range: 36, arcDegrees: 90, weaponType: "staff" },
      allowedClasses: ["mago"],
      bonus: { magicDamage: 14, maxMana: 25 },
    },
  },
  // Arma do elfo: o clique dispara uma Flecha (ARROW) com o Dano Físico de quem atira. `range` é o alcance da flecha.
  besta: {
    name: "Besta",
    rarity: "rare",
    maxStack: 1,
    equip: { slot: "weapon", weapon: { damage: 9, range: 360, arcDegrees: 0, weaponType: "crossbow" }, allowedClasses: ["elfo"] },
  },
  // Conjunto de ferro (Forja): números provisórios, para ajustar jogando. Defesa e Velocidade em %.
  elmo_ferro: { name: "Elmo de Ferro", rarity: "common", maxStack: 1, equip: { slot: "helm", look: "iron", bonus: { maxHp: 15, defensePercent: 2 } } },
  peitoral_ferro: {
    name: "Peitoral de Ferro",
    rarity: "common",
    maxStack: 1,
    equip: { slot: "chest", look: "iron", bonus: { maxHp: 30, defensePercent: 4 } },
  },
  calca_ferro: { name: "Calça de Ferro", rarity: "common", maxStack: 1, equip: { slot: "pants", look: "iron", bonus: { maxHp: 20, defensePercent: 3 } } },
  bota_ferro: { name: "Bota de Ferro", rarity: "common", maxStack: 1, equip: { slot: "boots", look: "iron", bonus: { maxHp: 10, speedPercent: 12 } } },
  amuleto_runico: { name: "Amuleto Rúnico", rarity: "rare", maxStack: 1, equip: { slot: "amulet", bonus: { maxMana: 20, physicalDamage: 3 } } },
  anel_vitalidade: { name: "Anel de Vitalidade", rarity: "rare", maxStack: 1, equip: { slot: "ring", bonus: { maxHp: 15 } } },
} satisfies Record<string, ItemStats>;

export type ItemId = keyof typeof ITEMS;

// Slots do inventário. Comida ocupa slot como qualquer item: mais comida = menos espaço para loot (GDD).
export const INVENTORY_SLOTS = 12;

// Com o que todo personagem novo entra. Depois, a comida se compra na Taverna (BUY_PRICES) ou cai de goblins e gnomos.
export const STARTING_ITEMS: Partial<Record<ItemId, number>> = { racao: 3 };

// Baú da linhagem, na Estalagem: slots no mesmo formato do inventário. É da linhagem: sobrevive à morte do personagem.
export const STASH_SLOTS = 24;

// Economia. As moedas são da linhagem (uma bolsa só, segura, que o herdeiro herda) e só servem na cidade.
// SELL_PRICES: quanto o Mercador da Guilda paga por unidade. Item fora da lista não se vende (a ração não).
// BUY_PRICES: o que a Taverna da Estalagem vende, por unidade. Valores iniciais, para ajustar jogando.
export const SELL_PRICES: Partial<Record<ItemId, number>> = {
  pele_de_rato: 1,
  gosma_de_slime: 2,
  dente_de_goblin: 3,
  pele_de_lobo: 4,
  fragmento_de_cristal: 8,
  essencia_rato: 15,
  essencia_goblin_rara: 40,
  cristal_magico: 5,
  essencia_goblin: 300,
  essencia_slime: 300,
  essencia_lobo: 300,
  essencia_gnomo: 300,
};
export const BUY_PRICES: Partial<Record<ItemId, number>> = { racao: 10 };
// O catálogo da Forja (balcão do ferreiro): o que se compra, por unidade. Tudo de graça por enquanto (pedido do dono do
// projeto, para testar o equipamento); os preços de verdade vêm com o balanceamento da economia.
export const FORGE_PRICES: Partial<Record<ItemId, number>> = {
  espada_ferro: 0,
  cajado_arcano: 0,
  besta: 0,
  elmo_ferro: 0,
  peitoral_ferro: 0,
  calca_ferro: 0,
  bota_ferro: 0,
  amuleto_runico: 0,
  anel_vitalidade: 0,
};
// Maior quantidade aceita numa compra ou venda (só para recusar números absurdos vindos do cliente).
export const MAX_TRADE_COUNT = 999;

// O que cada tipo de mob larga ao morrer: só Cristais Mágicos e a essência do tipo. Cada linha é sorteada à parte:
// com chance `chance` (0 a 1), cai uma quantidade entre `min` e `max`. Cristais: o 1º sempre, o 2º com 50%, o 3º com
// 25% (sorteios independentes). Essência: 5%. Os materiais antigos (pele, dente, gosma, fragmento) não caem mais, mas
// continuam itens (há personagens com eles, e a Forja os usa).
const CRYSTAL_DROPS: DropEntry[] = [
  { item: "cristal_magico", chance: 1, min: 1, max: 1 },
  { item: "cristal_magico", chance: 0.5, min: 1, max: 1 },
  { item: "cristal_magico", chance: 0.25, min: 1, max: 1 },
];
export const ESSENCE_DROP_CHANCE = 0.05;
export const MOB_DROPS: Record<MobKind, DropEntry[]> = {
  lobo: [...CRYSTAL_DROPS, { item: "essencia_lobo", chance: ESSENCE_DROP_CHANCE, min: 1, max: 1 }],
  gnomo: [...CRYSTAL_DROPS, { item: "essencia_gnomo", chance: ESSENCE_DROP_CHANCE, min: 1, max: 1 }],
  slime: [...CRYSTAL_DROPS, { item: "essencia_slime", chance: ESSENCE_DROP_CHANCE, min: 1, max: 1 }],
  goblin: [...CRYSTAL_DROPS, { item: "essencia_goblin", chance: ESSENCE_DROP_CHANCE, min: 1, max: 1 }],
};
// Itens no chão: cada unidade que cai é um item à parte, a pelo menos MIN_DISTANCE px de qualquer outro (espiral em volta
// de onde o mob morreu, sem entrar em parede nem passar por ela). O desenho sai pulando do lugar da morte por TWEEN_MS;
// o servidor marca o item como recém-caído por FRESH_MS.
export const GROUND_DROPS = { minDistance: 26, maxRings: 8, radius: 6, tweenMs: 250, freshMs: 1000 };

// Distância, de centro a centro, em que o jogador alcança uma pilha para pegar (tecla F).
export const PICKUP_RADIUS = 40;

// XP: cada tipo de mob dá FIRST_KILL_XP na primeira vez que o personagem o mata (quem dá o golpe final).
export const FIRST_KILL_XP = 1;
// XP total para chegar a cada nível a partir do 2 (índice 0 = nível 2). Nível = número de slots de essência.
export const LEVEL_XP = [1, 2, 4, 7, 11, 16];

// Rank de Aventureiro da linhagem (Salão da Guilda): sobe com os tipos de mob no bestiário (`bestiary` = quantos tipos
// de MOB_KINDS a linhagem já matou para chegar ao rank). Só título por enquanto. Com os 4 tipos do 1º andar, o máximo
// é D; C, B, A e S vêm com os próximos andares.
export const ADVENTURER_RANKS: readonly AdventurerRank[] = [
  { rank: "F", title: "Recruta", bestiary: 0 },
  { rank: "E", title: "Explorador de Cristal", bestiary: 2 },
  { rank: "D", title: "Caçador Veterano", bestiary: 4 },
];

// Receitas da Forja: VITRINE (nada se forja ainda; nomes, materiais e preços provisórios). Materiais da caverna mais
// moedas pelo trabalho do ferreiro. `slot` é o slot de equipamento da janela de inventário.
export const FORGE_RECIPES: readonly ForgeItem[] = [
  { name: "Peitoral de Pele de Lobo", slot: "chest", coins: 20, materials: { pele_de_lobo: 6, dente_de_goblin: 2 } },
  { name: "Botas de Couro Selado", slot: "boots", coins: 15, materials: { pele_de_lobo: 4, gosma_de_slime: 3 } },
  { name: "Lâmina Serrilhada", slot: "weapon", coins: 30, materials: { dente_de_goblin: 8, fragmento_de_cristal: 2 } },
  { name: "Anel de Cristal", slot: "ring", coins: 40, materials: { fragmento_de_cristal: 5, gosma_de_slime: 2 } },
];

// Extração: dos pontos candidatos da camada "exits" do mapa, quantos ficam ativos em cada run (sorteados).
// No 1º andar (500x500) há exatamente 4 saídas, uma no fundo de cada região, e todas ficam ativas.
export const EXITS_ACTIVE = 4;
// Raio do portal, em pixels, contado do centro: o centro do jogador precisa estar dentro.
export const EXIT_RADIUS = 28;
// Portal de saída: começa inativo (luz fraca, EXIT_IDLE_LIGHT_RADIUS). [E] dentro dele começa a canalização: CHANNEL_MS
// parado e sem levar dano (andar ou levar qualquer dano interrompe e zera). Ao começar, o portal dá o alarme: todo mob
// a até ALERT_RADIUS px corre para ele (sem coleira, sem teto de perseguidores). Completa, o portal fica aberto por
// OPEN_MS para o grupo: quem estiver dentro (EXIT_RADIUS) extrai na hora. Depois fecha e é preciso canalizar de novo.
export const EXIT_CHANNEL = { channelMs: 7000, alertRadius: 640, openMs: 12000 };

// Cidade: raio do portal para o labirinto, contado do centro. Dentro dele, a tecla E leva ao labirinto.
export const CITY_PORTAL_RADIUS = 28;
// Cidade: raio dos pontos na frente das portas dos prédios (camada "interacoes"). Dentro, E abre a janela do prédio,
// e só dali o servidor aceita vender, comprar e mexer no baú.
export const CITY_INTERACT_RADIUS = 48;

// Golpe do jogador: dano, alcance e arco vêm da arma equipada (ITEMS[...].equip.weapon); sem arma, o soco.
// range: alcance em pixels, contado da borda do alvo. arcDegrees: abertura do arco à frente.
export const UNARMED_ATTACK = { damage: 4, range: 28, arcDegrees: 90 };
// Tempo mínimo entre dois golpes, com ou sem arma.
export const PLAYER_ATTACK_COOLDOWN_MS = 500;
// Golpe básico e magia travam o personagem no lugar (velocidade 0) por isto, do começo do golpe até a animação acabar
// (o cliente toca a animação de ataque nesse mesmo tempo).
export const ATTACK_LOCK_MS = 250;
// "Alvo ferido" (bônus de dano da Essência de Lobo): abaixo desta fração da vida máxima.
export const WOUNDED_FRACTION = 0.5;
// Com o que o personagem entra equipado na primeira vez (o novo e os que existiam antes do equipamento). O mago entra
// com o Cajado Arcano no lugar da espada (STARTING_EQUIPMENT_BY_CLASS); quem já tinha equipamento gravado fica com ele.
export const STARTING_EQUIPMENT: Equipment = { weapon: "espada_ferro" };
export const STARTING_EQUIPMENT_BY_CLASS: Partial<Record<ClassId, Equipment>> = { mago: { weapon: "cajado_arcano" } };

// Projétil Mágico do cajado: sai SPAWN_OFFSET px à frente de quem atira (a ponta do cajado), voa a SPEED px/s em linha
// reta e some ao bater numa parede, acertar alguém (mob ou outro jogador: fogo amigo, como o golpe) ou passar de
// RANGE px. RADIUS é o tamanho dele para acertar. Carrega luz (regra 4): o que está a LIGHT_RADIUS px dele é enviado.
export const MAGIC_BOLT = { speed: 420, range: 340, spawnOffset: 20, radius: 5, lightRadius: 64 };
// Flecha da Besta (clique do elfo com a besta): o mesmo voo do projétil, mais rápida e fina; dano físico (o Dano Físico
// de quem atirou no disparo). O voo usa ARROW.range; o `range` da besta em ITEMS é o mesmo número (só para mostrar).
export const ARROW = { speed: 560, range: 360, spawnOffset: 18, radius: 4 };

// Magias do mago (Q e R, só no labirinto): a mira é o ponto do mouse, até CAST_RANGE px de quem lança (mais longe, o
// ponto é puxado para dentro do alcance). Limitadas só pela recarga; a Mana ainda não é gasta. As áreas são elipses no
// chão (a vista é 3/4: um círculo no chão aparece achatado, SPELL_FLATTEN), testadas nos pés de cada um.
export const SPELL_CAST_RANGE = 320;
// Bola de Fogo (skill do mago): dispara o projétil do cajado (MAGIC_BOLT) na direção do mouse, com BASE_DAMAGE + o Dano
// Mágico de quem lançou. O clique com o cajado não faz nada por enquanto (pedido do dono do projeto).
export const FIREBALL_SKILL = { baseDamage: 8, cooldownMs: 1000 };
export const SPELL_FLATTEN = 0.55;
// Raio Celestial (Q): o círculo avisa por WARN_MS; aí o raio cai, com BASE_DAMAGE + o Dano Mágico de quem lançou, em
// todos dentro da elipse (fogo amigo, menos quem lançou). O círculo e o raio carregam luz (regra 4).
// strikeMs é só o tempo do desenho do raio caindo (8 quadros); o dano sai no começo dele.
export const LIGHTNING_SPELL = { warnMs: 400, strikeMs: 480, radiusX: 46, baseDamage: 10, cooldownMs: 4000, lightRadius: 110 };
// Pântano de Lama (R): o círculo de terra gira por CAST_MS; aí a poça fica DURATION_MS. Dentro dela, mobs e os outros
// jogadores (quem lançou não) andam a SLOW da velocidade. radiusX/radiusY: a elipse da poça na arte (spells.json).
export const SWAMP_SPELL = { castMs: 350, durationMs: 5000, radiusX: 61, radiusY: 24, slow: 0.45, cooldownMs: 10000 };
// Barreira de Gelo (skill do mago): uma parede de gelo DISTANCE px à frente de quem lança, na direção da mira (uma das
// 8), atravessada nela: CELLS tiles em linha. Bloqueia só os mobs (andar e caminho); os jogadores passam. Tem HP próprio:
// golpes e projéteis de mob que batem nela gastam a vida dela. Some com HP 0 ou depois de DURATION_MS; quebrando, fica
// BREAK_MS no estado (a animação de quebra) já sem bloquear.
export const ICE_BARRIER = { hp: 150, durationMs: 12000, distance: 56, cells: 3, cooldownMs: 9000, breakMs: 900 };

// Espíritos Elementais do Elfo: só um equipado por vez (skills.ts). Equipado, flutua ao lado dele (desenho); a tecla
// da skill pede o auxílio do espírito:
// - Água: cura HEAL de vida no elfo e em todo aliado a até RADIUS px;
// - Fogo: dispara a Bola de Fogo (o projétil do cajado) na direção do mouse, com DAMAGE de dano mágico;
// - Terra: Pele de Pedra, um buff ("stone_skin", BUFF_BONUS) por DURATION_MS;
// - Vento: Rajada, um buff de velocidade ("haste", BUFF_BONUS) por DURATION_MS.
export const SPIRIT_WATER = { heal: 30, radius: 96, cooldownMs: 12000 };
export const SPIRIT_FIRE = { damage: 12, cooldownMs: 2500 };
export const SPIRIT_EARTH = { durationMs: 6000, cooldownMs: 15000 };
export const SPIRIT_WIND = { durationMs: 4000, cooldownMs: 10000 };
// Forma de Urso Primal (Homem-Fera): a tecla começa a pose (POSE_MS, parado no lugar); no fim dela vira Homem-Urso por
// DURATION_MS (o buff "bear": mais vida, defesa e dano, e o golpe passa a ser a garra, CLAWS). A tecla de novo, ou o
// fim do tempo, desfaz: a explosão primal cobre a volta (REVERT_MS). A recarga conta do começo da pose; desfazer antes
// não espera a recarga.
export const BEAR_FORM = {
  poseMs: 900,
  durationMs: 20000,
  revertMs: 500,
  cooldownMs: 30000,
  claws: { damage: 14, range: 32, arcDegrees: 110 },
};
// O que cada buff soma aos status enquanto dura (StatBonus, em stats.ts).
export const BUFF_BONUS = {
  bear: { maxHp: 60, defensePercent: 15, physicalDamage: 6 },
  stone_skin: { defensePercent: 25 },
  haste: { speedPercent: 35 },
} as const;

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
// A parede corta toda luz e a vista (lightReach): o que está atrás dela não é enviado, mesmo perto.
export const PLAYER_LIGHT_RADIUS = 240;
// Saída canalizando ou aberta; inativa, só um farol fraco.
export const EXIT_LIGHT_RADIUS = 200;
export const EXIT_IDLE_LIGHT_RADIUS = 96;

// Status base de todo personagem (os 12 de stats.ts), antes da classe (passo 10), do equipamento e das essências. O
// Dano Físico vem da arma (ou do soco). Bases neutras onde ainda não há fonte de bônus: o jogo joga como antes.
// lightRadius é a Percepção (raio da luz que cada um carrega); os outros % são reduções.
export const PLAYER_MAX_MANA = 100;
export const BASE_STATS = {
  maxHp: PLAYER_MAX_HP,
  maxMana: PLAYER_MAX_MANA,
  magicDamage: 0,
  defensePercent: 0,
  magicResistPercent: 0,
  attackSpeedPercent: 0,
  speed: PLAYER_SPEED,
  lightRadius: PLAYER_LIGHT_RADIUS,
  stealthPercent: 0,
  vigorPercent: 0,
  regenPerSecond: 0,
  // Mana por segundo (a base de MANA_REGEN_PER_SECOND); roubo de vida e dano em alvo ferido, em %.
  manaRegenPerSecond: 2,
  lifestealPercent: 0,
  woundedDamagePercent: 0,
};
// Teto de toda redução em % (Defesa, Resistência Mágica, Furtividade, Vigor): ninguém fica imune a dano, invisível
// aos mobs ou sem fome.
export const MAX_REDUCTION_PERCENT = 80;
// Regeneração só começa depois deste tempo sem levar dano (inclusive de fome).
export const REGEN_DELAY_MS = 5000;
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
  // Labirinto 500x500: runas ciano (obelisco, totens), garras incandescentes (só uma, na borda do covil dos lobos,
  // que continua escuro) e o verde bioluminescente do fosso dos slimes (poças, ovos).
  runa: 110,
  garras: 70,
  acido: 100,
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
    windupMs: 300,
    attackDamage: 20,
    attackReach: 26,
    attackArcDegrees: 80,
    recoverMs: 350,
    abilities: ["pounce"],
  },
  gnomo: {
    size: 18,
    speed: 75,
    maxHp: 30,
    aggroRadius: 224,
    reach: 10,
    windupMs: 700,
    attackDamage: 12,
    attackReach: 30,
    attackArcDegrees: 110,
    recoverMs: 800,
    // Conjurador: mantém distância (GNOME_CASTER) e ataca de longe; a picareta só encurralado.
    abilities: ["bolt", "crystal"],
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
    // O ataque é o pulo (SLIME_LEAP), não o golpe parado.
    abilities: ["leap"],
  },
  goblin: {
    size: 22,
    speed: 70,
    // Perseguindo, anda 15% mais rápido.
    chaseSpeedFactor: 1.15,
    abilities: ["dash", "throw"],
    maxHp: 40,
    aggroRadius: 224,
    reach: 12,
    windupMs: 800,
    attackDamage: 26,
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

// Constantes técnicas (desempenho), não de jogo: preparam andares grandes (500x500 tiles) sem mudar o que o jogador
// sente nos mapas de hoje.
// A* explora no máximo isto de tiles por chamada; destino mais longe vira caminho parcial (ver findPath).
export const PATHFIND_MAX_NODES = 1200;
// Perseguindo: com o alvo trocando de tile, recalcula o A* no máximo a cada isto (ms), enquanto houver caminho.
export const PATH_RECALC_MS = 350;
// Mob vagando sem nenhum jogador a menos disto (px) hiberna: o servidor pula o tick dele. Bem acima de VIEW_RADIUS
// e de qualquer aggroRadius: acorda muito antes de aparecer na tela de alguém ou de poder notar alguém.
export const MOB_WAKE_RADIUS = 1000;

// Mob da área de chegada não nasce a menos disto (px) de nenhum ponto de entrada: quem chega não começa a run já
// cercado. Acima de todo aggroRadius (o maior é 256): o mob nem nota quem acabou de chegar.
export const MOB_SPAWN_SAFE_RADIUS = 320;

// Uma entrada por área do mapa (camada "areas" no Tiled). Os nomes precisam bater com os do mapa.
// mobs: quantos de cada tipo nascem soltos na área quando a sala é criada (o centro, onde se chega, com poucos).
// zone: a área é uma das 4 zonas hostis (ZONES): o povo dela nasce em grupos táticos por setor (PACKS), e quem está
// nela sofre o efeito da zona.
// Valores do 1º andar (assets/maps/dungeon_floor1.json, gerado por tools/assets/build_labyrinth.py).
export const AREAS: Record<string, AreaConfig> = {
  // Área de segurança da chegada (ZONE_LAYOUT): sem mobs.
  centro: { playerEntry: true, mobs: {} },
  noroeste: { playerEntry: false, mobs: {}, zone: "goblin" },
  nordeste: { playerEntry: false, mobs: {}, zone: "lobo" },
  sudeste: { playerEntry: false, mobs: {}, zone: "gnomo" },
  sudoeste: { playerEntry: false, mobs: {}, zone: "slime" },
};

// ---------------------------------------------------------------- spawns táticos (mapa vivo sem enxame)

// O labirinto é dividido em setores de SECTOR_TILES x SECTOR_TILES; cada setor de zona com chão bastante
// (MIN_SECTOR_CELLS) recebe um grupo de SIZE mobs do povo da zona, num posto (home) a pelo menos MIN_DISTANCE px do
// posto de qualquer outro grupo e longe das entradas (MOB_SPAWN_SAFE_RADIUS). Os membros nascem a até SPREAD_TILES
// tiles do posto.
// Até PER_SECTOR grupos por setor (cada um com o seu posto, ainda a MIN_DISTANCE dos outros).
export const PACKS = { sectorTiles: 25, minSectorCells: 40, size: { min: 3, max: 3 }, minDistance: 352, spreadTiles: 3, perSector: 1 };
// Zonas do labirinto por posição, não pelas áreas desenhadas no mapa (quadrantAreas em areas.ts): um quadrado de
// SAFE_TILES tiles para cada lado do centro é a área de segurança ("centro"); fora dele, cada quadrante é uma zona
// (noroeste goblin, nordeste lobo, sudeste gnomo, sudoeste slime). O mapa (paredes e pisos) não muda.
export const ZONE_LAYOUT = { safeTiles: 20 };
// Coleira: perseguindo a mais de RADIUS px do posto, o mob desiste, volta a RETURN_SPEED x a velocidade e fica
// IMMUNE_MS sem notar ninguém. Teto de perseguidores: um jogador com MAX_CHASERS atrás dele não atrai mais ninguém, e
// só os MAX_CHASERS mais perto continuam a caça.
export const LEASH = { radius: 480, returnSpeed: 1.4, immuneMs: 3000 };
export const MAX_CHASERS = 5;
// Respawn de um grupo inteiro morto: depois de DELAY_MS, e só com nenhum jogador a menos de CLEAR_RADIUS px do posto.
export const PACK_RESPAWN = { delayMs: 160_000, clearRadius: 704 };
// Vida em repouso (sem aggro), por tipo, em tiles e ms:
// goblin: rondas curtas de 2 a 4 tiles em volta do posto, parando 3 a 5 s; lobo: o grupo patrulha junto um eixo de 5 a
// 7 tiles do corredor; slime: fica no lugar (o cliente pulsa); gnomo: anda entre os cristais a até CRYSTAL_TILES do
// posto (sem cristal perto, ronda como o goblin).
export const IDLE = {
  roamTiles: { min: 2, max: 4 },
  pauseMs: { min: 3000, max: 5000 },
  patrolTiles: { min: 5, max: 7 },
  crystalTiles: 10,
};

// ---------------------------------------------------------------- zonas hostis (efeitos em quem está nelas)

// Breu dos Goblins: a luz de cada um cai a LIGHT_FACTOR (240 -> 80 px; e com ela o que o servidor envia, regra 4);
// goblins que notaram o jogador, a até EYES.max px dele, sem parede no meio e fora do que ele recebe, aparecem só como
// dois olhos no escuro.
// Miasma dos Slimes: toda cura recebida (regeneração) vale HEAL_FACTOR.
// Frio dos Lobos: a fome cai HUNGER_FACTOR x mais rápido.
// Radiação dos Gnomos: drena MANA_DRAIN de Mana por segundo, a regeneração de Mana vale MANA_REGEN_FACTOR e todo dano
// recebido vale DAMAGE_TAKEN_FACTOR.
export const ZONE_EFFECTS = {
  goblin: { lightFactor: 1 / 3, eyes: { min: 0, max: 192 } },
  slime: { healFactor: 0.7 },
  lobo: { hungerFactor: 1.75 },
  gnomo: { manaDrainPerSecond: 1.5, manaRegenFactor: 0.2, damageTakenFactor: 1.25 },
};
// Mana: volta a MANA_REGEN_PER_SECOND por segundo, até a Mana máxima (status). As skills ainda não gastam.
export const MANA_REGEN_PER_SECOND = BASE_STATS.manaRegenPerSecond;
// Tochas dos Goblins: as do mapa (e os braseiros) começam apagadas; [E] a até INTERACT_RADIUS px acende para todos até
// o fim da run, com luz de LIGHT_RADIUS px.
export const TORCH = { interactRadius: 56, lightRadius: 180 };
// Poças de lodo ácido (as do mapa e as que um slime deixa ao morrer, por SLIME_DEATH_MS): quem pisa (os pés a até
// RADIUS px do centro) anda a SLOW da velocidade e perde DAMAGE_PER_SECOND de vida por segundo.
export const ACID = { radius: 30, slow: 0.5, damagePerSecond: 3, slimeDeathMs: 6000 };
// Frenesi de Sangue: jogador na zona dos lobos com vida abaixo de HP_FRACTION da máxima enlouquece os lobos a até
// RADIUS px dele: velocidade x SPEED_FACTOR, raio de aggro x AGGRO_FACTOR e o golpe (preparo e recuperação) em
// ATTACK_TIME_FACTOR do tempo.
export const FRENZY = { hpFraction: 0.35, radius: 384, speedFactor: 1.25, aggroFactor: 1.4, attackTimeFactor: 0.6 };
// Descarga dos cristais (os cristais médios da zona dos gnomos): a cada PERIOD_MS, carrega por CHARGE_MS (anel no chão) e
// dispara: quem estiver a até RADIUS px leva DAMAGE (mágico) e é empurrado KNOCKBACK px para fora.
export const CRYSTAL_PULSE = { periodMs: 6000, chargeMs: 800, radius: 96, damage: 20, knockback: 28 };
// Estilhaços de cristal no chão da zona dos gnomos: COUNT por run, a pelo menos MIN_SPACING px entre si; quem passa
// andando por cima (os pés a até RADIUS px) quebra o estilhaço, leva DAMAGE e sangra (BLEED).
export const SHARDS = { count: 70, radius: 12, damage: 6, minSpacing: 96 };
export const BLEED = { damagePerSecond: 4, durationMs: 5000 };

// ---------------------------------------------------------------- atrito no labirinto

// Golpe de mob que acerta o jogador: ele anda a SLOW da velocidade por DURATION_MS (não dá para ignorar a luta e fugir).
export const STAGGER = { slow: 0.6, durationMs: 250 };
// No labirinto, a regeneração de Vida e a de Mana valem isto (a ração e o resto viram necessidade).
export const LABYRINTH_REGEN_FACTOR = 0.5;

// ---------------------------------------------------------------- ferramentas de dev (só com DEV_TOOLS=1 no servidor)

// Teste de drops (test_drops): quantos Cristais caem ao lado do jogador, com uma Essência.
export const DEV_TEST_DROPS = { crystals: 3 };

// Sala de Testes (assets/maps/test_arena.json, de tools/assets/build_test_arena.py): uma área só, sem mobs nem zona.
export const ARENA_AREAS: Record<string, AreaConfig> = { arena: { playerEntry: true, mobs: {} } };
// Boneco de Treino: não anda, não ataca e não morre (zerou, volta inteiro). Fora do bestiário e sem loot.
export const TRAINING_DUMMY: MobStats = {
  size: 24,
  speed: 0,
  maxHp: 300,
  aggroRadius: 0,
  reach: 0,
  windupMs: 1000,
  attackDamage: 0,
  attackReach: 0,
  attackArcDegrees: 0,
  recoverMs: 1000,
};
// Spawn de dev: a SPAWN_TILES tiles à frente de quem pediu (no máximo MAX_SPAWN de uma vez; lowHp: com LOW_HP_FRACTION
// da vida). Limpar Mobs tira os a até CLEAR_RADIUS px. +GOLD moedas por clique.
export const DEV = { spawnTiles: 3, maxSpawn: 10, lowHpFraction: 0.25, clearRadius: 640, gold: 1000 };

// ---------------------------------------------------------------- ataques especiais dos mobs (mobAi.ts)

// Distâncias em px (1 tile = 32), tempos em ms, velocidades em px/s. Dano dos golpes especiais: números iniciais,
// para ajustar jogando.

// Goblin, Investida: a cada COOLDOWN_MS, com o alvo à vista entre MIN e MAX px, prepara por WINDUP_MS e avança a
// SPEED_FACTOR x a velocidade (no máximo MAX_MS), terminando numa facada (o golpe normal dele).
export const GOBLIN_DASH = { cooldownMs: 5000, min: 80, max: 160, windupMs: 350, speedFactor: 3.2, maxMs: 650 };
// Goblin, Arremesso: o alvo ficou entre MIN e MAX px (à vista) por HOLD_MS seguidos: prepara por WINDUP_MS e atira a
// adaga (SPEED px/s, até RANGE px, DAMAGE físico). Sem a adaga na mão por HIDE_MS (só desenho).
export const GOBLIN_THROW = { min: 96, max: 208, holdMs: 2200, windupMs: 300, speed: 360, range: 300, radius: 6, damage: 14, hideMs: 500 };
// Lobo, Bote: a cada COOLDOWN_MS, com o alvo à vista entre MIN e MAX px, agacha por CROUCH_MS (aviso no chão rumo ao
// ponto do salto) e salta a SPEED px/s até onde o alvo estava (no máximo MAX_AIR_MS). Na aterrissagem, quem estiver a
// até HIT_RADIUS px leva DAMAGE e fica a SLOW da velocidade por SLOW_MS. Depois, recupera por RECOVER_MS.
export const WOLF_POUNCE = { cooldownMs: 4500, min: 112, max: 208, crouchMs: 350, speed: 480, maxAirMs: 600, hitRadius: 30, damage: 30, slow: 0.5, slowMs: 1200, recoverMs: 600 };
// Slime, Pulo: com o alvo à vista a até RANGE px, agacha por CROUCH_MS e salta até onde ele estava em AIR_MS; na queda,
// quem estiver a até HIT_RADIUS px leva DAMAGE, e fica uma poça ácida por ACID_MS. Depois, recupera por RECOVER_MS.
export const SLIME_LEAP = { range: 64, crouchMs: 300, airMs: 450, hitRadius: 40, damage: 16, acidMs: 4000, recoverMs: 900 };
// Slime, morte: explode por DEATH_MS (a animação) e solta 2 Mini-Slimes a OFFSET px para cada lado, com HP_FRACTION da
// vida, SPEED_FACTOR x a velocidade e SCALE do desenho, já caçando quem o matou. Mini não se divide.
export const SLIME_SPLIT = { deathMs: 900, offset: 28, hpFraction: 0.35, speedFactor: 1.35, scale: 0.6 };
// Gnomo, conjurador: fica entre KEEP_MIN e KEEP_MAX px do alvo (perto demais, recua; encurralado, picareta). Conjura
// por CAST_MS (a animação de mexer as mãos) cada ataque:
// - Projétil (a cada BOLT_COOLDOWN_MS): BOLT_SPEED px/s, até BOLT_RANGE px, BOLT_DAMAGE mágico;
// - Erupção de cristal (a cada CRYSTAL_COOLDOWN_MS): o círculo aparece sob os pés do alvo; depois de CRYSTAL_WARN_MS,
//   o cristal brota: quem estiver na elipse (CRYSTAL_RADIUS_X, achatada como o chão) leva CRYSTAL_DAMAGE mágico e é
//   empurrado CRYSTAL_KNOCKBACK px. O cristal fica CRYSTAL_SHOW_MS na tela.
export const GNOME_CASTER = {
  keepMin: 112,
  keepMax: 192,
  castMs: 600,
  boltCooldownMs: 2200,
  boltSpeed: 380,
  boltRange: 320,
  boltRadius: 5,
  boltDamage: 12,
  crystalCooldownMs: 5500,
  crystalWarnMs: 550,
  crystalShowMs: 800,
  crystalRadiusX: 30,
  crystalDamage: 28,
  crystalKnockback: 28,
};
// Depois de atirar (adaga, projétil) ou de conjurar o cristal, o mob fica parado por isto antes de voltar a andar.
export const CAST_RECOVER_MS = 300;
// Cerco: mobs que perseguem chegam ao alvo por um ângulo de até ±DEGREES (cada um o seu) quando estão a menos de
// RANGE px dele: o grupo abre em volta em vez de vir em fila.
export const FLANK = { degrees: 40, range: 160 };
