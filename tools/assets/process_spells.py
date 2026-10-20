"""Efeitos das magias do mago, recortados de assets/tilesets/novos tilesets/magias1.png (arte do dono do projeto, fora do
git). A folha tem 4 faixas, achadas pelas linhas vazias entre elas (e cada quadro pelas colunas vazias):

    1  Bola de Fogo, 4 quadros apontando para a direita (a cauda cresce para a esquerda)
    2  dois Círculos Rúnicos vistos de cima: o amarelo (Raio) e o de terra (Pântano)
    3  Queda de Raio, 4 quadros
    4  Poça de Lama, 4 quadros (oval, em 3/4)

Fundo:
- luminosos (bola de fogo, círculo do raio, raio): o quase preto (< LUMINOUS_BLACK) sai, e o alfa sobe suave com o
  brilho até LUMINOUS_SOFT, sem halo preto em piso claro ou escuro;
- opacos (círculo de terra, lama): só sai o escuro (< OPAQUE_BLACK) ligado à borda da célula (flood-fill de fora para
  dentro); os marrons e pretos de dentro ficam. O buraco do meio do círculo de terra (marrom quase preto, < HOLE_DARK)
  sai por um flood-fill a partir do centro dele, que para no anel claro em volta.

Alinhamento (todos os quadros de uma tira na mesma escala, cada um posto pelo seu ponto de referência, sem cortar nada:
a escala é a maior que cabe em todos os quadros):
- fireball_sheet.png         4 x 64x64   a frente da cabeça da bola em (56, 32)
- rune_circle_lightning.png  96x96       centro do círculo em (48, 48)
- rune_circle_swamp.png      96x96       idem
- lightning_strike_sheet.png 4 x 64x128  o ponto de impacto (base do raio) em (32, 118)
- mud_swamp_sheet.png        4 x 128x64  o centro da elipse da poça (linha mais larga) no mesmo ponto em todos
Também grava assets/spells/spells.json (o centro da poça e o tamanho da elipse dela no quadro, para o cliente e o
servidor usarem a mesma área) e a conferência ampliada tools/assets/build/spells_preview.png.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_spells.py
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "tilesets" / "novos tilesets" / "magias1.png"
OUT = ROOT / "assets" / "spells"
WORK = ROOT / "tools" / "assets" / "build"
LUMINOUS_BLACK = 18
LUMINOUS_SOFT = 70
OPAQUE_BLACK = 16
# O buraco do meio do círculo de terra é um marrom quase preto (~30, 16, 10), cercado pelo anel claro.
HOLE_DARK = 40
GAP_MERGE = 40  # colunas vazias menores que isto ficam dentro do mesmo quadro (faíscas soltas)


def runs(mask: np.ndarray) -> list[tuple[int, int]]:
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def cells(sheet: np.ndarray) -> list[list[np.ndarray]]:
    """As faixas (de cima para baixo) e os quadros de cada uma (da esquerda para a direita), recortados justos."""
    visible = (sheet[..., 3] > 0) & (sheet[..., :3].max(axis=2) >= LUMINOUS_BLACK)
    bands = []
    for y0, y1 in runs(visible.any(axis=1)):
        merged: list[tuple[int, int]] = []
        for x0, x1 in runs(visible[y0 : y1 + 1].any(axis=0)):
            if merged and x0 - merged[-1][1] < GAP_MERGE:
                merged[-1] = (merged[-1][0], x1)
            else:
                merged.append((x0, x1))
        bands.append([sheet[y0 : y1 + 1, x0 : x1 + 1] for x0, x1 in merged])
    return bands


def luminous(px: np.ndarray) -> np.ndarray:
    out = px.copy()
    bright = px[..., :3].max(axis=2).astype(float)
    soft = np.clip((bright - LUMINOUS_BLACK) / (LUMINOUS_SOFT - LUMINOUS_BLACK), 0, 1)
    out[..., 3] = (px[..., 3] * soft).astype(np.uint8)
    return out


def flood(clear: np.ndarray, seeds: list[tuple[int, int]]) -> np.ndarray:
    h, w = clear.shape
    seen = np.zeros_like(clear)
    queue = deque()
    for y, x in seeds:
        if 0 <= y < h and 0 <= x < w and clear[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and clear[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def opaque(px: np.ndarray, hole_at_center: bool = False) -> np.ndarray:
    """Fundo = escuro ligado à borda (e, no círculo de terra, o buraco escuro ligado ao centro)."""
    out = px.copy()
    dark = (px[..., 3] == 0) | (px[..., :3].max(axis=2) < OPAQUE_BLACK)
    h, w = dark.shape
    border = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    background = flood(dark, border)
    if hole_at_center:
        hole = (px[..., 3] == 0) | (px[..., :3].max(axis=2) < HOLE_DARK)
        background |= flood(hole, [(h // 2 + dy, w // 2 + dx) for dy in range(-3, 4) for dx in range(-3, 4)])
    out[background, 3] = 0
    out[~background, 3] = np.where(px[~background, 3] > 0, 255, 0)
    return out


def place(frames: list[np.ndarray], anchors: list[tuple[float, float]], size: tuple[int, int], target: tuple[float, float],
          binary: bool) -> list[np.ndarray]:
    """Cada quadro na mesma escala, com o seu ponto de referência (x, y da arte) caindo em `target` do quadro de saída.
    A escala é a maior em que nenhum quadro passa da borda."""
    w, h = size
    tx, ty = target
    scale = float("inf")
    for px, (ax, ay) in zip(frames, anchors):
        ys, xs = np.nonzero(px[..., 3] > 0)
        left, right = ax - xs.min(), xs.max() + 1 - ax
        top, bottom = ay - ys.min(), ys.max() + 1 - ay
        for room, need in ((tx, left), (w - tx, right), (ty, top), (h - ty, bottom)):
            if need > 0:
                scale = min(scale, room / need)
    out = []
    for px, (ax, ay) in zip(frames, anchors):
        box = (ax - tx / scale, ay - ty / scale, ax + (w - tx) / scale, ay + (h - ty) / scale)
        out.append(resample(px, (w, h), box, binary))
    return out


def resample(px: np.ndarray, size: tuple[int, int], box: tuple[float, ...], binary: bool) -> np.ndarray:
    """Média por área (alfa pré-multiplicado) do recorte `box` da arte para `size`. Opacos: alfa binário."""
    # O recorte pode passar da borda da célula (a área do quadro é maior que a arte): fora dela é transparente.
    pad = int(max(0, -box[0], -box[1], box[2] - px.shape[1], box[3] - px.shape[0])) + 2
    padded = np.zeros((px.shape[0] + 2 * pad, px.shape[1] + 2 * pad, 4), np.uint8)
    padded[pad:-pad, pad:-pad] = px
    box = (box[0] + pad, box[1] + pad, box[2] + pad, box[3] + pad)
    alpha = padded[..., 3:4].astype(np.float32) / 255
    premult = np.concatenate([padded[..., :3] * alpha, alpha * 255], axis=2).astype(np.float32)
    ch = [np.asarray(Image.fromarray(premult[..., i], "F").resize(size, Image.BOX, box=box)) for i in range(4)]
    a = ch[3] / 255
    out = np.zeros((size[1], size[0], 4), np.uint8)
    keep = a >= (0.5 if binary else 0.02)
    for i in range(3):
        out[..., i][keep] = np.clip(ch[i][keep] / a[keep], 0, 255)
    out[..., 3][keep] = 255 if binary else np.clip(a[keep] * 255, 0, 255)
    return out


def largest_piece(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    label = np.zeros(mask.shape, int)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if label[y0, x0]:
            continue
        sizes.append(0)
        n = len(sizes) - 1
        label[y0, x0] = n
        queue = deque([(y0, x0)])
        while queue:
            y, x = queue.popleft()
            sizes[n] += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = n
                    queue.append((ny, nx))
    return label == int(np.argmax(sizes))


def fireball_anchor(px: np.ndarray) -> tuple[float, float]:
    """A frente da cabeça: a coluna opaca mais à direita do corpo, na altura média das últimas colunas dele."""
    body = largest_piece(px[..., 3] > 128)
    ys, xs = np.nonzero(body)
    front = xs.max() + 1
    near = xs >= front - max(4, (front - xs.min()) // 12)
    return float(front), float(ys[near].mean() + 0.5)


def strike_anchor(px: np.ndarray) -> tuple[float, float]:
    """O impacto: a linha mais baixa do raio, no meio do que há nas últimas linhas."""
    ys, xs = np.nonzero(px[..., 3] > 128)
    bottom = ys.max() + 1
    near = ys >= bottom - max(4, (bottom - ys.min()) // 25)
    return float(xs[near].mean() + 0.5), float(bottom)


def puddle_anchor(px: np.ndarray) -> tuple[float, float, float, float]:
    """Centro da elipse da poça: x no meio das pontas, y na linha mais larga (a elipse é mais larga no centro). Devolve
    também os semieixos (meia largura e meia altura da parte de baixo, que não tem bolhas nem respingos)."""
    body = largest_piece(px[..., 3] > 128)
    ys, xs = np.nonzero(body)
    widths = np.array([np.count_nonzero(body[y]) for y in range(body.shape[0])])
    widest = np.nonzero(widths >= widths.max() * 0.98)[0]
    cy = float(widest.mean() + 0.5)
    cx = float((xs.min() + xs.max() + 1) / 2)
    return cx, cy, (xs.max() + 1 - xs.min()) / 2, ys.max() + 1 - cy


def circle_anchor(px: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(px[..., 3] > 0)
    return (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2


def strip(frames: list[np.ndarray]) -> np.ndarray:
    return np.concatenate(frames, axis=1)


def main() -> None:
    sheet = np.asarray(Image.open(SOURCE).convert("RGBA"))
    bands = cells(sheet)
    if [len(b) for b in bands] != [4, 2, 4, 4]:
        raise SystemExit(f"esperava faixas de 4, 2, 4 e 4 quadros; achei {[len(b) for b in bands]}")
    fire = [luminous(px) for px in bands[0]]
    rune_light = luminous(bands[1][0])
    rune_swamp = opaque(bands[1][1], hole_at_center=True)
    strikes = [luminous(px) for px in bands[2]]
    mud = [opaque(px) for px in bands[3]]

    OUT.mkdir(parents=True, exist_ok=True)
    fire_out = place(fire, [fireball_anchor(px) for px in fire], (64, 64), (56, 32), binary=False)
    Image.fromarray(strip(fire_out)).save(OUT / "fireball_sheet.png")
    light_out = place([rune_light], [circle_anchor(rune_light)], (96, 96), (48, 48), binary=False)[0]
    Image.fromarray(light_out).save(OUT / "rune_circle_lightning.png")
    swamp_out = place([rune_swamp], [circle_anchor(rune_swamp)], (96, 96), (48, 48), binary=True)[0]
    Image.fromarray(swamp_out).save(OUT / "rune_circle_swamp.png")
    strike_out = place(strikes, [strike_anchor(px) for px in strikes], (64, 128), (32, 118), binary=False)
    Image.fromarray(strip(strike_out)).save(OUT / "lightning_strike_sheet.png")

    # Poça: o centro da elipse vai para o meio na horizontal; na vertical, para onde a maior folga de cima e de baixo
    # caiba (as bolhas e os respingos ficam em cima).
    puddles = [puddle_anchor(px) for px in mud]
    tops = max(cy - np.nonzero(px[..., 3] > 0)[0].min() for px, (_, cy, _, _) in zip(mud, puddles))
    bottoms = max(np.nonzero(px[..., 3] > 0)[0].max() + 1 - cy for px, (_, cy, _, _) in zip(mud, puddles))
    center_y = round(64 * tops / (tops + bottoms), 1)
    mud_out = place(mud, [(cx, cy) for cx, cy, _, _ in puddles], (128, 64), (64, center_y), binary=True)
    Image.fromarray(strip(mud_out)).save(OUT / "mud_swamp_sheet.png")
    rx, ry = measured_puddle(mud_out[0], 64, center_y)
    info = {"mudCenter": [64, center_y], "mudRadii": [rx, ry]}
    (OUT / "spells.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    save_preview([strip(fire_out), light_out, swamp_out, strip(strike_out), strip(mud_out)])
    print(info)


def measured_puddle(frame: np.ndarray, cx: float, cy: float) -> tuple[float, float]:
    """Semieixos da elipse da poça no quadro final: meia largura na linha do centro e a altura da metade de baixo."""
    row = frame[int(cy), :, 3] > 0
    xs = np.nonzero(row)[0]
    below = np.nonzero(frame[:, int(cx), 3] > 0)[0]
    return round((xs.max() + 1 - xs.min()) / 2, 1), round(float(below.max() + 1 - cy), 1)


def save_preview(parts: list[np.ndarray]) -> None:
    scale = 3
    h = sum(p.shape[0] for p in parts) + 8 * len(parts)
    w = max(p.shape[1] for p in parts)
    sheet = Image.new("RGBA", (w * scale, h * scale), (70, 66, 58, 255))
    dark = Image.new("RGBA", (w * scale, h * scale // 2), (18, 20, 26, 255))
    sheet.paste(dark, (0, 0))
    y = 0
    for part in parts:
        img = Image.fromarray(part).resize((part.shape[1] * scale, part.shape[0] * scale), Image.NEAREST)
        sheet.alpha_composite(img, (0, y * scale))
        y += part.shape[0] + 8
    WORK.mkdir(parents=True, exist_ok=True)
    sheet.save(WORK / "spells_preview.png")


if __name__ == "__main__":
    main()
