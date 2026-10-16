"""Monta assets/maps/dungeon_floor1.json, o 1º andar do labirinto: 500x500 tiles. Rodar process_labyrinth.py antes.

- Um labirinto de verdade (backtracking numa grade de células de CELL tiles): corredores de 3 tiles com tendência a
  seguir reto, anéis (paredes extras abertas) e becos sem saída, parte deles terminando numa câmara pequena.
- Avenidas de ruína: o caminho do centro até cada saída e até alguns salões vira corredor reto com piso de ruína;
  nos cruzamentos dessas avenidas, uma pracinha com um marco de navegação (estátua, obelisco, fonte, altar...).
  Os outros corredores ganham borda de caverna, irregular.
- Cinco áreas (os nomes de AREAS em balance.ts): centro (salão de ruína com o portal de chegada e os 7 pontos de
  entrada), norte (acampamento goblin), leste (covil dos lobos), oeste (minas dos gnomos) e sul (fosso dos slimes).
  Cada região tem salões com piso temático e a composição do seu kit, e uma câmara de saída no fundo.
- Enfeites são objetos de uma coleção de imagens; os sólidos têm um retângulo de colisão na base. Sólido só vai onde
  há folga em volta (sem flood fill por enfeite); um flood fill só, no fim, confere que tudo continua ligado e
  tira o enfeite que isolar algum pedaço.
- Camadas que o servidor lê: "areas", "spawns" (chegada), "exits" (as 4 saídas, uma por região) e "luzes".

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_labyrinth.py
"""

from __future__ import annotations

import json
import math
import random
import sys
import time
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
W, H, T = 500, 500, 32
CENTER = (250, 250)  # tile do portal de chegada
rng = random.Random(11)

# ---------------------------------------------------------------- tiles

# Chão de caverna (chao_labirinto.png, linha de cada tipo) e os 16 pisos novos (Kit de Pisos Variados).
FLOOR_ROWS = {"pedra": 0, "terra": 1, "musgo": 2, "cristal": 3}
NEW_FLOORS = ["ruina", "terra-tribal", "mina", "musgo-acido"]
FLOOR_KINDS = list(FLOOR_ROWS) + NEW_FLOORS
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


def floor_variants(kind: str) -> list[Image.Image]:
    """As 4 variantes de um tipo de chão, com a mesma cor média (o chão não vira xadrez)."""
    if kind in FLOOR_ROWS:
        files = [WORK / f"floor-{FLOOR_ROWS[kind]}-{col}.png" for col in range(4)]
    else:
        files = [WORK / f"{kind}-{col}.png" for col in range(4)]
    return even_out([Image.open(f).convert("RGBA") for f in files])


class Tiles:
    """Tiles gerados sob demanda: cada combinação de tipo, variante e vizinhas que é usada no mapa vira um tile."""

    def __init__(self) -> None:
        self.floors = {kind: floor_variants(kind) for kind in FLOOR_KINDS}
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

    def floor(self, kind: str, variant: int, n: bool, e: bool, s: bool, w: bool, nw: bool, ne: bool) -> int:
        key = (kind, variant, n, e, s, w, nw, ne)
        return self.get(key, lambda: floor_tile(self.floors[kind][variant], n, e, s, w, nw, ne))

    def wall(self, variant: int, n: bool, e: bool, s: bool, w: bool, corners: tuple[bool, bool, bool, bool]) -> int:
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


# ---------------------------------------------------------------- áreas

# Áreas do servidor (x, y, largura, altura em tiles). Partem o mapa inteiro; os nomes batem com AREAS.
AREA_RECTS = {
    "centro": [(180, 180, 140, 140)],
    "norte": [(100, 0, 300, 180)],
    "sul": [(100, 320, 300, 180)],
    "oeste": [(0, 0, 100, 500), (100, 180, 80, 140)],
    "leste": [(400, 0, 100, 500), (320, 180, 80, 140)],
}
ZONES = list(AREA_RECTS)


def zone_map() -> np.ndarray:
    """Índice (em ZONES) da área de cada célula."""
    zones = np.full((H, W), -1)
    for i, rects in enumerate(AREA_RECTS.values()):
        for x, y, w, h in rects:
            zones[y : y + h, x : x + w] = i
    if (zones < 0).any():
        raise SystemExit("há células fora de qualquer área")
    return zones


# ---------------------------------------------------------------- malha do labirinto

