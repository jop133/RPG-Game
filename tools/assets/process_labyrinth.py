"""Processa a arte do 1º andar do labirinto (Caverna de Cristal): tira o fundo, recorta e reduz.

Entrada: assets/tilesets/labirinto/chao_labirinto.png (4x4 blocos de chão) e enfeites_labirinto.png (objetos).
Saída:   assets/tilesets/labyrinth/props/<nome>.png   cada objeto, sem fundo, recortado e reduzido
         tools/assets/build/labyrinth-floor/floor-L-C.png   cada bloco de chão, 32x32 (o build_labyrinth.py lê daqui)
         tools/assets/build/contato-labirinto-*.png          folhas de conferência

Usa as mesmas funções do process_city.py (fundo quadriculado "falso", buracos presos na arte, redução por área).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_labyrinth.py
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_city import (  # noqa: E402
    TILE,
    components,
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
    contact_sheet(tiles, WORK / "contato-labirinto-chao.png", 110)
    print(f"chão: {len(tiles)} blocos em {len(rows)} linhas: {[len(r) for r in rows]}")


if __name__ == "__main__":
    main()
