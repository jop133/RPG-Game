"""Camada "luzes" dos mapas: onde fica cada luz, com o tipo no nome do ponto.

O raio de cada tipo fica em shared/src/balance.ts (LIGHT_RADIUS): no labirinto ele decide o que os jogadores enxergam.
A cor e o jeito de piscar ficam no cliente (client/src/lighting.ts). Usado por build_city.py e build_labyrinth.py.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from process_city import components

LAYER = "luzes"


def warm_spots(path: Path) -> list[tuple[float, float, int]]:
    """Manchas de luz quente da imagem (janelas acesas, lanternas, fogo, velas): centro em pixels da imagem e
    tamanho (pixels quentes). Pixel quente = muito claro, amarelo-alaranjado e opaco (telhado laranja não conta);
    manchas a até ~4 px uma da outra contam como uma. Só faz sentido em peças que têm luz: barraca ocre e árvore de
    outono também "acendem" por esta regra, e por isso ficam de fora (ver build_city.py)."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    warm = (a[..., 3] > 200) & (r > 200) & (g > 140) & (b < 150) & (r - b > 90)
    grown = np.asarray(Image.fromarray((warm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    spots = []
    for x0, y0, x1, y1 in components(grown, min_area=1):
        size = int(warm[y0:y1, x0:x1].sum())
        if size >= 6:
            spots.append(((x0 + x1) / 2, (y0 + y1) / 2, size))
    return spots


def light_layer(layer_id: int, lights: list[tuple[str, float, float]], next_id: list[int]) -> dict:
    """Camada de pontos; cada luz é (tipo, x, y) em pixels do mundo."""
    objs = []
    for kind, x, y in lights:
        objs.append({"id": next_id[0], "name": kind, "type": "", "point": True, "rotation": 0, "visible": True,
                     "width": 0, "height": 0, "x": round(x, 1), "y": round(y, 1)})
        next_id[0] += 1
    return {"id": layer_id, "name": LAYER, "type": "objectgroup", "draworder": "topdown", "opacity": 1,
            "visible": True, "x": 0, "y": 0, "objects": objs}