CELL = 8  # tiles por célula do labirinto: corredor de 3 e rocha de 5 entre corredores vizinhos
OFFSET = 2  # borda de rocha
N = (W - 2 * OFFSET) // CELL
STRAIGHT = 0.5  # chance de seguir na mesma direção ao cavar: corredores longos em vez de picadinho
LOOP_CHANCE = 0.08  # parede extra aberta entre células vizinhas: anéis (sempre há outro caminho)
DEAD_END_ROOM = 0.35  # becos sem saída que terminam numa câmara pequena
CORRIDOR = 1  # meia largura do corredor (3 tiles)
YY, XX = np.mgrid[0:H, 0:W]

Cell = tuple[int, int]


def center_of(cell: Cell) -> tuple[int, int]:
    return OFFSET + cell[0] * CELL + CELL // 2, OFFSET + cell[1] * CELL + CELL // 2


def cell_at(x: float, y: float) -> Cell:
    return (min(N - 1, max(0, int((x - OFFSET) // CELL))), min(N - 1, max(0, int((y - OFFSET) // CELL))))


def maze() -> dict[Cell, set[Cell]]:
    """Labirinto perfeito por backtracking (um caminho só entre quaisquer duas células, muitos becos), mais anéis."""
    links: dict[Cell, set[Cell]] = {(i, j): set() for i in range(N) for j in range(N)}
    start = cell_at(*CENTER)
    stack, seen, heading = [start], {start}, {start: (1, 0)}
    while stack:
        i, j = stack[-1]
        options = [(di, dj) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1))
                   if 0 <= i + di < N and 0 <= j + dj < N and (i + di, j + dj) not in seen]
        if not options:
            stack.pop()
            continue
        step = heading[(i, j)] if heading[(i, j)] in options and rng.random() < STRAIGHT else rng.choice(options)
        nxt = (i + step[0], j + step[1])
        links[(i, j)].add(nxt)
        links[nxt].add((i, j))
        seen.add(nxt)
        heading[nxt] = step
        stack.append(nxt)
    for (i, j), linked in links.items():
        for other in ((i + 1, j), (i, j + 1)):
            if other in links and other not in linked and rng.random() < LOOP_CHANCE:
                linked.add(other)
                links[other].add((i, j))
    return links


def carve_passage(mask: np.ndarray, a: Cell, b: Cell) -> None:
    (ax, ay), (bx, by) = center_of(a), center_of(b)
    mask[min(ay, by) - CORRIDOR : max(ay, by) + CORRIDOR + 1, min(ax, bx) - CORRIDOR : max(ax, bx) + CORRIDOR + 1] = True


def ellipse(mask: np.ndarray, cx: float, cy: float, rx: float, ry: float, rough: float = 0.0) -> np.ndarray:
    """Marca uma elipse (borda ondulando até `rough` do raio) e devolve a máscara dela."""
    dx, dy = (XX + 0.5 - cx) / rx, (YY + 0.5 - cy) / ry
    angle = np.arctan2(dy, dx)
    limit = 1 + sum(rng.uniform(0.3, 1) * rough * np.sin(k * angle + rng.uniform(0, 2 * math.pi)) for k in (2, 3, 5))
    shape = np.hypot(dx, dy) <= limit
    mask |= shape
    return shape


def path_between(links: dict[Cell, set[Cell]], start: Cell, goal: Cell) -> list[Cell]:
    """Caminho de células pela malha (BFS)."""
    came = {start: start}
    queue = deque([start])
    while queue:
        cell = queue.popleft()
        if cell == goal:
            break
        for other in links[cell]:
            if other not in came:
                came[other] = cell
                queue.append(other)
    path = [goal]
    while path[-1] != start:
        path.append(came[path[-1]])
    return path[::-1]


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


def smooth_noise(cells: tuple[int, int]) -> np.ndarray:
    """Ruído suave entre 0 e 1: grade pequena sorteada, ampliada com interpolação."""
    small = np.array([[rng.random() for _ in range(cells[1])] for _ in range(cells[0])])
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8), "L").resize((W, H), Image.BICUBIC)) / 255


# ---------------------------------------------------------------- planta

HUB_RADIUS = 15
# Câmara de saída de cada região: no fundo dela, a ~220 tiles do centro.
EXIT_CHAMBERS = {"norte": (250, 30), "sul": (250, 470), "oeste": (30, 250), "leste": (470, 250)}
EXIT_RADIUS = 7
HALLS_PER_REGION = 6
# Onde sortear os salões de cada região (x0, y0, x1, y1), longe das bordas das áreas.
HALL_ZONES = {"norte": (115, 12, 385, 165), "sul": (115, 335, 385, 488), "oeste": (12, 15, 88, 485),
              "leste": (412, 15, 488, 485)}
