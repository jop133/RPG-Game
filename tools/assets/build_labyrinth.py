"""Monta assets/maps/dungeon_floor1.json, o 1º andar do labirinto: a Caverna de Cristal.
Rodar process_labyrinth.py antes.

- A caverna é escavada na rocha: salas (elipses de borda irregular) ligadas por túneis que serpenteiam,
  com a borda roída e suavizada no fim. O que não foi escavado é parede (tile com `solid`).
- Cinco regiões, cada uma com o seu chão, enfeites e mobs: centro (chegada), norte (acampamento goblin),
  leste (covil dos lobos), oeste (minas dos gnomos) e sul (fosso úmido dos slimes). Um túnel sai do centro
  para cada região e um anel por fora liga as regiões vizinhas: sempre há outro caminho para fugir.
- Enfeites são objetos de uma coleção de imagens, como na cidade. Os sólidos têm um retângulo de colisão na
  base; cada sólido só fica se nenhum pedaço da caverna ficar isolado por causa dele.
- Camadas que o servidor lê: "areas" (retângulos com nome; os nomes são os de AREAS em balance.ts),
  "spawns" (onde se chega, em volta do portal do centro) e "exits" (candidatos a saída; o servidor sorteia os ativos).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_labyrinth.py
"""

from __future__ import annotations

import json
import math
import random
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_city import even_out, point_layer  # noqa: E402
from lights import light_layer  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TILESETS = ROOT / "assets" / "tilesets"
LAB = TILESETS / "labyrinth"
WORK = ROOT / "tools" / "assets" / "build" / "labyrinth-floor"  # blocos de chão recortados pelo process_labyrinth.py
MAP_OUT = ROOT / "assets" / "maps" / "dungeon_floor1.json"
W, H, T = 128, 96, 32
CENTER = (64, 48)  # tile do portal de chegada
rng = random.Random(3)

# ---------------------------------------------------------------- tiles

FLOOR_ROWS = {"pedra": 0, "terra": 1, "musgo": 2, "cristal": 3}  # linha de cada tipo em chao_labirinto.png
WALL_TINT = (0.85, 0.92, 1.1)  # rocha puxada para o azul do cristal
WALL_TOP = 0.2  # topo da rocha: quase preto
WALL_RIM = 0.8  # beirada do topo, onde a rocha encosta no chão
FACE_PX = 22  # altura da face, em pixels: o que se vê da frente da parede que fica acima de um chão
FACE_LIGHT = (1.35, 0.75)  # brilho da face no alto e no pé (a arte do paredão é escura)
RIM_PX = 3
V, U = np.mgrid[0:T, 0:T] + 0.5  # linha e coluna do meio de cada pixel do tile


def ramp(dist: np.ndarray, width: float, depth: float) -> np.ndarray:
    """1 longe da parede, caindo até 1 - depth encostado nela (dist = 0), numa faixa de `width` px."""
    return 1 - depth * np.clip(1 - dist / width, 0, 1)


