import type { Vec2 } from "./movement";

// `random` em [0, 1). Recebido de fora para a função continuar pura e testável.
export function pickSpawnPoint(points: readonly Vec2[], random: number): Vec2 {
  const point = points[Math.floor(random * points.length)];
  if (!point) throw new Error("Nenhum ponto de spawn disponível.");
  return point;
}