HALL_FLOOR = {"norte": "terra-tribal", "leste": "terra-tribal", "oeste": "mina", "sul": "musgo-acido"}
# Chão dos corredores de caverna de cada área: (principal, manchas). Manchas são contínuas (ruído suave), nunca
# tiles soltos: um tile isolado de outro tipo vira um "quadrado" que a escuridão realça.
CAVE_FLOOR = {"centro": ("pedra", "pedra"), "norte": ("terra", "pedra"), "leste": ("pedra", "terra"),
              "oeste": ("pedra", "cristal"), "sul": ("musgo", "pedra")}
LANDMARK_SPACING = 28  # tiles entre dois marcos de cruzamento
PLAZA_RADIUS = 4.2


class Plan:
    """A planta do andar: o que é chão, que tipo de chão, salões, avenidas, cruzamentos e becos."""

    def __init__(self) -> None:
        self.links = maze()
        self.zones = zone_map()
        self.cave = np.zeros((H, W), bool)
        self.ruin = np.zeros((H, W), bool)  # avenidas, praças, centro e câmaras de saída: piso de ruína, borda reta
        self.halls: list[dict] = []
        self.plazas: list[tuple[int, int]] = []
        self.dead_ends: list[tuple[int, int]] = []
        self.hall_mask = np.zeros((H, W), bool)
        self.lay_maze()
        self.lay_hub_and_exits()
        self.lay_halls()
        self.lay_avenues()
        self.roughen()

    def lay_maze(self) -> None:
        for cell, linked in self.links.items():
            for other in linked:
                carve_passage(self.cave, cell, other)
        for cell, linked in self.links.items():
            if len(linked) == 1 and rng.random() < DEAD_END_ROOM:
                x, y = center_of(cell)
                ellipse(self.cave, x + 0.5, y + 0.5, 3.2, 2.8, 0.15)
                self.dead_ends.append((x, y))

    def lay_hub_and_exits(self) -> None:
        cx, cy = CENTER
        self.ruin |= ellipse(self.cave, cx + 0.5, cy + 0.5, HUB_RADIUS, HUB_RADIUS * 0.85, 0.05)
        for x, y in EXIT_CHAMBERS.values():
            self.ruin |= ellipse(self.cave, x + 0.5, y + 0.5, EXIT_RADIUS, EXIT_RADIUS * 0.85, 0.05)

    def lay_halls(self) -> None:
        exits = list(EXIT_CHAMBERS.values())
        for region, (x0, y0, x1, y1) in HALL_ZONES.items():
            placed = 0
            for _ in range(400):
                if placed == HALLS_PER_REGION:
                    break
                rx, ry = rng.uniform(13, 20), rng.uniform(10, 14)
                cx, cy = rng.uniform(x0 + rx, x1 - rx), rng.uniform(y0 + ry, y1 - ry)
                if self.zones[int(cy), int(cx)] != ZONES.index(region):
                    continue
                if any(math.hypot(cx - h["x"], cy - h["y"]) < rx + max(h["rx"], h["ry"]) + 10 for h in self.halls):
                    continue
                if any(math.hypot(cx - ex, cy - ey) < rx + EXIT_RADIUS + 12 for ex, ey in exits):
                    continue
                shape = ellipse(self.cave, cx, cy, rx, ry, 0.18)
                self.hall_mask |= shape
                self.halls.append({"region": region, "x": cx, "y": cy, "rx": rx, "ry": ry, "mask": shape})
                placed += 1

    def lay_avenues(self) -> None:
        """Do centro a cada saída e aos dois primeiros salões de cada região: corredores de ruína. Nos cruzamentos
        delas (células com 3 ou mais ligações), uma praça para um marco de navegação."""
        hub = cell_at(*CENTER)
        targets = [cell_at(x, y) for x, y in EXIT_CHAMBERS.values()]
        for region in HALL_ZONES:
            targets += [cell_at(h["x"], h["y"]) for h in self.halls if h["region"] == region][:2]
        on_avenue: set[Cell] = set()
        for goal in targets:
            path = path_between(self.links, hub, goal)
            for a, b in zip(path, path[1:]):
                carve_passage(self.ruin, a, b)
            on_avenue.update(path)
        cx, cy = CENTER
        for cell in sorted(on_avenue, key=lambda c: rng.random()):
            x, y = center_of(cell)
            if len(self.links[cell]) < 3 or math.hypot(x - cx, y - cy) < HUB_RADIUS + 10 or self.hall_mask[y, x]:
                continue
            if any(math.hypot(x - px, y - py) < LANDMARK_SPACING for px, py in self.plazas):
                continue
            if any(math.hypot(x - ex, y - ey) < EXIT_RADIUS + 10 for ex, ey in EXIT_CHAMBERS.values()):
                continue
            self.ruin |= ellipse(self.cave, x + 0.5, y + 0.5, PLAZA_RADIUS, PLAZA_RADIUS, 0.0)
            self.plazas.append((x, y))
        self.ruin &= self.cave

    def roughen(self) -> None:
        """Borda de caverna nos corredores que não são ruína: um pouco da rocha que encosta no chão cai, e a
        suavização arredonda os dentes. Só acrescenta chão: o que foi cavado antes nunca fecha."""
        carved = self.cave.copy()
        protected = self.ruin | self.hall_mask
        near_protected = neighbours(protected) > 0
        edge = ~carved & (neighbours(carved) > 0) & ~near_protected
        rough = carved | (edge & (np.random.default_rng(5).random((H, W)) < 0.3))
        for _ in range(2):
            rough = neighbours(rough) + rough >= 5
        cave = carved | (rough & ~near_protected)
        cave[:OFFSET, :] = cave[-OFFSET:, :] = False
        cave[:, :OFFSET] = cave[:, -OFFSET:] = False
        # Pedrinha de rocha de 1 tile solta no chão parece erro: vira chão.
        lonely = ~cave & (neighbours(~cave) <= 1)
        cave |= lonely
        cave[:OFFSET, :] = cave[-OFFSET:, :] = False
        cave[:, :OFFSET] = cave[:, -OFFSET:] = False
        self.cave = flood(cave, CENTER)  # bolsões soltos viram rocha

    def floor_kinds(self) -> np.ndarray:
        """Índice (em FLOOR_KINDS) do chão de cada célula."""
        patch = smooth_noise((40, 40))
        kinds = np.zeros((H, W), int)
        for i, zone in enumerate(ZONES):
            main, spot = CAVE_FLOOR[zone]
            here = self.zones == i
            kinds[here] = FLOOR_KINDS.index(main)
            kinds[here & (patch > 0.62)] = FLOOR_KINDS.index(spot)
        # Avenida que atravessa um salão não vira estrada no meio dele: lá dentro vale o chão do salão.
        kinds[self.ruin] = FLOOR_KINDS.index("ruina")
        for hall in self.halls:
            kinds[hall["mask"]] = FLOOR_KINDS.index(HALL_FLOOR[hall["region"]])
        return kinds


