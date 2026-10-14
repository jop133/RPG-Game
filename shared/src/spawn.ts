import { type Area, type AreaConfig, areaAt } from "./areas";
import type { Vec2 } from "./movement";

// `random` em [0, 1). Recebido de fora para a função continuar pura e testável.
export function pickSpawnPoint(points: readonly Vec2[], random: number): Vec2 {
  const point = points[Math.floor(random * points.length)];
  if (!point) throw new Error("Nenhum ponto de spawn disponível.");
  return point;
}

// Jogador só entra por pontos dentro de áreas que aceitam entrada.
export function entrySpawnPoints(
  points: readonly Vec2[],
  areas: readonly Area[],
  configs: Readonly<Record<string, AreaConfig>>,
): Vec2[] {
  return points.filter((p) => {
    const area = areaAt(areas, p);
    return area !== undefined && configs[area.name]?.playerEntry === true;
  });
}
