import type { AreaConfig } from "./areas";
import type { MobStats } from "./mobs";

// Pixels por segundo.
export const PLAYER_SPEED = 160;

// Lado da caixa de colisão do jogador, em pixels. Também é o tamanho desenhado.
export const PLAYER_SIZE = 24;

// Ticks de simulação do servidor por segundo.
export const TICK_RATE = 20;

// Distância, em pixels, até onde o servidor envia entidades a um jogador.
// Maior que a meia-diagonal da tela (800×600 → 500): em área iluminada, nada surge do nada dentro da tela.
export const VIEW_RADIUS = 520;

// Folga para deixar de ver: quem já é visto só some além de VIEW_RADIUS + isto. Evita piscar na borda.
export const VIEW_HYSTERESIS = 32;

// Tipos de mob. Placeholders do mapa de teste: nomes e números ainda não são o bestiário de verdade.
// size: lado da caixa de colisão em pixels (não pode passar do tamanho do tile). speed: pixels por segundo.
export const MOB_KINDS = {
  rato: { size: 16, speed: 90 },
  goblin: { size: 22, speed: 70 },
} satisfies Record<string, MobStats>;

export type MobKind = keyof typeof MOB_KINDS;

// Uma entrada por área do mapa (camada "areas" no Tiled). Os nomes precisam bater com os do mapa.
// mobs: quantos de cada tipo nascem na área quando a sala é criada.
// Valores do mapa de teste (assets/maps/test.json).
export const AREAS: Record<string, AreaConfig> = {
  salao: { playerEntry: true, mobs: { rato: 3 } },
  galeria: { playerEntry: false, mobs: { rato: 2, goblin: 2 } },
  tuneis: { playerEntry: true, mobs: { rato: 4 } },
  toca: { playerEntry: false, mobs: { goblin: 5 } },
};