def tile_layer(tiles: Tiles, plan: Plan) -> list[int]:
    cave = plan.cave
    rock = np.pad(~cave, 1, constant_values=True)
    kinds = plan.floor_kinds()
    variants = np.random.default_rng(9).integers(0, 4, (H, W))
    walls = np.random.default_rng(13).random((H, W))
    data = []
    for y in range(H):
        for x in range(W):
            n, e, s, w = rock[y, x + 1], rock[y + 1, x + 2], rock[y + 2, x + 1], rock[y + 1, x]
            if not cave[y, x]:
                fn, fe, fs, fw = not n, not e, not s, not w
                corners = (not rock[y, x + 2] and not fn and not fe, not rock[y + 2, x + 2] and not fs and not fe,
                           not rock[y + 2, x] and not fs and not fw, not rock[y, x] and not fn and not fw)
                variant = int(walls[y, x] * (len(tiles.faces) if fs else 2))
                data.append(tiles.wall(variant, fn, fe, fs, fw, corners))
            else:
                nw = rock[y, x] and not n and not w
                ne = rock[y, x + 2] and not n and not e
                data.append(tiles.floor(FLOOR_KINDS[kinds[y, x]], int(variants[y, x]), n, e, s, w, nw, ne))
    return data


# ---------------------------------------------------------------- enfeites

