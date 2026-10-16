import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAYER_SIZE } from "./balance";
import { BUILDINGS } from "./city";
import { boxFits, isSolid } from "./collision";
import {
  objectSortLine,
  parseArrivalPoints,
  parseCollisionGrid,
  parseInteractionPoints,
  parseSpawnPoints,
  SORT_LINE_PROPERTY,
  type TiledMap,
} from "./tiledMap";

// O mapa gerado da cidade (tools/assets/build_city.py), com as portas dos prédios e a colisão de verdade.
const map = JSON.parse(readFileSync(new URL("../../assets/maps/city.json", import.meta.url), "utf8")) as TiledMap;
const grid = parseCollisionGrid(map);
const T = grid.tileSize;
const half = PLAYER_SIZE / 2;
const points = parseInteractionPoints(map);
const streetDoors = points.filter((p) => (BUILDINGS as readonly string[]).includes(p.name));

// Prédios (objetos cujo tile tem pivô próprio); o da porta é o que tem a porta embaixo, na largura da imagem.
const sortLineIds = new Set(
  map.tilesets.flatMap((ts) =>
    (ts.tiles ?? []).filter((t) => t.properties?.some((p) => p.name === SORT_LINE_PROPERTY)).map((t) => ts.firstgid + t.id),
  ),
);
const buildings = map.layers.flatMap((l) => l.objects ?? []).filter((o) => o.gid !== undefined && sortLineIds.has(o.gid));
const buildingAt = (x: number) => buildings.find((b) => b.x <= x && x <= b.x + (b.width ?? 0));

describe("cidade gerada: portas dos prédios", () => {
  it("cada porta da rua tem prédio com pivô", () => {
    expect(streetDoors).toHaveLength(4);
    for (const door of streetDoors) expect(buildingAt(door.x), door.name).toBeDefined();
  });

  it("o jogador cabe parado no ponto da porta, encostado na parede (a célula de cima é sólida)", () => {
    for (const door of streetDoors) {
      const col = Math.floor(door.x / T);
      const row = Math.floor(door.y / T);
      expect(boxFits(grid, door, half), door.name).toBe(true);
      expect(isSolid(grid, col, row - 1), door.name).toBe(true);
    }
  });

  it("quem está na porta é desenhado na frente do prédio (pés abaixo do pivô)", () => {
    for (const door of streetDoors) {
      const building = buildingAt(door.x);
      expect(door.y + half, door.name).toBeGreaterThan(objectSortLine(map, building as NonNullable<typeof building>));
    }
  });

  it("todos os pontos de interação são alcançáveis andando de um spawn ou de uma chegada", () => {
    const W = grid.width;
    const seen = new Uint8Array(grid.solid.length);
    const queue = [...parseSpawnPoints(map), ...parseArrivalPoints(map)]
      .map((p) => Math.floor(p.y / T) * W + Math.floor(p.x / T))
      .filter((c) => !grid.solid[c]);
    for (const c of queue) seen[c] = 1;
    while (queue.length > 0) {
      const c = queue.pop() as number;
      const neighbours = [c - W, c + W, c % W > 0 ? c - 1 : -1, c % W < W - 1 ? c + 1 : -1];
      for (const n of neighbours) {
        if (n < 0 || n >= seen.length || seen[n] || grid.solid[n]) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    for (const point of points) {
      const cell = Math.floor(point.y / T) * W + Math.floor(point.x / T);
      expect(seen[cell], `${point.name} em ${(point.x / T).toFixed(1)}, ${(point.y / T).toFixed(1)}`).toBe(1);
    }
  });
});
