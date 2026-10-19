"""Sprites de armas desenhados em pixel art (o cliente gira a arma no golpe; ver client/src/juice.ts).

Saída: assets/weapons/<arma>.png, 48x48, fundo transparente, a arma na horizontal apontando para a DIREITA (ângulo 0):
cabo à esquerda (x 6..14, y 24) e ponta à direita (x 44, y 24). O cliente usa origem (0.15, 0.5), perto do cabo.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/weapons.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "weapons"
SIZE = 48
Y = 24  # linha do meio

OUTLINE = (24, 20, 26)
IRON_DARK = (70, 68, 78)
IRON = (112, 110, 122)
IRON_LIGHT = (172, 170, 184)
LEATHER_DARK = (72, 44, 26)
LEATHER = (112, 72, 42)
STEEL_DARK = (118, 124, 136)
STEEL = (168, 174, 186)
STEEL_EDGE = (222, 228, 236)


def espada_ferro() -> Image.Image:
    """Espada longa de ferro escuro: pomo de ferro, cabo de couro com voltas, guarda-mão de metal e lâmina de aço
    com fio claro em cima, sulco no meio e contorno escuro."""
    px = np.zeros((SIZE, SIZE, 4), np.uint8)

    def put(x: int, y: int, color: tuple[int, int, int]) -> None:
        px[y, x] = (*color, 255)

    # Pomo (x 5-6), redondo.
    for y in range(Y - 2, Y + 3):
        put(5, y, IRON_DARK if abs(y - Y) == 2 else IRON)
        put(6, y, IRON_LIGHT if y == Y - 1 else IRON)
    # Cabo de couro (x 7-12), com voltas mais escuras a cada 2 px.
    for x in range(7, 13):
        for y in range(Y - 1, Y + 2):
            put(x, y, LEATHER_DARK if x % 2 == 0 or y == Y + 1 else LEATHER)
    # Guarda-mão (x 13-14), cruzado na vertical, com brilho de um lado.
    for y in range(Y - 6, Y + 7):
        put(13, y, IRON_LIGHT if y < Y else IRON)
        put(14, y, IRON_DARK if abs(y - Y) > 4 else IRON)
    # Lâmina (x 15-41): fio claro em cima, aço, sulco escuro no meio, aço embaixo.
    for x in range(15, 42):
        put(x, Y - 1, STEEL_EDGE)
        put(x, Y, STEEL_DARK if 17 <= x <= 36 else STEEL)
        put(x, Y + 1, STEEL)
    # Ponta (x 42-44), afinando.
    put(42, Y - 1, STEEL_EDGE)
    put(42, Y, STEEL)
    put(42, Y + 1, STEEL_DARK)
    put(43, Y, STEEL_EDGE)
    put(44, Y, STEEL)

    # Contorno: todo pixel vazio encostado (4 vizinhos) num pixel cheio vira contorno escuro.
    filled = px[:, :, 3] > 0
    near = np.zeros_like(filled)
    near[1:] |= filled[:-1]
    near[:-1] |= filled[1:]
    near[:, 1:] |= filled[:, :-1]
    near[:, :-1] |= filled[:, 1:]
    outline = near & ~filled
    px[outline] = (*OUTLINE, 255)
    return Image.fromarray(px)


WEAPONS = {"espada_ferro": espada_ferro}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, draw in WEAPONS.items():
        image = draw()
        image.save(OUT / f"{name}.png")
        print(f"{name}: {image.width}x{image.height}")


if __name__ == "__main__":
    main()