# Retângulo de colisão na base de cada enfeite, em frações da imagem (x0, y0, x1, y1). None = não bloqueia.
FOOTPRINT: dict[str, tuple[float, float, float, float] | None] = {
    # Caverna (arte original)
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
    # Acampamento goblin
    "tenda-grande": (0.12, 0.7, 0.88, 0.97),
    "tenda-aberta": (0.15, 0.75, 0.85, 0.97),
    "totem-cranio": (0.3, 0.85, 0.7, 1.0),
    "totem-runas": (0.3, 0.85, 0.7, 1.0),
    "totem-lobo": (0.3, 0.85, 0.7, 1.0),
    "caldeirao": (0.2, 0.7, 0.8, 0.95),
    "jaula": (0.08, 0.72, 0.92, 0.97),
    "barricada-estacas-a": (0.05, 0.65, 0.95, 0.95),
    "barricada-estacas-b": (0.05, 0.65, 0.95, 0.95),
    "rack-armas-a": (0.08, 0.75, 0.92, 0.97),
    "rack-armas-b": (0.08, 0.75, 0.92, 0.97),
    # Minas dos gnomos (arcos e trilhos se atravessam)
    "arco-mina-a": None,
    "arco-mina-b": None,
    "trilho-horizontal": None,
    "trilho-vertical": None,
    "guindaste": (0.15, 0.82, 0.85, 0.98),
    "barris-mina-a": (0.08, 0.6, 0.92, 0.95),
    "barris-mina-b": (0.08, 0.6, 0.92, 0.95),
    "vagoneta-cristais": (0.08, 0.62, 0.92, 0.95),
    "vagoneta-tombada": (0.1, 0.55, 0.85, 0.9),
    # Covil dos lobos
    "esqueleto-gigante": None,
    "ninho-a": None,
    "ninho-b": None,
    "ossos-mochila-a": None,
    "ossos-mochila-b": None,
    "rocha-garras-grande": (0.08, 0.6, 0.92, 0.95),
    "rocha-garras-pequena": (0.08, 0.55, 0.92, 0.95),
    # Fosso dos slimes
    "poca-borda": None,
    "poca-acida": None,
    "ovos-a": (0.12, 0.55, 0.88, 0.92),
    "ovos-b": (0.12, 0.55, 0.88, 0.92),
    "coluna-corroida-a": (0.18, 0.82, 0.82, 0.98),
    "coluna-corroida-b": (0.2, 0.85, 0.8, 0.98),
    "cogumelos-verdes": None,
    "cogumelos-palidos": None,
    "cogumelos-tortos": None,
    "cogumelos-musgo": None,
    # Marcos de navegação e ruínas
    "estatua-sem-cabeca": (0.15, 0.82, 0.85, 0.98),
    "obelisco-runico": (0.15, 0.8, 0.85, 0.98),
    "fonte-seca": (0.1, 0.62, 0.9, 0.95),
    "altar": (0.08, 0.6, 0.92, 0.95),
    "arco-ruina-a": None,
    "arco-ruina-b": None,
    "pilar-caido": None,
    "pilar-quebrado": (0.15, 0.75, 0.6, 0.95),
    "muralha-desabada": (0.08, 0.6, 0.92, 0.95),
    "entulho": None,
    "esqueleto-espada": None,
    "esqueleto-escudo": None,
}
LANDMARK_NAMES = ["estatua-sem-cabeca", "obelisco-runico", "fonte-seca", "altar", "pilar-quebrado", "muralha-desabada"]
RUBBLE = ["arco-ruina-a", "arco-ruina-b", "pilar-caido", "entulho", "esqueleto-espada", "esqueleto-escudo"]


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


