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
