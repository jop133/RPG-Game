"""Processa a arte do 1º andar do labirinto (Caverna de Cristal): tira o fundo, recorta e reduz.

Entrada: assets/tilesets/labirinto/ (fora do git)
           chao_labirinto.png      4x4 blocos de chão de caverna (pedra, terra, musgo, cristal)
           enfeites_labirinto.png  objetos da caverna (PROPS)
           Kit de Acampamentos.png, Kit de Covis.png   objetos das 4 regiões (CAMP, LAIRS)
           Kit de Marcos de Navegação e Ruínas do Labirinto.png   12 marcos, grade 4x3 (LANDMARKS)
           Kit de Pisos Variados do Labirinto.png      16 chãos temáticos, grade 4x4 (NEW_FLOORS)
Saída:   assets/tilesets/labyrinth/props/<nome>.png   cada objeto, sem fundo, recortado e reduzido
         tools/assets/build/labyrinth-floor/floor-L-C.png e <tipo>-C.png   blocos de chão, 32x32 (o build_labyrinth.py lê daqui)
         tools/assets/build/contato-labirinto-*.png          folhas de conferência

Usa as mesmas funções do process_city.py (fundo quadriculado "falso", buracos presos na arte, redução por área).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_labyrinth.py
"""

from __future__ import annotations

import math
import sys
import time
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_city import (  # noqa: E402
    TILE,
    background_mask,
    components,
    enclosed_holes,
    contact_sheet,
    load_rgba,
    reading_order,
    remove_background,
    resize,
    scaled,
    trim,
)

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "tilesets" / "labirinto"
OUT = ROOT / "assets" / "tilesets" / "labyrinth"
WORK = ROOT / "tools" / "assets" / "build"
FLOOR_INSET = 0.10  # cada bloco tem borda escura arredondada: corta 10% de cada lado
GROUP_KERNEL = 13  # dilatação da máscara: junta partes soltas do mesmo objeto (espada do esqueleto, chama da tocha)

# Cada objeto da folha: centro aproximado na imagem original (2752x1536) e escala para o jogo.
# Escala: o personagem tem ~60 px de altura; paredões ~6-7 tiles, cristal grande ~3,5 tiles, tocha ~2 tiles.
PROPS = {
    "rocha-alta": ((323, 468), 0.25),
    "cristal-pequeno": ((716, 502), 0.20),
    "pilar": ((1032, 399), 0.25),
    "cristal-medio": ((1390, 454), 0.20),
    "estalagmite-alta": ((1727, 344), 0.20),
    "estalagmites": ((1982, 427), 0.20),
    "paredao": ((2429, 385), 0.25),
    "cristal-grande": ((337, 1197), 0.20),
    "esqueleto": ((991, 949), 0.18),
    "barricada": ((1720, 908), 0.20),
    "tocha": ((2119, 867), 0.17),
    "rocha-minerio": ((2456, 963), 0.20),
    "ossada": ((1156, 1307), 0.18),
    "cogumelos-a": ((1954, 1342), 0.18),
    "cogumelos-b": ((2463, 1335), 0.18),
}


