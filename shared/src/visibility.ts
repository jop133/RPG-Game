import { SCREEN_HALF_DIAGONAL, VIEW_HYSTERESIS } from "./balance";
import type { Vec2 } from "./movement";

// `radius` é parâmetro porque vai variar: escuridão é raio menor (regra 4).
export function shouldSee(observer: Vec2, target: Vec2, radius: number, currentlySeen: boolean): boolean {
  const limit = currentlySeen ? radius + VIEW_HYSTERESIS : radius;
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  return dx * dx + dy * dy <= limit * limit;
}

// Tamanho do jogo (pixels do mundo) para uma janela de qualquer formato: mesma proporção da janela,
// meia-diagonal igual a SCREEN_HALF_DIAGONAL. A imagem é ampliada para preencher a janela.
// Sempre par: o Phaser arredonda a textura da camada de luz para tamanho par; com o jogo ímpar sobrava uma linha
// vazia na textura, que ao desenhar (o WebGL inverte a imagem) caía no alto da tela, sem escuridão.
export function viewportSize(windowWidth: number, windowHeight: number): { width: number; height: number } {
  const angle = Math.atan2(Math.max(1, windowHeight), Math.max(1, windowWidth));
  const even = (n: number) => Math.max(2, 2 * Math.floor(n / 2));
  return {
    width: even(2 * SCREEN_HALF_DIAGONAL * Math.cos(angle)),
    height: even(2 * SCREEN_HALF_DIAGONAL * Math.sin(angle)),
  };
}
