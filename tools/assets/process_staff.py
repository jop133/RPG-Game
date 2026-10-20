"""Cajado Arcano e Projétil Mágico, recortados de assets/ui/cajado1.png (arte do dono do projeto, fora do git).

A folha tem duas células separadas por uma linha vertical escura no meio (x ~1368..1380): o cajado à esquerda, na
diagonal (cristal em cima à direita, ponteira embaixo à esquerda), e o projétil à direita, voando para a direita. Cada
metade é cortada a CUT_MARGIN px da linha, para ela nunca entrar. A folha já vem com fundo transparente; mesmo assim,
o que for quase preto (< BLACK) e encostar no fundo sai (fundo preto de uma versão .jpg), e os vãos pretos fechados
entre as garras e o cristal também saem. Partículas soltas (as estrelas em volta do cristal, as faíscas da cauda) ficam.

Redução: média por área (BOX) com alfa pré-multiplicado e alfa binário depois (pixel art sem meia transparência).

Saída: assets/weapons/cajado_arcano.png      na mão (diagonal como a arte; o cliente compensa o ângulo da arte)
       assets/weapons/projetil_magico.png    em voo (apontando para a direita, ângulo 0)
       assets/ui/hud/items/cajado_arcano.png ícone do slot, 48x48
       tools/assets/build/staff_preview.png  conferência, ampliada
O cliente lê o ponto de pega e a ponta do cristal do JSON assets/weapons/cajado_arcano.json (fração da imagem).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_staff.py
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "ui" / "cajado1.png"
WEAPONS = ROOT / "assets" / "weapons"
ICONS = ROOT / "assets" / "ui" / "hud" / "items"
WORK = ROOT / "tools" / "assets" / "build"
CUT_MARGIN = 10
BLACK = 15
STAFF_SIZE = 44  # maior lado do cajado na mão, em px (a espada tem ~40 px de ponta a ponta)
PROJECTILE_WIDTH = 28
ICON = 48
ICON_PAD = 3
ALPHA_CUT = 0.4


def halves(sheet: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """As duas células, sem a linha do meio: a coluna da linha é a mais opaca perto do centro."""
    w = sheet.shape[1]
    near = range(w // 2 - 40, w // 2 + 40)
    line = max(near, key=lambda x: (sheet[:, x, 3] > 128).sum())
    return sheet[:, : line - CUT_MARGIN], sheet[:, line + CUT_MARGIN :]


def clear_black(px: np.ndarray) -> np.ndarray:
    """Tira o preto que é fundo: o quase preto ligado à borda da imagem ou ao transparente, e os bolsões fechados de
    quase preto maiores que um contorno (os vãos entre as garras e o cristal). O contorno fino da arte fica."""
    out = px.copy()
    black = (px[..., :3].max(axis=2) < BLACK) & (px[..., 3] > 0)
    h, w = black.shape
    seen = np.zeros_like(black)
    for y0, x0 in zip(*np.nonzero(black)):
        if seen[y0, x0]:
            continue
        group, touches_clear = [], False
        queue = deque([(y0, x0)])
        seen[y0, x0] = True
        while queue:
            y, x = queue.popleft()
            group.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if not (0 <= ny < h and 0 <= nx < w) or px[ny, nx, 3] == 0:
                    touches_clear = True
                elif black[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        # Um contorno de pixel art tem ~1 pixel da arte de largura (~14 px aqui); bolsão é bem maior que isso.
        if touches_clear or len(group) > 600:
            ys, xs = zip(*group)
            out[list(ys), list(xs), 3] = 0
    return out


def crop(px: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(px[..., 3] > 0)
    return px[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def shrink(px: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Média por área com alfa pré-multiplicado; depois alfa binário e a cor sem o pré-multiplicado."""
    alpha = px[..., 3:4].astype(float) / 255
    premult = np.concatenate([px[..., :3] * alpha, alpha * 255], axis=2).astype(np.float32)
    channels = [np.asarray(Image.fromarray(premult[..., i], "F").resize(size, Image.BOX)) for i in range(4)]
    a = channels[3] / 255
    out = np.zeros((size[1], size[0], 4), np.uint8)
    keep = a >= ALPHA_CUT
    for i in range(3):
        out[..., i][keep] = np.clip(channels[i][keep] / a[keep], 0, 255)
    out[..., 3][keep] = 255
    return out


def fit(px: np.ndarray, longest: int) -> np.ndarray:
    h, w = px.shape[:2]
    k = longest / max(h, w)
    return shrink(px, (max(1, round(w * k)), max(1, round(h * k))))


