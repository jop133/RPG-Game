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


def warm_spots(path: Path) -> list[tuple[float, float]]:
    """Centros das manchas de luz quente da imagem (janelas acesas, lanternas), em pixels da imagem.
    Pixel quente = claro, alaranjado e opaco; manchas a até ~4 px uma da outra contam como uma."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    warm = (a[..., 3] > 200) & (r > 160) & (g > 95) & (b < 110) & (r - b > 80) & (r + g > 270)
    grown = np.asarray(Image.fromarray((warm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    boxes = components(grown, min_area=1)
    return [((x0 + x1) / 2, (y0 + y1) / 2) for x0, y0, x1, y1 in boxes if warm[y0:y1, x0:x1].sum() >= 6]


def light_layer(layer_id: int, lights: list[tuple[str, float, float]], next_id: list[int]) -> dict:
    """Camada de pontos; cada luz é (tipo, x, y) em pixels do mundo."""
    objs = []
    for kind, x, y in lights:
        objs.append({"id": next_id[0], "name": kind, "type": "", "point": True, "rotation": 0, "visible": True,
                     "width": 0, "height": 0, "x": round(x, 1), "y": round(y, 1)})
        next_id[0] += 1
    return {"id": layer_id, "name": LAYER, "type": "objectgroup", "draworder": "topdown", "opacity": 1,
            "visible": True, "x": 0, "y": 0, "objects": objs}
