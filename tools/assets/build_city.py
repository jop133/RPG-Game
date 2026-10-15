"""Monta assets/maps/city.json com a arte processada em assets/tilesets/city/ (rodar process_city.py antes).

A cidade é desenhada de frente (as fachadas olham para baixo da tela), então ela é organizada em fileiras: cada
prédio tem a base na beira de cima de uma calçada, com a rua logo abaixo.

- Fileira norte (base na linha 20): 2 casas, Salão da Guilda, a alameda do Portal (braseiros e postes),
  Estalagem & Cofre, 2 casas. Atrás, um parque com árvores e cercas.
- Faixa do meio (base na linha 36): feira de rua a oeste, praça central de piso nobre (chafariz no meio, caminho
  de bronze do portal até ele, árvores, bancos, mesas da taverna na frente da estalagem), Forja do Ferreiro e uma
  casa a leste.
- Rua Principal (linhas 37-40) cortando o mapa, com faixa de travessia; avenida para o sul.
- Fileira sul (base na linha 53): 7 casas de frente para a Rua Sul, de paralelepípedo rústico (bairro de fora).

Chão: tileset de 32x32 (city/floor.png) com os tiles nobres de Tileset.png, as guias montadas para as 4 direções
e o paralelepípedo rústico antigo. Prédios e enfeites são objetos de uma coleção de imagens; a colisão de cada um é
um retângulo na base (o jogador passa atrás dos telhados e das copas). Luzes: camada "luzes" (lights.py).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_city.py
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lights import light_layer, warm_spots  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CITY = ROOT / "assets" / "tilesets" / "city"
WORK = ROOT / "tools" / "assets" / "build"  # tiles recortados pelo process_city.py
MAP_OUT = ROOT / "assets" / "maps" / "city.json"
W, H, T = 80, 60, 32
rng = random.Random(7)

# ---------------------------------------------------------------- chão


def tile(name: str) -> Image.Image:
    """Tile de Tileset.png (linha-coluna da folha)."""
    return Image.open(WORK / "floor2" / f"tile-{name}.png").convert("RGBA")


def rustic(name: str) -> Image.Image:
    """Bloco do paralelepípedo rústico antigo (chao_cidade.png)."""
    return Image.open(WORK / "floor" / f"floor-{name}.png").convert("RGBA")


def flip_h(image: Image.Image) -> Image.Image:
    return image.transpose(Image.FLIP_LEFT_RIGHT)


def flip_v(image: Image.Image) -> Image.Image:
    return image.transpose(Image.FLIP_TOP_BOTTOM)


# A guia de baixo (rua ao sul) mostra a face do meio-fio: 10 px (linhas 22-31). As laterais e a de cima, só a beirada
# de cima do meio-fio: 4 px. Por isso a guia de cima é a lateral girada, e não a de baixo espelhada.
CURB_FACE = 10
CURB_EDGE = 4


def curb_tiles() -> dict[str, list[Image.Image]]:
    north = [tile("2-1"), tile("2-2")]  # calçada em cima, rua embaixo
    west = [tile("2-4"), tile("2-5")]  # rua à esquerda (oeste), calçada à direita
    east = [flip_h(i) for i in west]
    south = [i.rotate(-90) for i in west]  # rua em cima
    curve = [tile("2-6"), tile("2-7")]  # rua só no quadrante de baixo-esquerda, guia curva

    def corner(base: Image.Image, side: Image.Image, cols: slice, rows: slice) -> Image.Image:
        out = np.asarray(base).copy()
        out[rows, cols] = np.asarray(side)[rows, cols]
        return Image.fromarray(out)

    top = slice(0, T - CURB_FACE)
    below = slice(CURB_EDGE, T)
    return {
        "guia-n": north,
        "guia-s": south,
        "guia-l": west,
        "guia-o": east,
        # Esquina de quarteirão: o nome diz em que canto do tile fica a calçada (a rua passa pelos outros dois lados).
        "canto-ext-no": [corner(north[0], east[0], slice(T - CURB_EDGE, T), top)],
        "canto-ext-ne": [corner(north[0], west[0], slice(0, CURB_EDGE), top)],
        "canto-ext-so": [corner(south[0], east[0], slice(T - CURB_EDGE, T), below)],
        "canto-ext-se": [corner(south[0], west[0], slice(0, CURB_EDGE), below)],
        # Canto interno: a rua ocupa só um quadrante (o do nome), com a guia curva.
        "canto-int-so": curve,
        "canto-int-se": [flip_h(i) for i in curve],
        "canto-int-no": [flip_v(i) for i in curve],
        "canto-int-ne": [flip_h(flip_v(i)) for i in curve],
    }


def floor_kinds() -> dict[str, list[Image.Image]]:
    return {
        # Rua nobre (centro): paralelepípedo cinza, que destaca da calçada bege.
        "rua": [tile("0-1")],
        "rua-desenho": [tile("0-4")],  # paralelepípedo em círculos: cruzamentos
        "faixa": [tile("4-2")],  # faixa de travessia
        # Rua rústica (bairro de fora): o paralelepípedo antigo, com musgo e terra.
        "rua-rustica": even_out([rustic(n) for n in ("0-0", "0-1", "0-2")]),
        "rua-musgo": even_out([rustic("0-3")]),
        "rua-terra": even_out([rustic(n) for n in ("3-3", "3-4")]),
        # Calçada e guias.
        "calcada": [tile("2-0"), tile("2-3")],
        **curb_tiles(),
        # Praça: piso liso com desenhos.
        "praca": [tile("4-6")],
        "praca-borda": [tile("4-3")],  # moldura de bronze na beira da praça
        "praca-bronze": [tile("1-2"), tile("1-3")],  # caminho do portal ao chafariz
        "praca-moldura": [tile("1-4"), tile("1-5")],  # anel em volta do chafariz
        "praca-roseta": [tile("1-7")],
        "praca-circulo": [tile("1-0"), tile("1-1")],
        # Feira e pátio da forja.
        "feira": [tile("0-0")],
        "feira-laje": [tile("0-5")],
        "forja": [tile("0-2")],
        # Grama e canteiros.
        "grama": [tile("3-0")],
        "grama-flores": [tile("3-1"), tile("3-2")],
    }


def flatten(image: Image.Image) -> np.ndarray:
    """Tira a variação de brilho de baixa frequência (borda mais escura que o meio), mantendo o detalhe."""
    rgb = np.asarray(image.convert("RGB")).astype(float)
    low = np.asarray(image.convert("RGB").resize((4, 4), Image.BOX).resize((T, T), Image.BILINEAR)).astype(float)
    return rgb / np.maximum(low, 1) * rgb.mean(axis=(0, 1))


def even_out(variants: list[Image.Image]) -> list[Image.Image]:
    """Vinheta fora e todas as variantes com a mesma cor média: o paralelepípedo rústico antigo não vira xadrez."""
    flat = [flatten(v) for v in variants]
    target = np.mean([f.mean(axis=(0, 1)) for f in flat], axis=0)
    return [Image.fromarray(np.clip(f / f.mean(axis=(0, 1)) * target, 0, 255).astype(np.uint8)).convert("RGBA") for f in flat]


def build_floor_tileset() -> dict[str, list[int]]:
    """Grava city/floor.png e devolve, para cada tipo de chão, os ids (locais) das variantes."""
    ids: dict[str, list[int]] = {}
    images: list[Image.Image] = []
    for name, variants in floor_kinds().items():
        ids[name] = list(range(len(images), len(images) + len(variants)))
        images.extend(variants)
    cols = 8
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * T, rows * T), (0, 0, 0, 0))
    for i, image in enumerate(images):
        sheet.paste(image, ((i % cols) * T, (i // cols) * T))
    sheet.save(CITY / "floor.png")
    ids["_count"] = [len(images)]
    return ids


# ---------------------------------------------------------------- traçado

# Linha onde fica a base dos prédios de cada fileira (a fachada encosta na calçada logo abaixo).
NORTH_BASE, MIDDLE_BASE, SOUTH_BASE = 20, 36, 53
# Ruas (retângulos de células, inclusive): (x0, y0, x1, y1).
NOBLE_ROADS = [
    (37, 5, 42, 20),  # alameda do Portal
    (0, 21, 20, 22),  # Rua Norte, oeste
    (59, 21, 79, 22),  # Rua Norte, leste
    (0, 37, 79, 40),  # Rua Principal
    (38, 41, 41, 53),  # avenida sul
]
RUSTIC_ROADS = [(0, 54, 79, 57)]  # Rua Sul
PLAZA = (21, 20, 58, 35)  # começa na linha 20: a Guilda e a Estalagem abrem direto na praça
MARKET = (0, 24, 20, 35)
FORGE_YARD = (59, 24, 79, 35)
CROSSWALK = (39, 37, 40, 40)
FOUNTAIN = (40.0, 31.0)  # meio da base do chafariz, em tiles


def rect_mask(rects: list[tuple[int, int, int, int]]) -> np.ndarray:
    mask = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in rects:
        mask[y0 : y1 + 1, x0 : x1 + 1] = True
    return mask


def layout() -> dict[str, np.ndarray]:
    noble, rustic_road = rect_mask(NOBLE_ROADS), rect_mask(RUSTIC_ROADS)
    plaza = rect_mask([PLAZA])
    return {"noble": noble & ~plaza, "rustic": rustic_road, "road": (noble | rustic_road) & ~plaza, "plaza": plaza,
            "market": rect_mask([MARKET]), "yard": rect_mask([FORGE_YARD])}


def is_road(road: np.ndarray, x: int, y: int) -> bool:
    return 0 <= x < W and 0 <= y < H and bool(road[y, x])


def curb_kind(road: np.ndarray, x: int, y: int) -> str | None:
    """Guia de uma célula de calçada encostada na rua (ou None se não encosta)."""
    n, s, w, e = is_road(road, x, y - 1), is_road(road, x, y + 1), is_road(road, x - 1, y), is_road(road, x + 1, y)
    if s and e and not (n or w):
        return "canto-ext-no"
    if s and w and not (n or e):
        return "canto-ext-ne"
    if n and e and not (s or w):
        return "canto-ext-so"
    if n and w and not (s or e):
        return "canto-ext-se"
    if (n and s) or (w and e):
        return "calcada"  # calçada espremida entre duas ruas: o traçado não deveria gerar isto
    if s:
        return "guia-n"
    if n:
        return "guia-s"
    if e:
        return "guia-o"
    if w:
        return "guia-l"
    if is_road(road, x + 1, y + 1):
        return "canto-int-se"
    if is_road(road, x - 1, y + 1):
        return "canto-int-so"
    if is_road(road, x + 1, y - 1):
        return "canto-int-ne"
    if is_road(road, x - 1, y - 1):
        return "canto-int-no"
    return None


def street_kind(zones: dict[str, np.ndarray], x: int, y: int) -> str:
    x0, y0, x1, y1 = CROSSWALK
    if x0 <= x <= x1 and y0 <= y <= y1:
        return "faixa"
    if zones["rustic"][y, x]:
        roll = rng.random()
        return "rua-musgo" if roll < 0.12 else ("rua-terra" if roll < 0.16 else "rua-rustica")
    return "rua"


def plaza_kind(x: int, y: int) -> str:
    px0, py0, px1, py1 = PLAZA
    fx, fy = FOUNTAIN
    if x in (px0, px1) or y == py1:
        return "praca-borda"
    if 39 <= x <= 40 and y < fy - 4.5:
        return "praca-bronze"  # caminho do portal até o chafariz
    if (x in (35, 44) and 25 <= y <= 33) or (y in (25, 33) and 35 <= x <= 44):
        return "praca-moldura"  # anel em volta do chafariz
    if (x, y) in {(27, 27), (52, 27), (27, 32), (52, 32)}:
        return "praca-roseta"
    if (x, y) in {(30, 24), (49, 24), (30, 31), (49, 31)}:
        return "praca-circulo"
    return "praca"


def floor_layer(ids: dict[str, list[int]], zones: dict[str, np.ndarray]) -> list[int]:
    road = zones["road"]
    data = []
    for y in range(H):
        for x in range(W):
            if road[y, x]:
                kind = street_kind(zones, x, y)
            elif zones["plaza"][y, x]:
                kind = plaza_kind(x, y)
            elif (curb := curb_kind(road, x, y)) is not None:
                kind = curb
            elif zones["market"][y, x]:
                kind = "feira-laje" if rng.random() < 0.12 else "feira"
            elif zones["yard"][y, x]:
                kind = "forja"
            else:
                kind = "grama-flores" if rng.random() < 0.12 else "grama"
            data.append(1 + rng.choice(ids[kind]))
    return data


# ---------------------------------------------------------------- objetos

# Retângulo de colisão na base de cada objeto, em frações da imagem (x0, y0, x1, y1). None = não bloqueia.
# Prédios: só o térreo (o jogador passa atrás do telhado). Escadas e enfeites colados na frente ficam livres.
FOOTPRINT: dict[str, tuple[float, float, float, float] | None] = {
    "house": (0.08, 0.80, 0.92, 0.97),
    "landmark_guild": (0.10, 0.72, 0.90, 0.89),
    "landmark_inn_vault": (0.16, 0.78, 0.97, 0.93),
    "landmark_blacksmith": (0.03, 0.68, 0.97, 0.89),
    "portal": None,
    "barraca-vermelha": (0.05, 0.55, 0.95, 0.95),
    "barraca-ocre": (0.05, 0.55, 0.95, 0.95),
    "barraca-verde": (0.05, 0.55, 0.95, 0.95),
    "rack-armas": (0.05, 0.70, 0.95, 1.0),
    "caixotes-pilha": (0.05, 0.50, 0.95, 1.0),
    "carroca-cristais": (0.05, 0.45, 0.80, 0.95),
    "mesa-taverna-a": (0.05, 0.50, 0.95, 0.95),
    "mesa-taverna-b": (0.05, 0.50, 0.95, 0.95),
    "barris-a": (0.05, 0.40, 0.95, 1.0),
    "barris-b": (0.05, 0.40, 0.95, 1.0),
    "barril-coberto": (0.10, 0.50, 0.90, 1.0),
    "mochilas-a": None,
    "mochilas-b": None,
    "caixotes": (0.05, 0.40, 0.95, 1.0),
    "cestos": None,
    "chafariz": (0.05, 0.35, 0.95, 0.98),
    "arvore-verde": (0.15, 0.72, 0.85, 1.0),
    "arvore-outono": (0.15, 0.72, 0.85, 1.0),
    "cerca-a": (0.0, 0.55, 1.0, 1.0),
    "cerca-b": (0.0, 0.55, 1.0, 1.0),
    "cerca-vertical": (0.10, 0.10, 0.90, 1.0),
    "pilar": (0.10, 0.50, 0.90, 1.0),
    "banco-madeira": (0.05, 0.50, 0.95, 0.95),
    "banco-ferro": (0.05, 0.50, 0.95, 0.95),
    "placa-direcao": (0.30, 0.85, 0.70, 1.0),
    "poste": (0.35, 0.88, 0.65, 1.0),
    "poste-duplo": (0.35, 0.88, 0.65, 1.0),
    "braseiro-a": (0.15, 0.60, 0.85, 1.0),
    "braseiro-b": (0.15, 0.60, 0.85, 1.0),
}


class Objects:
    def __init__(self, firstgid: int):
        self.firstgid = firstgid
        self.tiles: list[dict] = []
        self.by_image: dict[str, int] = {}
        self.placed: list[dict] = []

    def tile_for(self, image_path: str, kind: str) -> int:
        if image_path in self.by_image:
            return self.by_image[image_path]
        with Image.open(CITY / image_path) as image:
            w, h = image.size
        tile_: dict = {"id": len(self.tiles), "image": f"../tilesets/city/{image_path}", "imagewidth": w, "imageheight": h}
        footprint = FOOTPRINT[kind]
        tile_["properties"] = [{"name": "solid", "type": "bool", "value": footprint is not None}]
        if footprint is not None:
            x0, y0, x1, y1 = footprint
            rect = {"id": 1, "name": "", "type": "", "rotation": 0, "visible": True,
                    "x": round(x0 * w), "y": round(y0 * h), "width": round((x1 - x0) * w), "height": round((y1 - y0) * h)}
            tile_["objectgroup"] = {"draworder": "index", "name": "", "type": "objectgroup", "opacity": 1, "visible": True,
                                    "x": 0, "y": 0, "objects": [rect]}
        self.tiles.append(tile_)
        self.by_image[image_path] = tile_["id"]
        return tile_["id"]

    def place(self, image_path: str, kind: str, cx: float, bottom: float, name: str) -> dict:
        """Põe o objeto com o meio da base em (cx, bottom), em pixels do mundo."""
        local = self.tile_for(image_path, kind)
        info = self.tiles[local]
        obj = {"id": 0, "gid": self.firstgid + local, "name": name, "type": "", "rotation": 0, "visible": True,
               "x": round(cx - info["imagewidth"] / 2), "y": round(bottom),
               "width": info["imagewidth"], "height": info["imageheight"]}
        self.placed.append(obj)
        return obj

    def prop(self, name: str, cx: float, bottom: float) -> dict:
        return self.place(f"props/{name}.png", name, cx * T, bottom * T, name)

    def house(self, n: int, cx: float, bottom: float) -> dict:
        return self.place(f"houses/house_{n:02d}.png", "house", cx * T, bottom * T, f"house_{n:02d}")

    def landmark(self, name: str, cx: float, bottom: float) -> dict:
        return self.place(f"landmarks/{name}.png", name, cx * T, bottom * T, name)

    def tileset(self) -> dict:
        return {"firstgid": self.firstgid, "name": "city/objects", "tilecount": len(self.tiles), "columns": 0,
                "tilewidth": max(t["imagewidth"] for t in self.tiles), "tileheight": max(t["imageheight"] for t in self.tiles),
                "margin": 0, "spacing": 0, "grid": {"orientation": "orthogonal", "width": 1, "height": 1}, "tiles": self.tiles}


def place_buildings(objects: Objects) -> None:
    """Meio da base (coluna, em tiles) de cada prédio. Larguras em process_city.py (casas ~7-10 tiles)."""
    for n, cx in ((2, 5.0), (6, 14.4), (5, 63.0), (12, 73.0)):
        objects.house(n, cx, NORTH_BASE)
    objects.landmark("landmark_guild", 29.0, NORTH_BASE)
    objects.landmark("landmark_inn_vault", 50.0, NORTH_BASE)
    objects.landmark("landmark_blacksmith", 66.0, MIDDLE_BASE)
    objects.house(7, 75.9, MIDDLE_BASE)
    for n, cx in ((1, 4.9), (3, 14.9), (8, 25.2), (10, 33.6), (4, 48.5), (9, 60.5), (11, 72.0)):
        objects.house(n, cx, SOUTH_BASE)


def place_portal_avenue(objects: Objects) -> None:
    """Portal no alto da alameda, entre braseiros; postes com flâmulas dos dois lados até a praça."""
    objects.place("portal.png", "portal", 40 * T, 9 * T, "portal")
    objects.prop("braseiro-a", 37.6, 9.2)
    objects.prop("braseiro-b", 42.4, 9.2)
    for y in (13.0, 17.5):
        objects.prop("poste-duplo", 37.9, y)
        objects.prop("poste-duplo", 42.1, y)


def place_plaza(objects: Objects) -> None:
    fx, fy = FOUNTAIN
    objects.prop("chafariz", fx, fy)
    # Árvores nos cantos de cima; bancos virados para o chafariz; postes nos cantos.
    objects.prop("arvore-verde", 24.0, 26.0)
    objects.prop("arvore-outono", 55.5, 26.5)
    objects.prop("arvore-outono", 24.0, 35.5)
    for cx, y, name in ((34.0, 29.5, "banco-ferro"), (46.0, 29.5, "banco-ferro"), (36.0, 35.0, "banco-madeira"), (44.0, 35.0, "banco-madeira")):
        objects.prop(name, cx, y)
    for cx, y, name in ((22.6, 22.2, "poste-duplo"), (57.4, 22.2, "poste-duplo"), (32.0, 33.6, "poste"), (48.0, 33.6, "poste")):
        objects.prop(name, cx, y)
    # Frente da Guilda: espaço livre na escadaria, braseiros dos lados e a placa de direções perto da alameda.
    objects.prop("braseiro-a", 25.6, 21.4)
    objects.prop("braseiro-b", 32.4, 21.4)
    objects.prop("placa-direcao", 35.6, 22.6)
    # Frente da Estalagem: mesas da taverna, barris e caixas.
    objects.prop("mesa-taverna-a", 47.0, 23.8)
    objects.prop("mesa-taverna-b", 53.0, 23.8)
    objects.prop("barris-a", 57.0, 24.4)
    objects.prop("barril-coberto", 44.4, 21.6)
    objects.prop("caixotes", 44.3, 24.2)
    # Perto da Forja (canto de baixo-direita da praça): rack de armas, carroça de minério e caixotes.
    objects.prop("rack-armas", 56.6, 35.6)
    objects.prop("carroca-cristais", 55.6, 31.8)
    objects.prop("caixotes-pilha", 58.4, 28.4)


def place_market(objects: Objects) -> None:
    """Feira de rua a oeste da praça: barracas numa fileira, carroça, cestos, sacos e mochilas na de baixo."""
    for cx, name in ((3.5, "barraca-vermelha"), (8.5, "barraca-ocre"), (13.5, "barraca-verde")):
        objects.prop(name, cx, 28.4)
    objects.prop("cestos", 17.6, 28.0)
    for cx, name in ((4.2, "carroca-cristais"), (8.4, "mochilas-a"), (10.6, "mochilas-b"), (13.9, "barris-b"), (17.4, "caixotes")):
        objects.prop(name, cx, 34.6)
    objects.prop("barril-coberto", 19.4, 33.2)


def place_streets(objects: Objects) -> None:
    """Postes ao longo da Rua Principal, cercas no parque do norte e na beira sul, árvores e bancos no parque."""
    for cx in (10.0, 30.5, 49.5, 70.0):
        objects.prop("poste", cx, 36.95)
    for cx in (19.0, 60.0):
        objects.prop("poste", cx, 41.95)
    for cx in (3.0, 9.5, 16.0):
        objects.prop("arvore-verde" if cx != 9.5 else "arvore-outono", cx, 10.4)
    for cx in (61.0, 67.0, 74.5):
        objects.prop("arvore-outono" if cx == 67.0 else "arvore-verde", cx, 9.8)
    for cx in (7.0, 71.0):
        objects.prop("banco-madeira", cx, 4.6)
    # Cercas: uma fileira no alto do parque e outra na beira sul, com pilares entre os trechos.
    fence = 114 / T
    for row in (2.6, 59.95):
        x = 0.2
        i = 0
        while x + fence <= W - 0.2:
            objects.prop("cerca-a" if i % 2 == 0 else "cerca-b", x + fence / 2, row)
            x += fence
            i += 1


# ---------------------------------------------------------------- luzes

# Que luz sai de cada tipo de objeto (as manchas quentes da arte viram pontos). Os que não estão aqui não têm luz
# (a barraca ocre e a árvore de outono "acendem" pela regra das manchas, mas não são luz).
WINDOW_LIGHTS = ("house_", "landmark_guild", "landmark_inn_vault")


def city_lights(objects: Objects) -> list[tuple[str, float, float]]:
    lights = []
    for obj in objects.placed:
        image = MAP_OUT.parent / objects.tiles[obj["gid"] - objects.firstgid]["image"]
        top = obj["y"] - obj["height"]
        name = obj["name"]
        spots = warm_spots(image) if name != "portal" else []
        if name.startswith(WINDOW_LIGHTS):
            lights += [("janela", obj["x"] + sx, top + sy) for sx, sy, _ in spots]
        elif name == "landmark_blacksmith":
            # A maior mancha é a fornalha; o resto, janelas e brasas.
            biggest = max(spots, key=lambda s: s[2])
            lights += [("forja" if s is biggest else "janela", obj["x"] + s[0], top + s[1]) for s in spots]
        elif name.startswith("poste"):
            lights += [("poste", obj["x"] + sx, top + sy) for sx, sy, _ in spots]
        elif name.startswith("braseiro"):
            lights.append(("braseiro", obj["x"] + obj["width"] / 2, top + obj["height"] * 0.35))
        elif name.startswith("mesa-taverna"):
            lights += [("vela", obj["x"] + sx, top + sy) for sx, sy, _ in spots]
        elif name == "portal":
            lights.append(("portal", obj["x"] + obj["width"] / 2, obj["y"] - obj["height"] * 0.45))
    return lights


# ---------------------------------------------------------------- montagem


def point_layer(layer_id: int, name: str, points: list[tuple[float, float]], next_id: list[int]) -> dict:
    objs = []
    for x, y in points:
        objs.append({"id": next_id[0], "name": "", "type": "", "point": True, "rotation": 0, "visible": True,
                     "width": 0, "height": 0, "x": x, "y": y})
        next_id[0] += 1
    return {"id": layer_id, "name": name, "type": "objectgroup", "draworder": "topdown", "opacity": 1,
            "visible": True, "x": 0, "y": 0, "objects": objs}


SPAWNS = [(36.5, 32.5), (43.5, 32.5), (40.0, 33.5), (40.0, 23.5)]
PORTAL_POINT = (40.0, 8.5)


def main() -> None:
    ids = build_floor_tileset()
    count = ids.pop("_count")[0]
    zones = layout()
    floor = floor_layer(ids, zones)
    objects = Objects(firstgid=1 + count)
    place_buildings(objects)
    place_portal_avenue(objects)
    place_plaza(objects)
    place_market(objects)
    place_streets(objects)

    next_id = [1]
    placed = sorted(objects.placed, key=lambda o: o["y"])
    for obj in placed:
        obj["id"] = next_id[0]
        next_id[0] += 1
    sheet = Image.open(CITY / "floor.png")
    floor_ts = {"firstgid": 1, "name": "city/floor", "image": "../tilesets/city/floor.png",
                "imagewidth": sheet.width, "imageheight": sheet.height,
                "tilewidth": T, "tileheight": T, "tilecount": count, "columns": 8, "margin": 0, "spacing": 0}
    lights = city_lights(objects)
    layers = [
        {"id": 1, "name": "chao", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
         "opacity": 1, "visible": True, "data": floor},
        {"id": 2, "name": "objetos", "type": "objectgroup", "draworder": "topdown", "opacity": 1,
         "visible": True, "x": 0, "y": 0, "objects": placed},
        point_layer(3, "spawns", [(x * T, y * T) for x, y in SPAWNS], next_id),
        point_layer(4, "portal", [(PORTAL_POINT[0] * T, PORTAL_POINT[1] * T)], next_id),
        light_layer(5, lights, next_id),
    ]
    city = {"compressionlevel": -1, "width": W, "height": H, "tilewidth": T, "tileheight": T, "infinite": False,
            "orientation": "orthogonal", "renderorder": "right-down", "type": "map", "version": "1.10",
            "tiledversion": "1.12.2", "nextlayerid": 6, "nextobjectid": next_id[0], "layers": layers,
            "tilesets": [floor_ts, objects.tileset()]}
    MAP_OUT.write_text(json.dumps(city) + "\n", encoding="utf-8")
    check(objects, zones["road"])
    kinds: dict[str, int] = {}
    for kind, _, _ in lights:
        kinds[kind] = kinds.get(kind, 0) + 1
    print(f"mapa {W}x{H}: {count} tiles de chão, {len(objects.tiles)} imagens de objeto, {len(placed)} objetos; luzes {kinds}")


# ---------------------------------------------------------------- conferência


def image_cells(obj: dict) -> tuple[int, int, int, int]:
    """Células cobertas pela imagem do objeto (x0, y0, x1, y1 inclusive)."""
    x0, x1 = obj["x"] / T, (obj["x"] + obj["width"]) / T
    y0, y1 = (obj["y"] - obj["height"]) / T, obj["y"] / T
    return int(x0), int(y0), int(np.ceil(x1)) - 1, int(np.ceil(y1)) - 1


def check(objects: Objects, road: np.ndarray) -> None:
    """Acusa prédios que se sobrepõem, prédio cobrindo rua, base sólida de enfeite em rua e objeto fora do mapa."""
    buildings = [o for o in objects.placed if o["name"].startswith(("house_", "landmark_"))]
    problems = []
    for i, a in enumerate(buildings):
        for b in buildings[i + 1 :]:
            if a["x"] < b["x"] + b["width"] and b["x"] < a["x"] + a["width"] and a["y"] - a["height"] < b["y"] and b["y"] - b["height"] < a["y"]:
                problems.append(f"{a['name']} sobrepõe {b['name']}")
    for o in buildings:
        x0, y0, x1, y1 = image_cells(o)
        if road[max(0, y0) : y1 + 1, max(0, x0) : x1 + 1].any():
            problems.append(f"{o['name']} cobre rua")
    for o in objects.placed:
        info = objects.tiles[o["gid"] - objects.firstgid]
        group = info.get("objectgroup")
        if group and not o["name"].startswith(("house_", "landmark_", "poste", "braseiro")):
            r = group["objects"][0]
            cx, cy = (o["x"] + r["x"] + r["width"] / 2) / T, (o["y"] - o["height"] + r["y"] + r["height"] / 2) / T
            if road[min(H - 1, int(cy)), min(W - 1, int(cx))]:
                problems.append(f"{o['name']} em ({cx:.1f},{cy:.1f}) bloqueia rua")
        if o["x"] < 0 or o["x"] + o["width"] > W * T or o["y"] > H * T or o["y"] - o["height"] < 0:
            problems.append(f"{o['name']} sai do mapa em ({o['x']},{o['y']})")
    print("problemas: " + ("; ".join(problems) if problems else "nenhum"))


if __name__ == "__main__":
    main()