def openness(cave: np.ndarray, reach: int = 6) -> np.ndarray:
    """Distância (em células, contando diagonal) de cada célula de chão até a rocha mais próxima, até `reach`."""
    dist = np.where(cave, 99, 0)
    for d in range(1, reach + 1):
        near = neighbours(dist < d) > 0
        dist = np.where(cave & (dist == 99) & near, d, dist)
    return dist


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
        self.open = openness(cave)

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
        if FOOTPRINT[name] is None:
            return []
        left, top = round(cx - w / 2), round(bottom) - h
        r = tile["objectgroup"]["objects"][0]
        return cells_in(left + r["x"], top + r["y"], left + r["x"] + r["width"], top + r["y"] + r["height"])

    def base(self, name: str, cx: float, bottom: float) -> list[tuple[int, int]]:
        """Células do pé do enfeite: a faixa de baixo da imagem (o que encosta no chão)."""
        tile = self.tile_for(name)
        w, h = tile["imagewidth"], tile["imageheight"]
        return cells_in(cx - w * 0.4, bottom - min(h * 0.25, T * 1.5), cx + w * 0.4, bottom)

    def add(self, name: str, cx: float, bottom: float, solid: list[tuple[int, int]] | None = None) -> None:
        tile = self.tile_for(name)
        self.placed.append({"id": 0, "gid": self.firstgid + tile["id"], "name": name, "type": "", "rotation": 0,
                            "visible": True, "x": round(cx - tile["imagewidth"] / 2), "y": round(bottom),
                            "width": tile["imagewidth"], "height": tile["imageheight"], "_solid": solid or []})

    def try_floor(self, name: str, x: int, y: int, min_open: int = 2) -> bool:
        """Enfeite no chão com o pé no tile (x, y). Sólido só com folga: todas as células da base a `min_open` da
        rocha e sem encostar em outro sólido. A ligação de tudo é conferida uma vez só, no fim (settle)."""
        cx, bottom = (x + 0.5) * T, (y + 1) * T
        base = self.base(name, cx, bottom)
        if any(not (0 <= c < W and 0 <= r < H) or not self.cave[r, c] or self.taken[r, c] for c, r in base):
            return False
        solid = self.footprint(name, cx, bottom)
        if solid:
            if any(self.open[r, c] < min_open for c, r in solid):
                return False
            ring = {(c + dx, r + dy) for c, r in solid for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
            if any(self.solid[r, c] and self.cave[r, c] for c, r in ring if 0 <= c < W and 0 <= r < H):
                return False
            for c, r in solid:
                self.solid[r, c] = True
        self.add(name, cx, bottom, solid)
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
        for c, r in cells_in(cx - w * 0.25, bottom - h * 0.85, cx + w * 0.25, bottom):
            self.taken[r, c] = True
        return True

    def fill(self, cells: list[tuple[int, int]], names: list[str], count: int, min_open: int = 2) -> int:
        """Até `count` enfeites (sorteados de `names`) nas células dadas."""
        rng.shuffle(cells)
        placed = 0
        for x, y in cells:
            if placed == count:
                break
            placed += self.try_floor(rng.choice(names), x, y, min_open)
        return placed

    def settle(self, must_reach: list[tuple[int, int]]) -> tuple[int, int]:
        """Um flood fill só, no fim: se algum enfeite sólido isolou um pedaço do chão (ou um ponto obrigatório),
        tira os sólidos que encostam no pedaço isolado e confere de novo. Devolve (alcançáveis, retirados)."""
        removed = 0
        for _ in range(10):
            free = self.cave & ~self.solid
            reach = flood(free, CENTER)
            lost = free & ~reach
            missing = [p for p in must_reach if not reach[p[1], p[0]]]
            if not lost.any() and not missing:
                return int(reach.sum()), removed
            near_lost = neighbours(lost) > 0
            for x, y in missing:
                near_lost[max(0, y - 3) : y + 4, max(0, x - 3) : x + 4] = True
            keep = []
            for obj in self.placed:
                if obj["_solid"] and any(near_lost[r, c] for c, r in obj["_solid"]):
                    for c, r in obj["_solid"]:
                        self.solid[r, c] = False
                    removed += 1
                else:
                    keep.append(obj)
            self.placed = keep
        raise SystemExit("o flood fill final não fechou: há chão isolado que nenhum enfeite explica")


def hall_cells(decor: Decor, hall: dict, margin: int = 2) -> list[tuple[int, int]]:
    """Tiles de chão do salão com pelo menos `margin` de folga da rocha."""
    ys, xs = np.nonzero(hall["mask"] & decor.cave & (decor.open >= margin))
    return list(zip(xs.tolist(), ys.tolist()))


# O que cada região põe nos seus salões: (nomes, quantos por salão, folga mínima da rocha).
HALL_RECIPES = {
    "norte": [(["tenda-grande", "tenda-aberta"], 3, 3), (["totem-cranio", "totem-runas", "totem-lobo"], 3, 2),
              (["caldeirao"], 2, 2), (["jaula"], 1, 3), (["rack-armas-a", "rack-armas-b"], 2, 2),
              (["barricada-estacas-a", "barricada-estacas-b"], 5, 2), (["tocha"], 4, 1), (["ossada"], 2, 1)],
    "oeste": [(["arco-mina-a", "arco-mina-b"], 1, 2), (["trilho-horizontal", "trilho-vertical"], 3, 1),
              (["vagoneta-cristais", "vagoneta-tombada"], 3, 2), (["guindaste"], 1, 3),
              (["barris-mina-a", "barris-mina-b"], 3, 2), (["rocha-minerio"], 3, 2), (["tocha"], 3, 1),
              (["cristal-pequeno"], 3, 1)],
    "leste": [(["ninho-a", "ninho-b"], 3, 2), (["ossos-mochila-a", "ossos-mochila-b"], 3, 1),
              (["rocha-garras-pequena"], 2, 2), (["ossada", "esqueleto"], 3, 1), (["estalagmites", "estalagmite-alta"], 3, 2)],
    "sul": [(["poca-acida", "poca-borda"], 3, 2), (["ovos-a", "ovos-b"], 3, 2),
            (["coluna-corroida-a", "coluna-corroida-b"], 3, 3), (["cogumelos-verdes", "cogumelos-palidos",
            "cogumelos-tortos", "cogumelos-musgo"], 6, 1), (["cogumelos-a", "cogumelos-b"], 3, 1)],
}
# Enfeites soltos nos corredores de caverna de cada área (por 1.000 tiles de chão).
CORRIDOR_DECOR = {
    "centro": [(["cristal-pequeno"], 1.0), (["esqueleto", "ossada"], 0.4)],
    "norte": [(["tocha"], 0.6), (["ossada"], 0.5)],
    "leste": [(["ossada", "esqueleto"], 0.6), (["estalagmites", "estalagmite-alta"], 0.6)],
    "oeste": [(["cristal-pequeno"], 1.0), (["rocha-minerio", "cristal-medio"], 0.6), (["tocha"], 0.3)],
    "sul": [(["cogumelos-a", "cogumelos-b", "cogumelos-musgo"], 1.2)],
}


def decorate(decor: Decor, plan: Plan) -> dict[str, int]:
    counts: dict[str, int] = {}
    cx, cy = CENTER
    # Centro: portal de chegada, cristais nas diagonais, pilares mais para fora.
    decor.add("portal", (cx + 0.5) * T, (cy + 1) * T)
    decor.taken[cy - 3 : cy + 4, cx - 3 : cx + 4] = True
    for angle in (45, 135, 225, 315):
        a = math.radians(angle)
        for radius in (8, 9, 7):
            if decor.try_floor("cristal-grande", round(cx + radius * math.cos(a)), round(cy + radius * 0.85 * math.sin(a))):
                break
    for angle in (0, 90, 180, 270):
        a = math.radians(angle + 22)
        decor.try_floor("pilar", round(cx + 12 * math.cos(a)), round(cy + 10 * math.sin(a)))
    # Salões temáticos.
    for hall in plan.halls:
        cells = hall_cells(decor, hall)
        total = 0
        for names, count, margin in HALL_RECIPES[hall["region"]]:
            total += decor.fill([c for c in cells if decor.open[c[1], c[0]] >= margin], names, count, margin)
        counts[hall["region"]] = counts.get(hall["region"], 0) + total
    # Covil dos lobos: um esqueleto gigante no maior salão; a rocha de garras incandescentes só na borda do covil.
    wolves = sorted((h for h in plan.halls if h["region"] == "leste"), key=lambda h: -h["rx"] * h["ry"])
    if wolves:
        decor.fill(hall_cells(decor, wolves[0], 3), ["esqueleto-gigante"], 1, 3)
        rim = [h for h in wolves if h["x"] < 420][:1] or wolves[-1:]
        decor.fill(hall_cells(decor, rim[0]), ["rocha-garras-grande"], 1, 2)
    # Marcos nos cruzamentos das avenidas: um por praça, revezando os tipos; ruínas soltas em volta.
    for i, (x, y) in enumerate(plan.plazas):
        name = LANDMARK_NAMES[i % len(LANDMARK_NAMES)]
        if decor.try_floor(name, x, y + 1, 2):
            counts["marcos"] = counts.get("marcos", 0) + 1
        decor.fill([(x + dx, y + dy) for dx in range(-3, 4) for dy in range(-3, 4)], RUBBLE, 1, 1)
    # Câmaras de saída: arcos e pilares de ruína e cristais em volta do portal.
    for x, y in EXIT_CHAMBERS.values():
        ring = [(x + dx, y + dy) for dx in range(-6, 7) for dy in range(-5, 6) if 4 <= math.hypot(dx, dy) <= 6]
        decor.fill(ring, ["arco-ruina-a", "arco-ruina-b", "pilar-quebrado", "cristal-grande", "cristal-medio"], 5, 2)
    # Becos sem saída com câmara: algo para achar (por enquanto enfeite; depois baús e mobs especiais).
    for x, y in plan.dead_ends:
        decor.fill([(x, y)], ["esqueleto-espada", "esqueleto-escudo", "ossada", "cristal-pequeno"], 1, 1)
    # Corredores de caverna.
    corridor = decor.cave & ~plan.ruin & ~plan.hall_mask
    for i, zone in enumerate(ZONES):
        ys, xs = np.nonzero(corridor & (plan.zones == i))
        cells = list(zip(xs.tolist(), ys.tolist()))
        for names, per_thousand in CORRIDOR_DECOR[zone]:
            counts[zone] = counts.get(zone, 0) + decor.fill(cells, names, int(len(cells) * per_thousand / 1000), 1)
    # Paredões na rocha de cima de cada chão: dão altura às paredes da caverna (poucos: o mapa é enorme).
    edges = np.argwhere(~decor.cave[:-1, :] & decor.cave[1:, :])
    picks = edges[np.random.default_rng(21).random(len(edges)) < 0.12]
    counts["paredes"] = sum(decor.try_wall(rng.choice(["paredao", "rocha-alta", "rocha-alta", "estalagmite-alta"]), int(x), int(y))
                            for y, x in picks if y >= OFFSET)
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
    # Kits novos
    "obelisco-runico": ("runa", 0.55),
    "altar": ("vela", 0.55),
    "totem-runas": ("runa", 0.5),
    "totem-cranio": ("runa", 0.45),
    "totem-lobo": ("runa", 0.45),
    "caldeirao": ("braseiro", 0.2),
    "vagoneta-cristais": ("cristal-medio", 0.6),
    "rocha-garras-grande": ("garras", 0.5),
    "poca-acida": ("acido", 0.4),
    "poca-borda": ("acido", 0.45),
    "ovos-a": ("acido", 0.5),
    "ovos-b": ("acido", 0.5),
    "cogumelos-verdes": ("cogumelos", 0.6),
    "cogumelos-palidos": ("cogumelos", 0.6),
}


