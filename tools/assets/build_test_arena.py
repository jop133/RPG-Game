"""Monta assets/maps/test_arena.json, a Sala de Testes (só com DEV_TOOLS=1 no servidor; ver CLAUDE.md).

Sala de 24x24 tiles de chão, fechada por rocha, com:
- um trecho de parede (2 tiles de grossura) num canto e um pilar de rocha 2x2 no outro: colisão e sombra (raycasting);
- 9 tochas em grade (a sala é clara: dá para ver tudo o que se testa);
- o ponto de chegada no centro, uma saída (portal) ao sul e a área "arena" (ARENA_AREAS em balance.ts).

Não desenha tile novo: cada tile vem do próprio labirinto (dungeon_floor1.json), escolhido pelo desenho das 8
vizinhas (parede ou chão), de preferência um dos usados perto do salão central. Mesmo tileset, mesma arte.
Rodar de novo depois de regenerar o labirinto (os gids mudam).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_test_arena.py
"""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LABYRINTH = ROOT / "assets" / "maps" / "dungeon_floor1.json"
OUT = ROOT / "assets" / "maps" / "test_arena.json"
T = 32
SIZE = 34  # mapa inteiro, em tiles
ROOM = (5, 5, 24, 24)  # coluna, linha, largura e altura do chão
WALL_SEGMENT = (21, 9, 5, 2)  # trecho de parede no canto de cima, à direita
PILLAR = (8, 21, 2, 2)  # pilar de rocha no canto de baixo, à esquerda
CENTER_RADIUS = 30  # tiles em volta do salão central do labirinto de onde vêm os tiles preferidos
rng = random.Random(7)


def rock_mask() -> list[list[bool]]:
    rock = [[True] * SIZE for _ in range(SIZE)]
    x0, y0, w, h = ROOM
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            rock[y][x] = False
    for x0, y0, w, h in (WALL_SEGMENT, PILLAR):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                rock[y][x] = True
    return rock


def pattern(rock, x: int, y: int, width: int, height: int) -> tuple[bool, ...]:
    """O tile e as 8 vizinhas (fora do mapa conta como rocha)."""
    def at(cx: int, cy: int) -> bool:
        return True if cx < 0 or cy < 0 or cx >= width or cy >= height else rock(cx, cy)
    return tuple(at(x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1))


def main() -> None:
    lab = json.loads(LABYRINTH.read_text(encoding="utf-8"))
    width, height = lab["width"], lab["height"]
    floor_set = lab["tilesets"][0]
    solid = {floor_set["firstgid"] + t["id"] for t in floor_set.get("tiles", [])
             if any(p["name"] == "solid" and p["value"] for p in t.get("properties", []))}
    data = next(layer for layer in lab["layers"] if layer["name"] == "chao")["data"]

    def lab_rock(x: int, y: int) -> bool:
        return data[y * width + x] in solid

    # Gids de cada desenho de vizinhas: os do centro do labirinto à parte (preferidos) e os de todo o mapa.
    near: dict[tuple, Counter] = defaultdict(Counter)
    anywhere: dict[tuple, Counter] = defaultdict(Counter)
    cx, cy = width // 2, height // 2
    for y in range(height):
        for x in range(width):
            key = pattern(lab_rock, x, y, width, height)
            gid = data[y * width + x]
            anywhere[key][gid] += 1
            if abs(x - cx) <= CENTER_RADIUS and abs(y - cy) <= CENTER_RADIUS:
                near[key][gid] += 1

    rock = rock_mask()
    tiles: list[int] = []
    misses = 0
    for y in range(SIZE):
        for x in range(SIZE):
            key = pattern(lambda px, py: rock[py][px], x, y, SIZE, SIZE)
            options = near.get(key) or anywhere.get(key)
            if not options:
                # Desenho que o labirinto não tem: o mais parecido (menos vizinhas diferentes), com o mesmo centro.
                misses += 1
                same = [k for k in anywhere if k[4] == key[4]]
                best = min(same, key=lambda k: sum(a != b for a, b in zip(k, key)))
                options = anywhere[best]
            # Entre os 4 gids mais usados para o desenho: variedade sem misturar piso de outra zona.
            top = [gid for gid, _ in options.most_common(4)]
            tiles.append(rng.choice(top))

    x0, y0, w, h = ROOM
    next_id = [1]

    def point(name: str, col: float, row: float) -> dict:
        obj = {"id": next_id[0], "name": name, "type": "", "point": True, "rotation": 0, "visible": True,
               "width": 0, "height": 0, "x": col * T, "y": row * T}
        next_id[0] += 1
        return obj

    def group(layer_id: int, name: str, objects: list[dict]) -> dict:
        return {"id": layer_id, "name": name, "type": "objectgroup", "draworder": "topdown", "opacity": 1,
                "visible": True, "x": 0, "y": 0, "objects": objects}

    middle = (x0 + w / 2, y0 + h / 2)
    # Grade de 3x3 tochas, a cada 8 tiles: a sala inteira na luz (o servidor envia tudo o que está nela).
    lights = [point("tocha", x0 + 4 + 8 * i, y0 + 4 + 8 * j) for j in range(3) for i in range(3)]
    area = {"id": next_id[0], "name": "arena", "type": "", "rotation": 0, "visible": True,
            "x": x0 * T, "y": y0 * T, "width": w * T, "height": h * T}
    next_id[0] += 1
    arena = {
        "compressionlevel": -1, "width": SIZE, "height": SIZE, "tilewidth": T, "tileheight": T, "infinite": False,
        "orientation": "orthogonal", "renderorder": "right-down", "type": "map",
        "version": lab.get("version", "1.10"), "tiledversion": lab.get("tiledversion", "1.12.2"),
        "layers": [
            {"id": 1, "name": "chao", "type": "tilelayer", "width": SIZE, "height": SIZE, "x": 0, "y": 0,
             "opacity": 1, "visible": True, "data": tiles},
            group(2, "objetos", []),
            group(3, "areas", [area]),
            group(4, "spawns", [point("", middle[0], middle[1] + 1)]),
            group(5, "exits", [point("", middle[0], y0 + h - 3)]),
            group(6, "luzes", lights),
        ],
        "nextlayerid": 7, "nextobjectid": next_id[0],
        "tilesets": lab["tilesets"],
    }
    OUT.write_text(json.dumps(arena, ensure_ascii=False), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {SIZE}x{SIZE} tiles, desenhos sem par no labirinto: {misses}")


if __name__ == "__main__":
    main()