def staff_points(full: np.ndarray, small: np.ndarray) -> dict:
    """Ponto de pega e ponta do cristal, em fração da imagem pequena. A pega fica na faixa de couro, onde nascem as
    tiras penduradas: a ~38% da haste a partir da ponteira (de baixo à esquerda para cima à direita). A ponta é o pixel
    opaco mais acima e à direita do cristal (sem as partículas soltas, que são pequenas)."""
    h, w = small.shape[:2]
    ys, xs = np.nonzero(largest_piece(small[..., 3] > 0))
    # Ponteira: o pixel mais embaixo à esquerda; cristal: o mais em cima à direita (projeção na diagonal).
    score = xs - ys
    butt = (xs[score.argmin()], ys[score.argmin()])
    tip = (xs[score.argmax()], ys[score.argmax()])
    grip = (butt[0] + 0.38 * (tip[0] - butt[0]), butt[1] + 0.38 * (tip[1] - butt[1]))
    return {
        "grip": [round((grip[0] + 0.5) / w, 3), round((grip[1] + 0.5) / h, 3)],
        "tip": [round((tip[0] + 0.5) / w, 3), round((tip[1] + 0.5) / h, 3)],
        "artAngleDegrees": round(float(np.degrees(np.arctan2(tip[1] - butt[1], tip[0] - butt[0]))), 1),
        "size": [w, h],
    }


def largest_piece(mask: np.ndarray) -> np.ndarray:
    """O maior pedaço ligado (vizinhança de 8): o cajado, sem as partículas soltas."""
    h, w = mask.shape
    label = np.zeros(mask.shape, int)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if label[y0, x0]:
            continue
        sizes.append(0)
        queue = deque([(y0, x0)])
        label[y0, x0] = len(sizes) - 1
        while queue:
            y, x = queue.popleft()
            sizes[-1] += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = len(sizes) - 1
                        queue.append((ny, nx))
    return label == int(np.argmax(sizes))


def icon(px: np.ndarray) -> np.ndarray:
    small = fit(px, ICON - 2 * ICON_PAD)
    out = np.zeros((ICON, ICON, 4), np.uint8)
    h, w = small.shape[:2]
    y0, x0 = (ICON - h) // 2, (ICON - w) // 2
    out[y0 : y0 + h, x0 : x0 + w] = small
    return out


def main() -> None:
    sheet = np.asarray(Image.open(SOURCE).convert("RGBA"))
    left, right = halves(sheet)
    staff = crop(clear_black(left))
    projectile = crop(clear_black(right))
    staff_small = fit(staff, STAFF_SIZE)
    projectile_small = fit(projectile, PROJECTILE_WIDTH) if projectile.shape[1] >= projectile.shape[0] else None
    if projectile_small is None:
        raise SystemExit("projétil mais alto que largo: a arte mudou?")
    points = staff_points(staff, staff_small)
    WEAPONS.mkdir(parents=True, exist_ok=True)
    Image.fromarray(staff_small).save(WEAPONS / "cajado_arcano.png")
    Image.fromarray(projectile_small).save(WEAPONS / "projetil_magico.png")
    Image.fromarray(icon(staff)).save(ICONS / "cajado_arcano.png")
    (WEAPONS / "cajado_arcano.json").write_text(json.dumps(points, indent=1) + "\n", encoding="utf-8")
    save_preview(staff_small, projectile_small, points)
    print(points, "projétil", projectile_small.shape[1::-1])


def save_preview(staff: np.ndarray, projectile: np.ndarray, points: dict) -> None:
    scale = 8
    h = max(staff.shape[0], projectile.shape[0], ICON)
    sheet = Image.new("RGBA", ((staff.shape[1] + projectile.shape[1] + ICON + 8) * scale, h * scale), (40, 44, 40, 255))
    x = 0
    for part in (staff, projectile, np.asarray(Image.open(ICONS / "cajado_arcano.png"))):
        img = Image.fromarray(part).resize((part.shape[1] * scale, part.shape[0] * scale), Image.NEAREST)
        sheet.alpha_composite(img, (x, 0))
        x += (part.shape[1] + 4) * scale
    marks = np.asarray(sheet).copy()
    for key, color in (("grip", (255, 0, 255, 255)), ("tip", (255, 255, 0, 255))):
        fx, fy = points[key]
        cx, cy = int(fx * staff.shape[1] * scale), int(fy * staff.shape[0] * scale)
        marks[max(0, cy - 3) : cy + 4, max(0, cx - 3) : cx + 4] = color
    WORK.mkdir(parents=True, exist_ok=True)
    Image.fromarray(marks).save(WORK / "staff_preview.png")


if __name__ == "__main__":
    main()