def cave_lights(decor: Decor) -> list[tuple[str, float, float]]:
    return [(GLOWING[o["name"]][0], o["x"] + o["width"] / 2, o["y"] - o["height"] * GLOWING[o["name"]][1])
            for o in decor.placed if o["name"] in GLOWING]


# ---------------------------------------------------------------- pontos

SPAWNS = [(-3, 2), (3, 2), (-4, -1), (4, -1), (0, 3), (-2, 4), (2, 4)]  # em volta do portal de chegada


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
    started = time.perf_counter()
    lap = started

    def tick(label: str) -> None:
        nonlocal lap
        now = time.perf_counter()
        print(f"  {label}: {now - lap:.1f} s")
        lap = now

    plan = Plan()
    tick("planta (malha, salões, avenidas, borda de caverna)")
    tiles = Tiles()
    floor = tile_layer(tiles, plan)
    floor_ts = tiles.tileset()
    tick(f"chão ({floor_ts['tilecount']} tiles no tileset)")
    decor = Decor(plan.cave, firstgid=1 + floor_ts["tilecount"])
    spawns = [(CENTER[0] + dx, CENTER[1] + dy) for dx, dy in SPAWNS]
    exits = list(EXIT_CHAMBERS.values())
    for x, y in spawns + exits:
        reserve(decor, x, y)
    counts = decorate(decor, plan)
    tick("enfeites")
    reach, removed = decor.settle(spawns + exits)
    tick(f"flood fill final ({removed} enfeites tirados)")

    next_id = [1]
    placed = sorted(decor.placed, key=lambda o: o["y"])
    for obj in placed:
        obj["id"] = next_id[0]
        next_id[0] += 1
        del obj["_solid"]
    objects_ts = {"firstgid": decor.firstgid, "name": "labyrinth/objects", "tilecount": len(decor.tiles), "columns": 0,
                  "tilewidth": max(t["imagewidth"] for t in decor.tiles), "tileheight": max(t["imageheight"] for t in decor.tiles),
                  "margin": 0, "spacing": 0, "grid": {"orientation": "orthogonal", "width": 1, "height": 1}, "tiles": decor.tiles}
    center_px = lambda p: ((p[0] + 0.5) * T, (p[1] + 0.5) * T)  # noqa: E731
    lights = cave_lights(decor)
    layers = [
        {"id": 1, "name": "chao", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
         "opacity": 1, "visible": True, "data": floor},
        {"id": 2, "name": "objetos", "type": "objectgroup", "draworder": "topdown", "opacity": 1,
         "visible": True, "x": 0, "y": 0, "objects": placed},
        area_layer(3, next_id),
        point_layer(4, "spawns", [center_px(p) for p in spawns], next_id),
        point_layer(5, "exits", [center_px(p) for p in exits], next_id),
        light_layer(6, lights, next_id),
    ]
    level = {"compressionlevel": -1, "width": W, "height": H, "tilewidth": T, "tileheight": T, "infinite": False,
             "orientation": "orthogonal", "renderorder": "right-down", "type": "map", "version": "1.10",
             "tiledversion": "1.12.2", "nextlayerid": 7, "nextobjectid": next_id[0], "layers": layers,
             "tilesets": [floor_ts, objects_ts]}
    MAP_OUT.write_text(json.dumps(level, separators=(",", ":")) + "\n", encoding="utf-8")
    tick(f"JSON ({MAP_OUT.stat().st_size / 1e6:.1f} MB)")

    free = decor.cave & ~decor.solid
    dead_ends = sum(len(linked) == 1 for linked in plan.links.values())
    kinds: dict[str, int] = {}
    for kind, _, _ in lights:
        kinds[kind] = kinds.get(kind, 0) + 1
    print(f"mapa {W}x{H}: {int(plan.cave.sum())} tiles de chão, {len(plan.halls)} salões, {len(plan.plazas)} praças com marco,"
          f" {dead_ends} becos sem saída ({len(plan.dead_ends)} com câmara)")
    print(f"enfeites: {len(placed)} ({counts}); luzes: {len(lights)} {kinds}")
    for i, name in enumerate(ZONES):
        print(f"  área {name}: {int((free & (plan.zones == i)).sum())} tiles livres")
    print(f"alcance: {reach} de {int(free.sum())} tiles livres alcançáveis do centro")
    print(f"tempo total: {time.perf_counter() - started:.1f} s")


if __name__ == "__main__":
    main()
