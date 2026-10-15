"""Monta assets/maps/city.json com a arte processada em assets/tilesets/city/ (rodar process_city.py antes).

- Chão: um tileset de 32x32 (city/floor.png) montado aqui a partir dos blocos, com as guias (meio-fio)
  em todas as direções e os cantos gerados por espelhamento.
- Casas, enfeites e portal: objetos de uma coleção de imagens (cada um a sua imagem). A colisão de cada um
  é um retângulo na base, desenhado no tile (o jeito do Tiled); o servidor transforma em células de parede.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_city.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CITY = ROOT / "assets" / "tilesets" / "city"
WORK = ROOT / "tools" / "assets" / "build"  # blocos de chão recortados pelo process_city.py
MAP_OUT = ROOT / "assets" / "maps" / "city.json"
W, H, T = 80, 60, 32
rng = random.Random(7)

# ---------------------------------------------------------------- chão


def block(name: str) -> Image.Image:
    return Image.open(WORK / "floor" / f"floor-{name}.png").convert("RGBA")


def flip_h(image: Image.Image) -> Image.Image:
    return image.transpose(Image.FLIP_LEFT_RIGHT)


def flip_v(image: Image.Image) -> Image.Image:
    return image.transpose(Image.FLIP_TOP_BOTTOM)


def outer_corner() -> Image.Image:
    """Canto de quarteirão: calçada só no quadrante de cima-esquerda, rua à direita e embaixo.
    A arte não tem esta peça: monta com a guia horizontal (2-0), a vertical (2-3) e o paralelepípedo (0-0).
    Na guia horizontal a calçada ocupa as linhas 0-17; na vertical, as colunas 0-16."""
    horizontal = np.asarray(block("2-0"))
    vertical = np.asarray(block("2-3"))
    out = np.asarray(block("0-0")).copy()
    out[0:18, 0:17] = horizontal[0:18, 0:17]
    out[0:14, 13:17] = vertical[0:14, 13:17]
    return Image.fromarray(out)


def floor_kinds() -> dict[str, list[Image.Image]]:
    corner = outer_corner()
    inner = block("2-5")
    horizontal = [block(n) for n in ("2-0", "2-1", "2-2")]
    vertical = [block(n) for n in ("2-3", "2-4")]
    return {
        "rua": [block(n) for n in ("0-0", "0-1", "0-2")],
        "rua-musgo": [block("0-3")],
        "rua-quebrada": [block("1-4")],
        "rua-terra": [block(n) for n in ("3-3", "3-4", "3-5")],
        "poca": [block("3-6")],
        "bueiro": [block(n) for n in ("3-0", "3-1")],
        "grelha": [block("3-2")],
        "laje": [block(n) for n in ("1-0", "1-1", "1-2")],
        "laje-musgo": [block("1-3")],
        "lama": [block(n) for n in ("1-5", "1-6")],
        "terra": [block(n) for n in ("4-0", "4-1", "4-2")],
        "grama": [block(n) for n in ("4-3", "4-4", "4-5", "4-6")],
        # Guia: o nome diz de que lado está a calçada (n = calçada em cima, rua embaixo).
        "guia-n": horizontal,
        "guia-s": [flip_v(i) for i in horizontal],
        "guia-o": vertical,
        "guia-l": [flip_h(i) for i in vertical],
        # Canto externo (esquina do quarteirão): o nome diz em que canto do tile fica a calçada.
        "canto-ext-no": [corner],
        "canto-ext-ne": [flip_h(corner)],
        "canto-ext-so": [flip_v(corner)],
        "canto-ext-se": [flip_h(flip_v(corner))],
        # Canto interno: a rua ocupa só um quadrante (o do nome).
        "canto-int-se": [inner],
        "canto-int-so": [flip_h(inner)],
        "canto-int-ne": [flip_v(inner)],
        "canto-int-no": [flip_h(flip_v(inner))],
    }


# Tipos de chão "lisos" (textura sem forma grande): dá para tirar a vinheta e igualar as variantes.
# Guias, cantos, bueiro, grelha e poça ficam como estão: a forma grande deles é de propósito.
FLATTEN = {"rua", "rua-musgo", "rua-quebrada", "rua-terra", "laje", "laje-musgo", "lama", "terra", "grama"}


def flatten(image: Image.Image) -> np.ndarray:
    """Tira a variação de brilho de baixa frequência (borda mais escura que o meio) mantendo o detalhe:
    divide pela versão borrada (4x4 ampliada) e multiplica pela média."""
    rgb = np.asarray(image.convert("RGB")).astype(float)
    low = np.asarray(image.convert("RGB").resize((4, 4), Image.BOX).resize((T, T), Image.BILINEAR)).astype(float)
    return rgb / np.maximum(low, 1) * rgb.mean(axis=(0, 1))


def even_out(variants: list[Image.Image]) -> list[Image.Image]:
    """Vinheta fora e todas as variantes com a mesma cor média: sem xadrez ao misturar no chão."""
    flat = [flatten(v) for v in variants]
    target = np.mean([f.mean(axis=(0, 1)) for f in flat], axis=0)
    return [Image.fromarray(np.clip(f / f.mean(axis=(0, 1)) * target, 0, 255).astype(np.uint8)).convert("RGBA") for f in flat]


def build_floor_tileset() -> dict[str, list[int]]:
    """Grava city/floor.png e devolve, para cada tipo de chão, os ids (locais) das variantes."""
    kinds = {name: even_out(variants) if name in FLATTEN else variants for name, variants in floor_kinds().items()}
    ids: dict[str, list[int]] = {}
    images: list[Image.Image] = []
    for name, variants in kinds.items():
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

# Ruas (retângulos de células, inclusive): avenida N-S, ruas N-S laterais, rua principal L-O e ruas L-O.
ROADS = [
    (37, 0, 42, 59),
    (13, 0, 16, 59),
    (63, 0, 66, 59),
    (0, 28, 79, 33),
    (0, 9, 79, 12),
    (0, 49, 79, 52),
]
PLAZA = (29, 20, 50, 41)  # praça de lajes no centro; as ruas acabam na borda dela
SIDEWALK = 2  # largura da calçada em volta das ruas


def layout_masks() -> tuple[np.ndarray, np.ndarray]:
    road = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in ROADS:
        road[y0 : y1 + 1, x0 : x1 + 1] = True
    plaza = np.zeros((H, W), bool)
    x0, y0, x1, y1 = PLAZA
    plaza[y0 : y1 + 1, x0 : x1 + 1] = True
    road &= ~plaza
    return road, plaza


def is_road(road: np.ndarray, x: int, y: int) -> bool:
    return 0 <= x < W and 0 <= y < H and bool(road[y, x])


def curb_kind(road: np.ndarray, x: int, y: int) -> str | None:
    """Tipo de guia de uma célula de calçada encostada na rua (ou None se não encosta)."""
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
        return "laje"  # calçada espremida entre duas ruas: o traçado não deveria gerar isto
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


def near_road(road: np.ndarray, x: int, y: int, distance: int) -> bool:
    y0, y1, x0, x1 = max(0, y - distance), min(H, y + distance + 1), max(0, x - distance), min(W, x + distance + 1)
    return bool(road[y0:y1, x0:x1].any())


def grass_noise() -> np.ndarray:
    """Manchas de grama nos terrenos: soma de círculos sorteados."""
    field = np.zeros((H, W))
    yy, xx = np.mgrid[0:H, 0:W]
    for _ in range(45):
        cx, cy, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(2, 6)
        field += np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, None)
    return field


def floor_layer(ids: dict[str, list[int]], road: np.ndarray, plaza: np.ndarray) -> list[int]:
    grass = grass_noise()
    data = []
    for y in range(H):
        for x in range(W):
            if road[y, x]:
                kind = "rua"
                roll = rng.random()
                if roll < 0.02:
                    kind = "bueiro"
                elif roll < 0.05:
                    kind = rng.choice(["rua-terra", "rua-musgo", "rua-quebrada", "poca"])
                elif roll < 0.07 and (not is_road(road, x, y - 1) or not is_road(road, x, y + 1)):
                    kind = "grelha"  # escoamento junto à guia
            elif (curb := curb_kind(road, x, y)) is not None:
                kind = curb
            elif plaza[y, x] or near_road(road, x, y, SIDEWALK):
                kind = "laje-musgo" if rng.random() < 0.06 else "laje"
            elif y < 7:
                kind = "grama"  # faixa de parque ao norte
            else:
                kind = "grama" if grass[y, x] > 0.6 else ("lama" if rng.random() < 0.04 else "terra")
            data.append(1 + rng.choice(ids[kind]))
    return data


# ---------------------------------------------------------------- objetos

# Retângulo de colisão na base de cada objeto, em frações da imagem (x0, y0, x1, y1). None = não bloqueia.
FOOTPRINT: dict[str, tuple[float, float, float, float] | None] = {
    "casa": (0.18, 0.72, 0.82, 0.97),
    "poste": (0.3, 0.9, 0.7, 1.0),
    "poste-duplo": (0.3, 0.9, 0.7, 1.0),
    "banco-a": (0.1, 0.45, 0.9, 0.95),
    "banco-b": (0.1, 0.45, 0.9, 0.95),
    "quadro-avisos": (0.1, 0.85, 0.9, 1.0),
    "placa-direcao": (0.35, 0.88, 0.65, 1.0),
    "chafariz": (0.05, 0.4, 0.95, 1.0),
    "correntes": (0.0, 0.55, 1.0, 1.0),
    "grade": (0.0, 0.5, 1.0, 1.0),
    "barris": (0.05, 0.3, 0.95, 1.0),
    "caixas": (0.05, 0.3, 0.95, 1.0),
    "carrinho": (0.1, 0.45, 0.9, 0.95),
    "barraca": (0.05, 0.55, 0.95, 1.0),
    "canteiro": (0.05, 0.4, 0.95, 1.0),
    "arvore": (0.05, 0.6, 0.95, 1.0),
    "portal": None,
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
        tile: dict = {"id": len(self.tiles), "image": f"../tilesets/city/{image_path}", "imagewidth": w, "imageheight": h}
        footprint = FOOTPRINT[kind]
        tile["properties"] = [{"name": "solid", "type": "bool", "value": footprint is not None}]
        if footprint is not None:
            x0, y0, x1, y1 = footprint
            rect = {"id": 1, "name": "", "type": "", "rotation": 0, "visible": True,
                    "x": round(x0 * w), "y": round(y0 * h), "width": round((x1 - x0) * w), "height": round((y1 - y0) * h)}
            tile["objectgroup"] = {"draworder": "index", "name": "", "type": "objectgroup", "opacity": 1, "visible": True,
                                   "x": 0, "y": 0, "objects": [rect]}
        self.tiles.append(tile)
        self.by_image[image_path] = tile["id"]
        return tile["id"]

    def place(self, image_path: str, kind: str, cx: float, bottom: float, name: str = "") -> dict:
        """Põe o objeto com o meio da base em (cx, bottom), em pixels do mundo."""
        local = self.tile_for(image_path, kind)
        tile = self.tiles[local]
        obj = {"id": 0, "gid": self.firstgid + local, "name": name or kind, "type": "", "rotation": 0, "visible": True,
               "x": round(cx - tile["imagewidth"] / 2), "y": round(bottom),
               "width": tile["imagewidth"], "height": tile["imageheight"]}
        self.placed.append(obj)
        return obj

    def prop(self, name: str, cx_tiles: float, bottom_tiles: float) -> dict:
        return self.place(f"props/{name}.png", name, cx_tiles * T, bottom_tiles * T)

    def tileset(self) -> dict:
        return {"firstgid": self.firstgid, "name": "city/objects", "tilecount": len(self.tiles), "columns": 0,
                "tilewidth": max(t["imagewidth"] for t in self.tiles), "tileheight": max(t["imageheight"] for t in self.tiles),
                "margin": 0, "spacing": 0, "grid": {"orientation": "orthogonal", "width": 1, "height": 1}, "tiles": self.tiles}


def place_city(objects: Objects) -> None:
    # Casas: meio da base (coluna) e linha onde a base encosta na calçada. Ver ROADS para os quarteirões.
    houses = [
        (5.5, 26), (24, 26), (56, 26), (74.5, 26),  # norte da rua principal, de frente para ela
        (5.5, 47), (24, 47), (56, 47), (74.5, 47),  # sul da rua principal, de frente para a rua sul
        (27, 60), (53, 60),  # faixa do sul
    ]
    order = list(range(1, 11))
    rng.shuffle(order)
    for (cx, bottom), n in zip(houses, order):
        objects.place(f"houses/casa-{n}.png", "casa", cx * T, bottom * T, name=f"casa-{n}")

    # Praça: chafariz no centro, portal na borda norte entre correntes, bancos, postes nos cantos.
    objects.prop("chafariz", 40, 33.2)
    objects.place("portal.png", "portal", 40 * T, 23.5 * T, name="portal")
    objects.prop("correntes", 37.2, 23.6)
    objects.prop("correntes", 42.8, 23.6)
    for cx, bottom, name in ((35.3, 31, "banco-a"), (44.7, 31, "banco-b"), (35.3, 36, "banco-b"), (44.7, 36, "banco-a")):
        objects.prop(name, cx, bottom)
    for cx, bottom in ((30, 22), (50, 22), (30, 41.5), (50, 41.5)):
        objects.prop("poste-duplo", cx, bottom)
    for cx, bottom in ((32, 26), (48, 26), (32, 39), (48, 39)):
        objects.prop("arvore", cx, bottom)
    objects.prop("quadro-avisos", 33.5, 22.5)
    # Canto de mercado no sudoeste da praça.
    objects.prop("barraca", 31.5, 37)
    objects.prop("caixas", 30.2, 38.3)
    objects.prop("barris", 33.4, 38.6)

    # Postes ao longo das calçadas internas (avenida e rua principal), longe das casas.
    for row in (3, 16, 45, 57):
        objects.prop("poste", 35.5, row)
        objects.prop("poste", 44.5, row)
    for col in (3, 21, 59, 77):
        objects.prop("poste", col + 0.5, 27)
        objects.prop("poste", col + 0.5, 35)
    objects.prop("placa-direcao", 35.5, 8.6)
    objects.prop("placa-direcao", 44.5, 49)

    # Parque ao norte (faixa de grama acima da rua norte): árvores, canteiros, grades e bancos.
    for cx in (3, 9, 21, 31, 49, 59, 71, 77):
        objects.prop("arvore", cx, 4.5)
    for cx in (6, 26, 54, 74):
        objects.prop("canteiro", cx, 6.3)
    for cx in (24, 56):
        objects.prop("banco-a" if cx < 40 else "banco-b", cx, 4)
    for cx in (17.6, 61.3):
        objects.prop("grade", cx, 6.4)

    # Vida nas laterais das casas: barris, caixas, carrinhos.
    for cx, bottom, name in (
        (10.5, 25.5, "barris"), (19.5, 24.5, "caixas"), (60.5, 24.5, "carrinho"), (69.6, 25.5, "barris"),
        (10.5, 46.5, "carrinho"), (19.5, 45.5, "barris"), (60.5, 45.5, "caixas"), (69.6, 46.5, "caixas"),
        (20.5, 58.5, "barris"), (59.5, 58.5, "carrinho"),
    ):
        objects.prop(name, cx, bottom)


# ---------------------------------------------------------------- montagem


def point_layer(layer_id: int, name: str, points: list[tuple[float, float]], next_id: list[int]) -> dict:
    objs = []
    for x, y in points:
        objs.append({"id": next_id[0], "name": "", "type": "", "point": True, "rotation": 0, "visible": True,
                     "width": 0, "height": 0, "x": x, "y": y})
        next_id[0] += 1
    return {"id": layer_id, "name": name, "type": "objectgroup", "draworder": "topdown", "opacity": 1,
            "visible": True, "x": 0, "y": 0, "objects": objs}


def main() -> None:
    ids = build_floor_tileset()
    count = ids.pop("_count")[0]
    road, plaza = layout_masks()
    floor = floor_layer(ids, road, plaza)
    objects = Objects(firstgid=1 + count)
    place_city(objects)

    next_id = [1]
    placed = sorted(objects.placed, key=lambda o: o["y"])
    for obj in placed:
        obj["id"] = next_id[0]
        next_id[0] += 1
    floor_ts = {"firstgid": 1, "name": "city/floor", "image": "../tilesets/city/floor.png",
                "imagewidth": Image.open(CITY / "floor.png").width, "imageheight": Image.open(CITY / "floor.png").height,
                "tilewidth": T, "tileheight": T, "tilecount": count, "columns": 8, "margin": 0, "spacing": 0}
    layers = [
        {"id": 1, "name": "chao", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0,
         "opacity": 1, "visible": True, "data": floor},
        {"id": 2, "name": "objetos", "type": "objectgroup", "draworder": "topdown", "opacity": 1,
         "visible": True, "x": 0, "y": 0, "objects": placed},
        point_layer(3, "spawns", [(37 * T, 34 * T), (43 * T, 34 * T), (40 * T, 37 * T), (40 * T, 27 * T)], next_id),
        point_layer(4, "portal", [(40 * T, 23 * T)], next_id),
    ]
    city = {"compressionlevel": -1, "width": W, "height": H, "tilewidth": T, "tileheight": T, "infinite": False,
            "orientation": "orthogonal", "renderorder": "right-down", "type": "map", "version": "1.10",
            "tiledversion": "1.12.2", "nextlayerid": 5, "nextobjectid": next_id[0], "layers": layers,
            "tilesets": [floor_ts, objects.tileset()]}
    MAP_OUT.write_text(json.dumps(city) + "\n", encoding="utf-8")
    check_overlaps(objects)
    print(f"mapa {W}x{H}: {count} tiles de chão, {len(objects.tiles)} imagens de objeto, {len(placed)} objetos")


def check_overlaps(objects: Objects) -> None:
    """Acusa casas sobrepostas (imagem com imagem) e qualquer objeto fora do mapa."""
    houses = [o for o in objects.placed if o["name"].startswith("casa")]
    problems = []
    for i, a in enumerate(houses):
        for b in houses[i + 1 :]:
            if a["x"] < b["x"] + b["width"] and b["x"] < a["x"] + a["width"] and a["y"] - a["height"] < b["y"] and b["y"] - b["height"] < a["y"]:
                problems.append(f"{a['name']} sobrepõe {b['name']}")
    for o in objects.placed:
        if o["x"] < 0 or o["x"] + o["width"] > W * T or o["y"] > H * T:
            problems.append(f"{o['name']} sai do mapa em ({o['x']},{o['y']})")
    print("problemas: " + ("; ".join(problems) if problems else "nenhum"))


if __name__ == "__main__":
    main()
