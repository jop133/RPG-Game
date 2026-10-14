import type { AreaConfig } from "./areas";
import type { MobStats } from "./mobs";

// Pixels por segundo.
export const PLAYER_SPEED = 160;

// Lado da caixa de colisão do jogador, em pixels. Também é o tamanho desenhado.
export const PLAYER_SIZE = 24;

export const PLAYER_MAX_HP = 100;

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
// reach: distância, de borda a borda, em que o mob para ao alcançar o alvo (e, no 4d, de onde ataca).
export const MOB_KINDS = {
  rato: { size: 16, speed: 90, maxHp: 20, aggroRadius: 160, reach: 8 },
  goblin: { size: 22, speed: 70, maxHp: 40, aggroRadius: 224, reach: 12 },
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
