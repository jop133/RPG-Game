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
export function viewportSize(windowWidth: number, windowHeight: number): { width: number; height: number } {
  const angle = Math.atan2(Math.max(1, windowHeight), Math.max(1, windowWidth));
  return {
    width: Math.floor(2 * SCREEN_HALF_DIAGONAL * Math.cos(angle)),
    height: Math.floor(2 * SCREEN_HALF_DIAGONAL * Math.sin(angle)),
  };
}