def grouped_mask(rgba: np.ndarray) -> np.ndarray:
    """Máscara dilatada: partes a até ~GROUP_KERNEL px uma da outra viram um objeto só."""
    mask = Image.fromarray(((rgba[:, :, 3] > 8) * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(GROUP_KERNEL))
    return np.asarray(mask) > 0


def object_pixels(grouped: np.ndarray, cx: int, cy: int, step: int = 4) -> np.ndarray:
    """Pixels do objeto que contém (cx, cy): preenche a partir dali dentro da máscara dilatada (numa grade
    `step` vezes menor, para ser rápido). Objetos vizinhos com caixas sobrepostas não entram."""
    h, w = grouped.shape
    coarse = grouped[: h // step * step, : w // step * step].reshape(h // step, step, w // step, step).any(axis=(1, 3))
    seen = np.zeros_like(coarse)
    start = (cy // step, cx // step)
    if not coarse[start]:
        raise SystemExit(f"o ponto ({cx},{cy}) não cai em nenhum objeto")
    seen[start] = True
    queue = deque([start])
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < coarse.shape[0] and 0 <= nx < coarse.shape[1] and coarse[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    full = np.zeros_like(grouped)
    full[: h // step * step, : w // step * step] = np.repeat(np.repeat(seen, step, axis=0), step, axis=1)
    return full & grouped


def match_props(boxes: list[tuple[int, int, int, int]]) -> dict[str, tuple[int, int, int, int]]:
    """Cada nome fica com a caixa que contém o seu centro aproximado. Erro se sobrar ou faltar caixa."""
    found: dict[str, tuple[int, int, int, int]] = {}
    for name, ((cx, cy), _) in PROPS.items():
        inside = [b for b in boxes if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]]
        if len(inside) != 1:
            raise SystemExit(f"{name}: {len(inside)} objetos no ponto ({cx},{cy}); esperava 1. Caixas: {boxes}")
        found[name] = inside[0]
    unused = [b for b in boxes if b not in found.values()]
    if unused or len(set(found.values())) != len(found):
        raise SystemExit(f"caixas sem nome ou repetidas: {unused}; achei {len(boxes)}, esperava {len(PROPS)}")
    return found


# ---------------------------------------------------------------- kits novos (labirinto 500x500)

KITS_KERNEL = 9  # dilatação dos kits: junta contorno e sombra de um objeto sem colar objetos vizinhos
ATTACH_PX = 140  # pedaço solto (cristal da vagoneta, gota, ossinho) a até isto de um objeto vai junto com ele
# "Buraco" claro preso na arte é brilho (não fundo) se a borda for clara E colorida: o verde dos ovos e da gosma.
HIGHLIGHT_RING_LUM = 110
HIGHLIGHT_RING_SAT = 50
# Cada objeto: centro aproximado na folha original (2752x1536) e escala para o jogo (personagem ~60 px de altura).
CAMP = {
    "tenda-grande": ((352, 308), 0.22),
    "tenda-aberta": ((930, 580), 0.22),
    "totem-cranio": ((842, 230), 0.24),
    "totem-runas": ((1084, 212), 0.24),
    "totem-lobo": ((1302, 252), 0.24),
    "caldeirao": ((1640, 266), 0.20),
    "barricada-estacas-a": ((1640, 616), 0.20),
    "barricada-estacas-b": ((2066, 616), 0.20),
    "jaula": ((2060, 238), 0.21),
    "rack-armas-a": ((2506, 222), 0.20),
    "rack-armas-b": ((2508, 580), 0.20),
    "arco-mina-a": ((342, 1004), 0.23),
    "arco-mina-b": ((928, 1006), 0.23),
    "trilho-horizontal": ((1466, 946), 0.20),
    "guindaste": ((1962, 1172), 0.21),
    "barris-mina-a": ((2482, 964), 0.20),
    "vagoneta-cristais": ((342, 1348), 0.20),
    "vagoneta-tombada": ((912, 1346), 0.20),
    "trilho-vertical": ((1442, 1310), 0.20),
    "barris-mina-b": ((2474, 1328), 0.20),
}
LAIRS = {
    "esqueleto-gigante": ((490, 380), 0.25),
    "ninho-a": ((1320, 188), 0.20),
    "ninho-b": ((1324, 576), 0.20),
    "ossos-mochila-a": ((1960, 194), 0.18),
    "ossos-mochila-b": ((1962, 574), 0.18),
    "rocha-garras-grande": ((2498, 212), 0.22),
    "rocha-garras-pequena": ((2514, 592), 0.20),
    "poca-borda": ((306, 978), 0.22),
    "poca-acida": ((342, 1340), 0.22),
    "ovos-a": ((898, 978), 0.18),
    "ovos-b": ((920, 1344), 0.18),
    "coluna-corroida-a": ((1418, 1158), 0.20),
    "coluna-corroida-b": ((1840, 1148), 0.20),
    "cogumelos-verdes": ((2184, 968), 0.18),
    "cogumelos-palidos": ((2550, 968), 0.18),
    "cogumelos-tortos": ((2182, 1342), 0.18),
    "cogumelos-musgo": ((2546, 1350), 0.18),
}
# Objetos de gosma e brilho: nenhum tem vão de verdade, e o reflexo branco pequeno (borda verde-esbranquiçada) passaria
# por buraco. Neles, buraco preso nunca é apagado.
GLOSSY = {"ovos-a", "ovos-b", "poca-acida", "poca-borda", "cogumelos-verdes", "cogumelos-palidos", "cogumelos-tortos",
          "cogumelos-musgo"}
# Marcos de navegação (grade 4x3 na folha, mas a fonte invade a coluna vizinha: recorte por objeto, como os
# kits). Pedras soltas dos pilares e as armas ao lado dos esqueletos vão junto (ATTACH_PX).
LANDMARKS = {
    "estatua-sem-cabeca": ((350, 300), 0.22),
    "obelisco-runico": ((930, 300), 0.22),
    "fonte-seca": ((1580, 300), 0.22),
    "altar": ((2340, 340), 0.22),
    "arco-ruina-a": ((370, 820), 0.24),
    "arco-ruina-b": ((1120, 820), 0.24),
    "pilar-caido": ((1780, 860), 0.22),
    "pilar-quebrado": ((2400, 800), 0.22),
    "muralha-desabada": ((380, 1300), 0.24),
    "entulho": ((1100, 1320), 0.22),
    "esqueleto-espada": ((1720, 1320), 0.20),
    "esqueleto-escudo": ((2380, 1300), 0.20),
}
# Pisos variados: grade 4x4. Linha 0 ruína (corredores construídos), 1 terra tribal (goblins e lobos),
# 2 mina (gnomos), 3 pedra musgosa com poças verdes (slimes).
NEW_FLOORS = ["ruina", "terra-tribal", "mina", "musgo-acido"]
NEW_FLOOR_INSET = 0.03


def hole_labels(holes: np.ndarray) -> list[np.ndarray]:
    """Pedaços conexos (4 direções) da máscara de buracos, como listas de índices (y, x)."""
    seen = np.zeros_like(holes)
    h, w = holes.shape
    parts = []
    for sy, sx in zip(*np.nonzero(holes)):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        pixels = [(sy, sx)]
        queue = deque(pixels)
        while queue:
            y, x = queue.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and holes[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    pixels.append((ny, nx))
                    queue.append((ny, nx))
        parts.append(np.array(pixels))
    return parts


def clean(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Fundo e buracos presos (como na cidade), sem apagar brilho. O quadriculado e o reflexo branco têm a mesma
    cor; o que separa é a borda (anel de 3 px em volta): o brilho de um ovo de slime é cercado de verde claro;
    um vão de verdade (grades da jaula, costelas, arcos, dormentes, racks) é cercado de madeira, osso ou pedra.
    Brilho = borda com luminância e saturação medianas acima de HIGHLIGHT_RING_LUM e HIGHLIGHT_RING_SAT."""
    background = background_mask(rgba)
    holes = enclosed_holes(rgba, background)
    rgb = rgba[:, :, :3].astype(float)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    h, w = holes.shape
    kept = np.zeros_like(holes)
    for part in hole_labels(holes):
        y0, x0 = np.maximum(part.min(axis=0) - 3, 0)
        y1, x1 = np.minimum(part.max(axis=0) + 4, (h, w))
        own = np.zeros((y1 - y0, x1 - x0), bool)
        own[part[:, 0] - y0, part[:, 1] - x0] = True
        ring = (np.asarray(Image.fromarray(own.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0) & ~own
        ring &= ~background[y0:y1, x0:x1] & ~holes[y0:y1, x0:x1]
        if not ring.any():
            continue
        shine = np.median(lum[y0:y1, x0:x1][ring]) > HIGHLIGHT_RING_LUM and np.median(sat[y0:y1, x0:x1][ring]) > HIGHLIGHT_RING_SAT
        if not shine:
            kept[part[:, 0], part[:, 1]] = True
    out = rgba.copy()
    out[background | kept, 3] = 0
    return out, kept


def coarse_labels(mask: np.ndarray, step: int = 4) -> tuple[np.ndarray, list[tuple[int, int, int, int, int]]]:
    """Rótulo de cada ilha da máscara numa grade `step` vezes menor, e (rótulo, x0, y0, x1, y1) em pixels."""
    h, w = mask.shape
    ch, cw = h // step, w // step
    coarse = mask[: ch * step, : cw * step].reshape(ch, step, cw, step).any(axis=(1, 3))
    label = np.zeros((ch, cw), int)
    boxes = []
    for sy, sx in zip(*np.nonzero(coarse)):
        if label[sy, sx]:
            continue
        n = len(boxes) + 1
        label[sy, sx] = n
        queue, ys, xs = deque([(sy, sx)]), [sy], [sx]
        while queue:
            y, x = queue.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < ch and 0 <= nx < cw and coarse[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = n
                    queue.append((ny, nx))
                    ys.append(ny)
                    xs.append(nx)
        boxes.append((n, min(xs) * step, min(ys) * step, (max(xs) + 1) * step, (max(ys) + 1) * step))
    return label, boxes


def box_gap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return math.hypot(dx, dy)


def kit_objects(art: np.ndarray, holes: np.ndarray, names: dict[str, tuple], label: str) -> dict[str, np.ndarray]:
    """Recorta os objetos de uma folha de kit. Cada ilha da máscara (dilatada em KITS_KERNEL) que contém o centro de
    um nome é um objeto; as ilhas pequenas que sobram (cristal solto, gota, ossinho) vão para o objeto mais perto,
    se estiver a até ATTACH_PX. Erro se um nome não achar ilha ou duas ilhas grandes sobrarem sem nome."""
    grown = np.asarray(Image.fromarray(((art[:, :, 3] > 8) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(KITS_KERNEL))) > 0
    step = 4
    labels, boxes = coarse_labels(grown, step)
    # A caixa, não o pixel: o centro de um arco ou de uma jaula cai no vão (vazado de verdade).
    # Um nome pode ter centros extras (3º campo): peças grandes do mesmo conjunto (mesa e banquinhos).
    owner: dict[int, str] = {}
    for name, spec in names.items():
        for k, (cx, cy) in enumerate([spec[0], *(spec[2] if len(spec) > 2 else [])]):
            around = [(n, (x1 - x0) * (y1 - y0)) for n, x0, y0, x1, y1 in boxes
                      if x0 <= cx < x1 and y0 <= cy < y1 and owner.get(n) != name]
            if not around and k > 0 and any(x0 <= cx < x1 and y0 <= cy < y1 for n, x0, y0, x1, y1 in boxes if owner.get(n) == name):
                continue  # a peça extra já veio junto com a principal
            if not around:
                raise SystemExit(f"{label}/{name}: nenhum objeto em volta do centro ({cx},{cy})")
            # Centro principal: a maior ilha em volta (o vão de um arco cai na caixa dele). Extra: a menor que
            # ainda não é deste nome (o banquinho, não a mesa de novo).
            n = (max if k == 0 else min)(around, key=lambda t: t[1])[0]
            if n in owner and owner[n] != name:
                raise SystemExit(f"{label}/{name}: o objeto do centro ({cx},{cy}) já é de {owner[n]}")
            owner[n] = name
    named = {n: (x0, y0, x1, y1) for n, x0, y0, x1, y1 in boxes if n in owner}
    for n, x0, y0, x1, y1 in boxes:
        if n in owner:
            continue
        area = (x1 - x0) * (y1 - y0)
        nearest, gap = min(((m, box_gap((x0, y0, x1, y1), box)) for m, box in named.items()), key=lambda t: t[1])
        if area >= 20000:
            raise SystemExit(f"{label}: objeto grande sem nome em ({x0},{y0})-({x1},{y1})")
        if gap <= ATTACH_PX:
            owner[n] = owner[nearest]
            print(f"  {label}: pedaço solto em ({x0},{y0}) vai com {owner[nearest]}")
        else:
            print(f"  {label}: pedaço solto em ({x0},{y0}) longe de tudo ({gap:.0f} px): descartado")
    full = np.repeat(np.repeat(labels, step, axis=0), step, axis=1)
    h, w = art.shape[:2]
    padded = np.zeros((h, w), int)
    padded[: full.shape[0], : full.shape[1]] = full
    found = {}
    for name in names:
        own = art.copy()
        if name in GLOSSY:
            own[holes, 3] = 255  # o "buraco" aqui era brilho
        mine = np.isin(padded, [n for n, o in owner.items() if o == name])
        own[~mine, 3] = 0
        found[name] = trim(own)
    return found


def process_kits(props: list) -> None:
    kits = (("Kit de Acampamentos.png", CAMP), ("Kit de Covis.png", LAIRS),
            ("Kit de Marcos de Navegação e Ruínas do Labirinto.png", LANDMARKS))
    for file, names in kits:
        art, holes = clean(load_rgba(SRC / file))
        for name, crop in kit_objects(art, holes, names, file).items():
            image = scaled(crop, names[name][1])
            image.save(OUT / "props" / f"{name}.png")
            props.append((f"{name} {image.width}x{image.height}", image))


def process_new_floors(tiles: list) -> None:
    floor = remove_background(load_rgba(SRC / "Kit de Pisos Variados do Labirinto.png"))
    rows = reading_order(components(floor[:, :, 3] > 8, min_area=20000))
    if [len(r) for r in rows] != [4, 4, 4, 4]:
        raise SystemExit(f"pisos variados: esperava 4x4 blocos, achei {[len(r) for r in rows]}")
    for r, (kind, row) in enumerate(zip(NEW_FLOORS, rows)):
        for c, (x0, y0, x1, y1) in enumerate(row):
            ix, iy = round((x1 - x0) * NEW_FLOOR_INSET), round((y1 - y0) * NEW_FLOOR_INSET)
            image = resize(floor[y0 + iy : y1 - iy, x0 + ix : x1 - ix], TILE, TILE)
            image.save(WORK / "labyrinth-floor" / f"{kind}-{c}.png")
            tiles.append((f"{kind}-{c}", image.resize((96, 96), Image.NEAREST)))


def main() -> None:
    (OUT / "props").mkdir(parents=True, exist_ok=True)
    (WORK / "labyrinth-floor").mkdir(parents=True, exist_ok=True)

    sheet = remove_background(load_rgba(SRC / "enfeites_labirinto.png"))
    grouped = grouped_mask(sheet)
    boxes = components(grouped, min_area=4000)
    print(f"enfeites: {len(boxes)} objetos depois da dilatação de {GROUP_KERNEL} px")
    match_props(boxes)  # confere que cada nome tem exatamente um objeto
    props = []
    for name, ((cx, cy), _) in PROPS.items():
        own = sheet.copy()
        own[~object_pixels(grouped, cx, cy), 3] = 0
        art = trim(own)
        image = scaled(art, PROPS[name][1])
        image.save(OUT / "props" / f"{name}.png")
        props.append((f"{name} {image.width}x{image.height}", image))
    started = time.perf_counter()
    process_kits(props)
    print(f"kits novos: {len(CAMP) + len(LAIRS) + len(LANDMARKS)} objetos em {time.perf_counter() - started:.1f} s")
    contact_sheet(props, WORK / "contato-labirinto-props.png", 160)

    floor = remove_background(load_rgba(SRC / "chao_labirinto.png"))
    rows = reading_order(components(floor[:, :, 3] > 8, min_area=20000))
    tiles = []
    for r, row in enumerate(rows):
        for c, (x0, y0, x1, y1) in enumerate(row):
            ix, iy = round((x1 - x0) * FLOOR_INSET), round((y1 - y0) * FLOOR_INSET)
            image = resize(floor[y0 + iy : y1 - iy, x0 + ix : x1 - ix], TILE, TILE)
            image.save(WORK / "labyrinth-floor" / f"floor-{r}-{c}.png")
            tiles.append((f"{r}-{c}", image.resize((96, 96), Image.NEAREST)))
    process_new_floors(tiles)
    contact_sheet(tiles, WORK / "contato-labirinto-chao.png", 110)
    print(f"chão: {len(tiles)} blocos em {len(rows)} linhas: {[len(r) for r in rows]}")


if __name__ == "__main__":
    main()