def rgb_of(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB")).astype(float)


def to_image(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).convert("RGBA")


def floor_tile(base: Image.Image, n: bool, e: bool, s: bool, w: bool, nw: bool, ne: bool) -> Image.Image:
    """Chão com a sombra das paredes vizinhas: forte embaixo da face (parede ao norte), fraca dos lados."""
    shade = np.ones((T, T))
    for wall, dist, width, depth in ((n, V, 12, 0.65), (s, T - V, 4, 0.3), (w, U, 8, 0.4), (e, T - U, 8, 0.4),
                                     (nw, np.hypot(U, V), 12, 0.5), (ne, np.hypot(T - U, V), 12, 0.5)):
        if wall:
            shade *= ramp(dist, width, depth)
    return to_image(rgb_of(base) * shade[..., None])


def face_textures() -> list[np.ndarray]:
    """Fatias da arte do paredão (rocha vista de frente), do tamanho da face. Só trechos sem transparência."""
    art = np.asarray(Image.open(LAB / "props" / "paredao.png").convert("RGBA"))
    crops = [art[y0 : y0 + FACE_PX, x0 : x0 + T] for y0 in (56, 82) for x0 in (12, 44, 76)]
    return [crop[:, :, :3].astype(float) for crop in crops if crop[:, :, 3].min() > 250]


def wall_tile(base: Image.Image, face: np.ndarray, n: bool, e: bool, s: bool, w: bool,
              corners: tuple[bool, bool, bool, bool]) -> Image.Image:
    """Rocha vista de cima: topo quase preto e beirada mais clara onde encosta no chão. Com chão ao sul, a parte
    de baixo do tile é a face da parede (`face`, clara em cima e escurecendo até o pé): é isso que dá altura à
    caverna. corners = chão só na diagonal (ne, se, sw, nw): beirada arredondada naquele canto."""
    dist = np.full((T, T), 99.0)
    for floor, d in ((n, V), (w, U), (e, T - U)):
        if floor:
            dist = np.minimum(dist, d)
    for floor, d in zip(corners, (np.hypot(T - U, V), np.hypot(T - U, T - V), np.hypot(U, T - V), np.hypot(U, V))):
        if floor:
            dist = np.minimum(dist, d)
    factor = np.where(dist < 1, WALL_RIM * 1.3, np.where(dist < RIM_PX, WALL_RIM, WALL_TOP))
    rgb = rgb_of(base) * np.array(WALL_TINT) * factor[..., None]
    if s:
        top = T - FACE_PX
        light = np.linspace(FACE_LIGHT[0], FACE_LIGHT[1], FACE_PX)[:, None, None]
        rgb[top:] = face * light
        rgb[top] = rgb_of(base)[top] * np.array(WALL_TINT) * WALL_RIM * 1.5  # quina de cima, que pega luz
    return to_image(rgb)


class Tiles:
    """Tiles gerados sob demanda: cada combinação de tipo, variante e vizinhas que é usada no mapa vira um tile."""

    def __init__(self) -> None:
        self.floors = {
            name: even_out([Image.open(WORK / f"floor-{row}-{col}.png").convert("RGBA") for col in range(4)])
            for name, row in FLOOR_ROWS.items()
        }
        self.faces = face_textures()
        self.images: list[Image.Image] = []
        self.index: dict[tuple, int] = {}
        self.walls: list[int] = []

    def get(self, key: tuple, make) -> int:
        if key not in self.index:
            self.index[key] = len(self.images)
            self.images.append(make())
            if key[0] == "parede":
                self.walls.append(self.index[key])
        return 1 + self.index[key]  # gid: o tileset de chão começa em 1

    def floor(self, kind: str, variant: int, rock: np.ndarray, x: int, y: int) -> int:
        n, e, s, w = (bool(rock[y + dy, x + dx]) for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)))
        nw = bool(rock[y - 1, x - 1]) and not n and not w
        ne = bool(rock[y - 1, x + 1]) and not n and not e
        key = (kind, variant, n, e, s, w, nw, ne)
        return self.get(key, lambda: floor_tile(self.floors[kind][variant], n, e, s, w, nw, ne))

    def wall(self, cave: np.ndarray, x: int, y: int) -> int:
        def floor_at(dx: int, dy: int) -> bool:
            return 0 <= x + dx < W and 0 <= y + dy < H and bool(cave[y + dy, x + dx])

        n, e, s, w = floor_at(0, -1), floor_at(1, 0), floor_at(0, 1), floor_at(-1, 0)
        corners = (floor_at(1, -1) and not n and not e, floor_at(1, 1) and not s and not e,
                   floor_at(-1, 1) and not s and not w, floor_at(-1, -1) and not n and not w)
        # Com face, a variante escolhe a fatia do paredão; sem face, só a textura do topo (duas bastam).
        variant = rng.randrange(len(self.faces) if s else 2)
        key = ("parede", variant, n, e, s, w, corners)
        return self.get(key, lambda: wall_tile(self.floors["pedra"][variant % 4], self.faces[variant], n, e, s, w, corners))

    def tileset(self) -> dict:
        """Grava labyrinth/floor.png e devolve a entrada do tileset no mapa (paredes com `solid`)."""
        cols = 16
        rows = (len(self.images) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * T, rows * T), (0, 0, 0, 0))
        for i, image in enumerate(self.images):
            sheet.paste(image, ((i % cols) * T, (i // cols) * T))
        sheet.save(LAB / "floor.png")
        return {"firstgid": 1, "name": "labyrinth/floor", "image": "../tilesets/labyrinth/floor.png",
                "imagewidth": sheet.width, "imageheight": sheet.height, "tilewidth": T, "tileheight": T,
                "tilecount": len(self.images), "columns": cols, "margin": 0, "spacing": 0,
                "tiles": [{"id": i, "properties": [{"name": "solid", "type": "bool", "value": True}]} for i in sorted(self.walls)]}


# ---------------------------------------------------------------- escavação

YY, XX = np.mgrid[0:H, 0:W]


def chamber(cave: np.ndarray, cx: float, cy: float, rx: float, ry: float, rough: float = 0.2) -> None:
    """Sala: elipse cuja borda ondula (três senoides com fase sorteada) em até `rough` do raio."""
    dx, dy = (XX + 0.5 - cx) / rx, (YY + 0.5 - cy) / ry
    angle = np.arctan2(dy, dx)
    limit = 1 + sum(rng.uniform(0.3, 1) * rough * np.sin(k * angle + rng.uniform(0, 2 * math.pi)) for k in (2, 3, 5))
    cave |= np.hypot(dx, dy) <= limit


def disk(cave: np.ndarray, cx: float, cy: float, r: float) -> None:
    x0, x1 = max(0, int(cx - r) - 1), min(W, int(cx + r) + 2)
    y0, y1 = max(0, int(cy - r) - 1), min(H, int(cy + r) + 2)
    cave[y0:y1, x0:x1] |= np.hypot(XX[y0:y1, x0:x1] + 0.5 - cx, YY[y0:y1, x0:x1] + 0.5 - cy) <= r


def tunnel(cave: np.ndarray, points: list[tuple[float, float]], width: float, wobble: float = 1.5) -> None:
    """Túnel passando pelos pontos (em tiles). Em cada trecho o eixo serpenteia até `wobble` tiles para os lados,
    voltando ao ponto exato nas pontas (para emendar com o trecho seguinte)."""
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        nx, ny = -(y1 - y0) / length, (x1 - x0) / length
        phase, waves = rng.uniform(0, 2 * math.pi), max(1.0, length / rng.uniform(8, 14))
        steps = int(length * 3) + 1
        for i in range(steps + 1):
            t = i / steps
            side = wobble * math.sin(phase + t * waves * 2 * math.pi) * math.sin(math.pi * t)
            disk(cave, x0 + (x1 - x0) * t + nx * side, y0 + (y1 - y0) * t + ny * side, width / 2 * rng.uniform(0.85, 1.15))


# Salas: (centro x, centro y, raio x, raio y), em tiles.
HUB = (64, 48, 13, 10)
CHAMBERS = {
    "norte": [(64, 15, 17, 8), (42, 10, 6, 5), (86, 12, 6, 5), (35, 24, 6, 4), (92, 25, 5, 4)],
    "sul": [(64, 80, 15, 8), (44, 86, 6, 4), (84, 76, 6, 5), (37, 68, 6, 4), (92, 66, 5, 4)],
    "oeste": [(20, 48, 8, 6), (14, 27, 7, 5), (18, 71, 7, 5), (9, 11, 5, 4), (11, 86, 5, 4)],
    "leste": [(108, 46, 5, 4), (116, 30, 5, 5), (112, 66, 6, 4), (118, 80, 5, 5), (106, 14, 5, 4), (98, 30, 4, 3)],
}
# Túneis: (pontos, largura em tiles, quanto serpenteia).
TUNNELS = [
    # Do centro para cada região.
    ([(64, 39), (61, 31), (65, 22)], 4, 1.5),
    ([(64, 57), (67, 65), (64, 73)], 4, 1.5),
    ([(53, 48), (42, 50), (34, 47), (26, 48)], 4, 1.2),
    ([(75, 48), (86, 45), (94, 50), (104, 46)], 3, 2.0),
    # Norte: alas do acampamento.
    ([(47, 12), (52, 14)], 3, 0.5),
    ([(81, 13), (76, 15)], 3, 0.5),
    # Sul: poças laterais.
    ([(50, 83), (47, 85)], 3, 0.5),
    ([(78, 78), (81, 77)], 3, 0.5),
    # Oeste: galerias de mina, quase retas.
    ([(19, 42), (15, 32)], 3, 0.4),
    ([(13, 22), (9, 15)], 3, 0.4),
    ([(19, 54), (17, 66)], 3, 0.4),
    ([(16, 76), (11, 82)], 3, 0.4),
    # Leste: tocas ligadas por passagens sinuosas.
    ([(108, 43), (114, 38), (112, 34), (116, 30)], 3, 2.0),
    ([(116, 26), (110, 21), (106, 15)], 3, 2.0),
    ([(112, 34), (104, 32), (98, 30)], 3, 1.5),
    ([(109, 50), (104, 58), (112, 66)], 3, 2.0),
    ([(114, 70), (120, 74), (118, 80)], 3, 2.0),
    # Anel de dentro: salas nas diagonais, entre os túneis que saem do centro.
    ([(39, 14), (35, 20)], 3, 0.8),
    ([(34, 28), (36, 38), (34, 46)], 3, 1.2),
    ([(88, 16), (91, 21)], 3, 0.8),
    ([(95, 28), (98, 30)], 3, 0.5),
    ([(34, 50), (36, 58), (37, 64)], 3, 1.2),
    ([(40, 72), (44, 82)], 3, 1.0),
    ([(93, 51), (91, 57), (92, 62)], 3, 1.2),
    ([(89, 70), (85, 73)], 3, 0.5),
    # Anel de fora: regiões vizinhas ligadas sem passar pelo centro.
    ([(37, 10), (26, 6), (13, 10)], 3, 1.5),
    ([(91, 12), (100, 8), (106, 14)], 3, 1.5),
    ([(38, 87), (26, 90), (15, 87)], 3, 1.5),
    ([(90, 78), (102, 84), (114, 81)], 3, 1.5),
]
BORDER = 2  # tiles de rocha garantidos na borda do mapa


def neighbours(mask: np.ndarray) -> np.ndarray:
    """Quantas das 8 vizinhas de cada célula estão em `mask` (fora do mapa conta como não)."""
    padded = np.pad(mask, 1).astype(int)
    return sum(padded[1 + dy : H + 1 + dy, 1 + dx : W + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)


def flood(open_cells: np.ndarray, start: tuple[int, int]) -> np.ndarray:
    """Células de `open_cells` alcançáveis de start=(x, y) andando nas 4 direções."""
    seen = np.zeros_like(open_cells)
    if not open_cells[start[1], start[0]]:
        return seen
    seen[start[1], start[0]] = True
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and open_cells[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((nx, ny))
    return seen


def labels(mask: np.ndarray) -> list[np.ndarray]:
    """Pedaços conexos (4 direções) de `mask`."""
    left = mask.copy()
    parts = []
    while left.any():
        y, x = np.argwhere(left)[0]
        part = flood(left, (int(x), int(y)))
        parts.append(part)
        left &= ~part
    return parts


def carve() -> np.ndarray:
    cave = np.zeros((H, W), bool)
    chamber(cave, *HUB, rough=0.12)
    for rooms in CHAMBERS.values():
        for room in rooms:
            chamber(cave, *room)
    for points, width, wobble in TUNNELS:
        tunnel(cave, points, width, wobble)
    # Borda roída: parte da rocha que encosta no chão cai; a suavização depois arredonda os dentes.
    edge = ~cave & (neighbours(cave) > 0)
    cave |= edge & (np.array([[rng.random() for _ in range(W)] for _ in range(H)]) < 0.3)
    for _ in range(2):
        cave = neighbours(cave) + cave >= 5
    cave[:BORDER, :] = cave[-BORDER:, :] = False
    cave[:, :BORDER] = cave[:, -BORDER:] = False
    cave = flood(cave, CENTER)  # bolsões soltos viram rocha
    # Pedrinhas de rocha de 1-4 células no meio do chão parecem erro: viram chão. Maiores ficam (colunas naturais).
    for part in labels(~cave):
        if part.sum() <= 4 and not (part[:BORDER].any() or part[-BORDER:].any() or part[:, :BORDER].any() or part[:, -BORDER:].any()):
            cave |= part
    return cave


# ---------------------------------------------------------------- regiões e chão

# Áreas do servidor (x, y, largura, altura em tiles). Partem o mapa inteiro; os nomes batem com AREAS.
AREA_RECTS = {
    "centro": [(44, 32, 40, 32)],
    "norte": [(32, 0, 64, 32)],
    "sul": [(32, 64, 64, 32)],
    "oeste": [(0, 0, 32, 96), (32, 32, 12, 32)],
    "leste": [(96, 0, 32, 96), (84, 32, 12, 32)],
}


def zone_at(x: float, y: float) -> str:
    for name, rects in AREA_RECTS.items():
        if any(rx <= x < rx + rw and ry <= y < ry + rh for rx, ry, rw, rh in rects):
            return name
    raise ValueError(f"({x}, {y}) fora de qualquer área")


def smooth_noise(cells: tuple[int, int] = (12, 16)) -> np.ndarray:
    """Ruído suave entre 0 e 1: grade pequena sorteada, ampliada com interpolação."""
    small = np.array([[rng.random() for _ in range(cells[1])] for _ in range(cells[0])])
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8), "L").resize((W, H), Image.BICUBIC)) / 255


def floor_zones() -> np.ndarray:
    """Região de cada célula para escolher o chão: a das áreas, com a fronteira tremida para não ficar reta."""
    jx, jy = (smooth_noise() - 0.5) * 8, (smooth_noise() - 0.5) * 8
    zones = np.empty((H, W), dtype=object)
    for y in range(H):
        for x in range(W):
            zones[y, x] = zone_at(min(W - 1, max(0, x + jx[y, x])), min(H - 1, max(0, y + jy[y, x])))
    return zones


def floor_kind(zone: str, x: int, y: int, patch: float) -> str:
    if zone == "centro":
        near = math.hypot(x - CENTER[0], y - CENTER[1])
        # Chão de cristal em volta do portal, rareando aos poucos até virar pedra.
        return "cristal" if near < 6 or rng.random() < 0.6 * (9 - near) / 3 or rng.random() < 0.04 else "pedra"
    if zone == "norte":
        return "pedra" if patch > 0.75 else "terra"
    if zone == "leste":
        return "terra" if patch > 0.8 else "pedra"
    if zone == "oeste":
        return "cristal" if patch > 0.45 else "pedra"
    return "pedra" if patch > 0.8 else "musgo"  # sul


def tile_layer(tiles: Tiles, cave: np.ndarray) -> list[int]:
    zones = floor_zones()
    patch = smooth_noise((16, 22))
    rock = ~cave
    data = []
    for y in range(H):
        for x in range(W):
            if rock[y, x]:
                data.append(tiles.wall(cave, x, y))
            else:
                data.append(tiles.floor(floor_kind(zones[y, x], x, y, patch[y, x]), rng.randrange(4), rock, x, y))
    return data


# ---------------------------------------------------------------- enfeites

# Retângulo de colisão na base de cada enfeite, em frações da imagem (x0, y0, x1, y1). None = não bloqueia.
FOOTPRINT: dict[str, tuple[float, float, float, float] | None] = {
    "rocha-alta": (0.1, 0.78, 0.9, 1.0),
    "paredao": (0.05, 0.75, 0.95, 1.0),
    "pilar": (0.2, 0.82, 0.8, 1.0),
    "estalagmite-alta": (0.15, 0.82, 0.85, 1.0),
    "estalagmites": (0.1, 0.78, 0.9, 1.0),
    "cristal-grande": (0.1, 0.72, 0.9, 1.0),
    "cristal-medio": (0.15, 0.7, 0.85, 1.0),
    "rocha-minerio": (0.1, 0.45, 0.9, 1.0),
    "barricada": (0.05, 0.6, 0.95, 1.0),
    "cristal-pequeno": None,
    "tocha": None,
    "esqueleto": None,
    "ossada": None,
    "cogumelos-a": None,
    "cogumelos-b": None,
    "portal": None,
}


def cell_span(start: float, length: float, count: int) -> tuple[int, int]:
    """Igual ao cellSpanOf de shared/src/tiledMap.ts: células cujo centro cai no intervalo (ou a do meio)."""
    first = math.ceil(start / T - 0.5)
    last = math.ceil((start + length) / T - 0.5) - 1
    if first > last:
        first = last = math.floor((start + length / 2) / T)
    return max(0, first), min(count - 1, last)


def cells_in(x0: float, y0: float, x1: float, y1: float) -> list[tuple[int, int]]:
    c0, c1 = cell_span(x0, x1 - x0, W)
    r0, r1 = cell_span(y0, y1 - y0, H)
    return [(c, r) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]


class Decor:
    """Coleção de imagens dos enfeites + o que já está ocupado no chão."""

    def __init__(self, cave: np.ndarray, firstgid: int):
        self.firstgid = firstgid
        self.tiles: list[dict] = []
        self.by_image: dict[str, int] = {}
        self.placed: list[dict] = []
        self.cave = cave
        self.solid = ~cave  # parede ou base de enfeite sólido: o que o servidor vai achar sólido
        self.taken = np.zeros((H, W), bool)  # onde não pode nascer outro enfeite
        self.reach = int(flood(~self.solid, CENTER).sum())
        self.open = self.openness()

    def openness(self) -> np.ndarray:
        """Distância (em células, contando diagonal) de cada célula de chão até a rocha mais próxima."""
        dist = np.where(self.cave, 99, 0)
        for d in range(1, 8):
            near = neighbours(dist < d) > 0
            dist = np.where(self.cave & (dist == 99) & near, d, dist)
        return dist

    def tile_for(self, name: str) -> dict:
        path = "../tilesets/city/portal.png" if name == "portal" else f"../tilesets/labyrinth/props/{name}.png"
        if name not in self.by_image:
            with Image.open((MAP_OUT.parent / path).resolve()) as image:
                w, h = image.size
            tile: dict = {"id": len(self.tiles), "image": path, "imagewidth": w, "imageheight": h,
                          "properties": [{"name": "solid", "type": "bool", "value": FOOTPRINT[name] is not None}]}
            if (fp := FOOTPRINT[name]) is not None:
                rect = {"id": 1, "name": "", "type": "", "rotation": 0, "visible": True, "x": round(fp[0] * w),
                        "y": round(fp[1] * h), "width": round((fp[2] - fp[0]) * w), "height": round((fp[3] - fp[1]) * h)}
                tile["objectgroup"] = {"draworder": "index", "name": "", "type": "objectgroup", "opacity": 1,
                                       "visible": True, "x": 0, "y": 0, "objects": [rect]}
            self.by_image[name] = len(self.tiles)
            self.tiles.append(tile)
        return self.tiles[self.by_image[name]]

    def footprint(self, name: str, cx: float, bottom: float) -> list[tuple[int, int]]:
        tile = self.tile_for(name)
        w, h = tile["imagewidth"], tile["imageheight"]
        if (fp := FOOTPRINT[name]) is None:
            return []
        left, top = round(cx - w / 2), round(bottom) - h
        r = tile["objectgroup"]["objects"][0]
        return cells_in(left + r["x"], top + r["y"], left + r["x"] + r["width"], top + r["y"] + r["height"])

    def base(self, name: str, cx: float, bottom: float) -> list[tuple[int, int]]:
        """Células do pé do enfeite: a faixa de baixo da imagem (o que encosta no chão)."""
        tile = self.tile_for(name)
        w, h = tile["imagewidth"], tile["imageheight"]
        return cells_in(cx - w * 0.4, bottom - min(h * 0.25, T * 1.5), cx + w * 0.4, bottom)

    def add(self, name: str, cx: float, bottom: float) -> None:
        tile = self.tile_for(name)
        self.placed.append({"id": 0, "gid": self.firstgid + tile["id"], "name": name, "type": "", "rotation": 0,
                            "visible": True, "x": round(cx - tile["imagewidth"] / 2), "y": round(bottom),
                            "width": tile["imagewidth"], "height": tile["imageheight"]})

    def try_floor(self, name: str, x: int, y: int, min_open: int = 3) -> bool:
        """Enfeite no chão com o pé no tile (x, y). Sólido: longe da parede, sem encostar em outro sólido,
        e sem isolar nenhum pedaço da caverna."""
        cx, bottom = (x + 0.5) * T, (y + 1) * T
        base = self.base(name, cx, bottom)
        if any(not self.cave[r, c] or self.taken[r, c] for c, r in base):
            return False
        solid = self.footprint(name, cx, bottom)
        if solid:
            if any(self.open[r, c] < min_open for c, r in solid):
                return False
            ring = {(c + dx, r + dy) for c, r in solid for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
            if any(self.solid[r, c] and self.cave[r, c] for c, r in ring if 0 <= c < W and 0 <= r < H):
                return False
            trial = self.solid.copy()
            for c, r in solid:
                trial[r, c] = True
            reach = int(flood(~trial, CENTER).sum())
            if reach != self.reach - len(set(solid)):
                return False
            self.solid, self.reach = trial, reach
        self.add(name, cx, bottom)
        for c, r in base + solid:
            self.taken[max(0, r - 1) : r + 2, max(0, c - 1) : c + 2] = True
        return True

    def try_wall(self, name: str, x: int, y: int) -> bool:
        """Paredão de pedra encostado na parede de cima de um chão: o pé fica na borda entre a rocha (x, y) e o
        chão (x, y + 1), e a imagem sobe por cima da rocha. Só cabe se o corpo da imagem cobrir só rocha
        (senão esconderia quem anda do outro lado) e não muda a colisão (a base já é parede)."""
        tile = self.tile_for(name)
        w, h = tile["imagewidth"], tile["imageheight"]
        cx, bottom = (x + 0.5) * T, (y + 1) * T
        body = cells_in(cx - w * 0.4, bottom - h * 0.85, cx + w * 0.4, bottom)
        if any(self.cave[r, c] or self.taken[r, c] for c, r in body):
            return False
        self.add(name, cx, bottom)
        core = cells_in(cx - w * 0.25, bottom - h * 0.85, cx + w * 0.25, bottom)
        for c, r in core:
            self.taken[r, c] = True
        return True

    def scatter(self, zone: str, names: list[str], count: int, min_open: int = 3) -> int:
        """Até `count` enfeites (sorteados de `names`) em tiles de chão da área `zone`."""
        cells = [(x, y) for y in range(H) for x in range(W) if self.cave[y, x] and zone_at(x, y) == zone]
        rng.shuffle(cells)
        placed = 0
        for x, y in cells:
            if placed == count:
                break
            if self.try_floor(rng.choice(names), x, y, min_open):
                placed += 1
        return placed


def decorate_hub(decor: Decor) -> None:
    """Centro: portal de chegada cercado de cristais grandes, pilares mais para fora, um esqueleto."""
    cx, cy = CENTER
    decor.add("portal", (cx + 0.5) * T, (cy + 1) * T)
    for c, r in decor.base("portal", (cx + 0.5) * T, (cy + 1) * T):
        decor.taken[r - 2 : r + 3, c - 2 : c + 3] = True
    for angle in (45, 135, 225, 315):  # diagonais: as quatro saídas do centro (N, S, L, O) ficam livres
        a = math.radians(angle)
        for radius in (6, 7, 5):
            if decor.try_floor("cristal-grande", round(cx + radius * 1.2 * math.cos(a)), round(cy + radius * math.sin(a)), 2):
                break
    for angle in (20, 160, 200, 340):
        a = math.radians(angle)
        decor.try_floor("cristal-medio", round(cx + 8.5 * math.cos(a)), round(cy + 6 * math.sin(a)), 2)
    for angle in (60, 120, 240, 300):
        a = math.radians(angle)
        decor.try_floor("pilar", round(cx + 11 * math.cos(a)), round(cy + 8 * math.sin(a)), 2)


def decorate_camp(decor: Decor) -> None:
    """Norte: paliçada de barricadas em volta do acampamento, com aberturas ao sul e nas alas."""
    cx, cy, rx, ry = CHAMBERS["norte"][0]
    for angle in (200, 230, 260, 290, 320, 345, 15, 165):
        a = math.radians(angle)
        x, y = round(cx + (rx - 4) * math.cos(a)), round(cy + (ry - 2.5) * math.sin(a))
        if decor.try_floor("barricada", x, y, 2):
            decor.try_floor("tocha", x + rng.choice((-2, 2)), y + 1, 0)


def decorate(decor: Decor) -> dict[str, int]:
    decorate_hub(decor)
    decorate_camp(decor)
    counts = {
        "centro": decor.scatter("centro", ["cristal-pequeno"], 6) + decor.scatter("centro", ["esqueleto"], 1),
        "norte": decor.scatter("norte", ["tocha"], 12, 0) + decor.scatter("norte", ["rocha-alta", "estalagmites"], 6)
        + decor.scatter("norte", ["ossada", "esqueleto"], 3),
        "leste": decor.scatter("leste", ["ossada"], 7) + decor.scatter("leste", ["esqueleto"], 5)
        + decor.scatter("leste", ["estalagmites", "estalagmite-alta"], 10),
        "oeste": decor.scatter("oeste", ["rocha-minerio"], 12) + decor.scatter("oeste", ["cristal-medio", "cristal-grande"], 8)
        + decor.scatter("oeste", ["cristal-pequeno"], 10) + decor.scatter("oeste", ["tocha"], 4, 0),
        "sul": decor.scatter("sul", ["cogumelos-a", "cogumelos-b"], 16) + decor.scatter("sul", ["estalagmites", "estalagmite-alta"], 8)
        + decor.scatter("sul", ["cristal-pequeno"], 8),
    }
    # Paredões na rocha de cima de cada chão: dão altura às paredes da caverna.
    edges = [(x, y) for y in range(BORDER, H - 1) for x in range(W) if not decor.cave[y, x] and decor.cave[y + 1, x]]
    rng.shuffle(edges)
    counts["paredes"] = sum(decor.try_wall(rng.choice(["paredao", "rocha-alta", "rocha-alta", "estalagmite-alta"]), x, y)
                            for x, y in edges if rng.random() < 0.6)
    return counts


# ---------------------------------------------------------------- luzes

# Enfeites que brilham: tipo de luz (LIGHT_RADIUS em balance.ts) e altura do centro da luz, em fração da imagem
# a partir da base (a luz fica no meio do cristal, na chama da tocha...).
GLOWING = {
    "cristal-grande": ("cristal-grande", 0.4),
    "cristal-medio": ("cristal-medio", 0.4),
    "cristal-pequeno": ("cristal-pequeno", 0.4),
    "rocha-minerio": ("minerio", 0.4),
    "cogumelos-a": ("cogumelos", 0.35),
    "cogumelos-b": ("cogumelos", 0.35),
    "tocha": ("tocha", 0.6),
    "portal": ("portal", 0.45),
}


def cave_lights(decor: Decor) -> list[tuple[str, float, float]]:
    return [(GLOWING[o["name"]][0], o["x"] + o["width"] / 2, o["y"] - o["height"] * GLOWING[o["name"]][1])
            for o in decor.placed if o["name"] in GLOWING]


# ---------------------------------------------------------------- pontos

SPAWNS = [(-3, 2), (3, 2), (-4, -1), (4, -1), (0, 3), (-2, 4), (2, 4)]  # em volta do portal de chegada
# Candidatos a saída: dois por região de fora, nas salas mais afastadas do centro.
EXITS = [(42, 10), (86, 12), (114, 30), (112, 66), (14, 27), (18, 71), (44, 86), (84, 76)]


def reserve(decor: Decor, x: int, y: int, radius: int = 2) -> None:
    if not decor.cave[y, x]:
        raise SystemExit(f"o ponto ({x}, {y}) caiu na rocha")
    decor.taken[max(0, y - radius) : y + radius + 1, max(0, x - radius) : x + radius + 1] = True


def area_layer(layer_id: int, next_id: list[int]) -> dict:
    objs = []
    for name, rects in AREA_RECTS.items():
        for x, y, w, h in rects:
            objs.append({"id": next_id[0], "name": name, "type": "", "rotation": 0, "visible": True,
                         "x": x * T, "y": y * T, "width": w * T, "height": h * T})
            next_id[0] += 1
    return {"id": layer_id, "name": "areas", "type": "objectgroup", "draworder": "topdown", "opacity": 1,
            "visible": True, "x": 0, "y": 0, "objects": objs}


def main() -> None:
    cave = carve()
    tiles = Tiles()
    floor = tile_layer(tiles, cave)
    floor_ts = tiles.tileset()
    decor = Decor(cave, firstgid=1 + floor_ts["tilecount"])
    spawns = [(CENTER[0] + dx, CENTER[1] + dy) for dx, dy in SPAWNS]
    for x, y in spawns + EXITS:
        reserve(decor, x, y)
    unreachable = [p for p in spawns + EXITS if not flood(cave, CENTER)[p[1], p[0]]]
    if unreachable:
        raise SystemExit(f"pontos fora da caverna principal: {unreachable}")
    counts = decorate(decor)

    next_id = [1]
    placed = sorted(decor.placed, key=lambda o: o["y"])
    for obj in placed:
        obj["id"] = next_id[0]
        next_id[0] += 1
    objects_ts = {"firstgid": decor.firstgid, "name": "labyrinth/objects", "tilecount": len(decor.tiles), "columns": 0,
                  "tilewidth": max(t["imagewidth"] for t in decor.tiles), "tileheight": max(t["imageheight"] for t in decor.tiles),
                  "margin": 0, "spacing": 0, "grid": {"orientation": "orthogonal", "width": 1, "height": 1}, "tiles": decor.tiles}
    center_px = lambda p: ((p[0] + 0.5) * T, (p[1] + 0.5) * T)  # noqa: E731
    layers = [
        {"id": 1, "name": "chao", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
         "opacity": 1, "visible": True, "data": floor},
        {"id": 2, "name": "objetos", "type": "objectgroup", "draworder": "topdown", "opacity": 1,
         "visible": True, "x": 0, "y": 0, "objects": placed},
        area_layer(3, next_id),
        point_layer(4, "spawns", [center_px(p) for p in spawns], next_id),
        point_layer(5, "exits", [center_px(p) for p in EXITS], next_id),
        light_layer(6, cave_lights(decor), next_id),
    ]
    level = {"compressionlevel": -1, "width": W, "height": H, "tilewidth": T, "tileheight": T, "infinite": False,
             "orientation": "orthogonal", "renderorder": "right-down", "type": "map", "version": "1.10",
             "tiledversion": "1.12.2", "nextlayerid": 7, "nextobjectid": next_id[0], "layers": layers,
             "tilesets": [floor_ts, objects_ts]}
    MAP_OUT.write_text(json.dumps(level) + "\n", encoding="utf-8")

    free = ~decor.solid
    print(f"mapa {W}x{H}: {int(cave.sum())} tiles de chão escavados, {floor_ts['tilecount']} tiles no tileset")
    print(f"enfeites: {len(placed)} ({counts})")
    for name in AREA_RECTS:
        cells = sum(1 for y in range(H) for x in range(W) if free[y, x] and zone_at(x, y) == name)
        print(f"  área {name}: {cells} tiles livres")
    print(f"alcance: {decor.reach} de {int(free.sum())} tiles livres alcançáveis do centro")


if __name__ == "__main__":
    main()
