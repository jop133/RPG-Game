"""Camadas de armadura por cima dos personagens, quadro a quadro (Elmo, Peitoral, Calça, Bota).

Para cada classe, direção e quadro (o parado de 64x64 e os 6 quadros da caminhada de 96x96), o script separa faixas do
corpo pelas linhas marcadas de cada classe (BODY, em px acima dos pés; pescoço e testa seguem o balanço do quadro):
    boots   dos pés até a canela
    pants   da canela ao quadril
    chest   do quadril aos ombros, sem os braços (fora da largura do tronco nas vistas de frente e de costas)
    helm    o topo da cabeça: mais alto de frente (o rosto aparece), até a nuca de costas
Dentro de cada faixa, os pixels do próprio sprite são recoloridos com a paleta do metal pelo brilho original: a peça
herda o contorno, o sombreado e o movimento daquele quadro exato, então não atravessa braço nem perna. As mãos ficam de
fora (um círculo em volta do ponto da mão, de hand_sockets.json), para a empunhadura continuar à vista.

Saída: assets/characters/<classe>/armor/<visual>/<peça>/<direção>.png        (64x64, parado)
       assets/characters/<classe>/armor/<visual>/<peça>/walk-<direção>.png   (fita 96xN, caminhada)
       tools/assets/build/armor_<visual>.png                                 (folha de conferência)

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_armor_layers.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CHARS = ROOT / "assets" / "characters"
WORK = ROOT / "tools" / "assets" / "build"
CLASSES = ["barbaro", "elfo", "homem_fera", "mago"]
DIRECTIONS = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"]
FRONT = {"south", "south-west", "south-east"}
BACK = {"north", "north-west", "north-east"}
IDLE = (64, 61)  # tamanho do quadro e linha dos pés
STRIP = (96, 78)
PIECES = ["boots", "pants", "chest", "helm"]

# Linhas do corpo de cada classe, em px acima dos pés no sprite parado (marcadas na arte): tornozelo, quadril, pescoço e
# testa (no mago, a aba do chapéu). Medir pela altura da silhueta não serve: o chapéu do mago e as orelhas do
# homem-fera mudam o topo. Na caminhada, pescoço e testa sobem e descem com o balanço do quadro (topo da silhueta).
BODY = {
    "barbaro": {"ankle": 9, "hip": 23, "neck": 42, "brow": 52},
    "elfo": {"ankle": 10, "hip": 23, "neck": 43, "brow": 51},
    "homem_fera": {"ankle": 7, "hip": 25, "neck": 43, "brow": 51},
    "mago": {"ankle": 8, "hip": 27, "neck": 37, "brow": 43},
}
HAND_CLEAR = 4  # raio, em px, em volta da outra mão que fica de fora
# Na mão direita (a da espada), fica de fora o mesmo quadrado que o cliente redesenha por cima do cabo (o punho: 9x9,
# 2 px para fora do corpo; ver poseGrip em client/src/main.ts): assim o punho nunca pinta pele sobre o metal.
GRIP_HALF = 4
GRIP_OUTWARD = 2
ARM_MARGIN = 6  # o tronco vai até a mão menos isto, nas vistas de frente e de costas
SIDE_ARM = 5  # de lado: meia largura da faixa do braço da frente (da mão até o ombro) que fica de fora
SIDE_TORSO = 13  # de lado: meia largura do tronco (o rabo do homem-fera e a capa esvoaçando ficam de fora)


def keeps_over_armor(class_id: str, rgb: np.ndarray) -> np.ndarray:
    """Pixels que continuam por cima da armadura no peitoral e na calça: cabelo e capa (o verde e o amarelo do elfo, o
    cabelo e a barba brancos do mago)."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    top, bottom = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    saturation = (top - bottom) / np.maximum(top, 1)
    if class_id == "elfo":
        return (g >= r - 10) & (g > b + 25) & (saturation > 0.3)
    if class_id == "mago":
        return (saturation < 0.18) & (top > 150)
    return np.zeros(r.shape, bool)

# Paletas por brilho (escuro -> claro). Ferro escuro, com um toque frio; a malha da calça um pouco mais escura.
IRON = [(22, 24, 30), (48, 52, 62), (78, 84, 96), (112, 118, 132), (150, 156, 170), (196, 202, 214)]
MAIL = [(20, 22, 26), (40, 44, 52), (64, 68, 78), (92, 98, 110), (124, 130, 142), (160, 166, 178)]
PALETTES = {"boots": IRON, "pants": MAIL, "chest": IRON, "helm": IRON}


def view_of(direction: str) -> str:
    return "front" if direction in FRONT else "back" if direction in BACK else "side"


def silhouette_top(alpha: np.ndarray) -> int:
    rows = np.where(alpha.any(axis=1))[0]
    return int(rows.min()) if rows.size else 0


def recolor(rgb: np.ndarray, palette: list[tuple[int, int, int]]) -> np.ndarray:
    """Cada pixel ganha o tom da paleta do brilho dele; o contorno (muito escuro) continua contorno."""
    luminance = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255
    # Estica o contraste: a pele e o pano têm pouca variação de brilho; o metal precisa de reflexo.
    stretched = np.clip((luminance - 0.08) / 0.62, 0, 1)
    index = np.clip((stretched * (len(palette) - 1) + 0.5).astype(int), 0, len(palette) - 1)
    index[luminance < 0.1] = 0
    return np.array(palette, np.uint8)[index]


def piece_mask(
    frame: np.ndarray, class_id: str, piece: str, direction: str, feet: int, center: int, hand: tuple[int, int], bob: int
) -> np.ndarray:
    """Onde a peça cobre o corpo neste quadro: a faixa da peça dentro da silhueta, sem as mãos, sem cabelo e capa (no
    peitoral e na calça) e sem os braços (de frente e de costas, fora do tronco; de lado, o braço da frente)."""
    alpha = frame[..., 3] > 128
    h, w = alpha.shape
    ys, xs = np.mgrid[0:h, 0:w]
    up = feet - ys  # px acima dos pés
    body = BODY[class_id]
    neck, brow = body["neck"] + bob, body["brow"] + bob
    view = view_of(direction)
    if piece == "boots":
        band = up < body["ankle"]
    elif piece == "pants":
        band = (up >= body["ankle"]) & (up < body["hip"])
    elif piece == "chest":
        band = (up >= body["hip"]) & (up < neck)
    else:
        helm_bottom = {"front": brow, "side": brow - 1, "back": neck}[view]
        band = up >= helm_bottom
    mask = alpha & band
    if piece in ("chest", "pants"):
        mask &= ~keeps_over_armor(class_id, frame[..., :3])
    hx, hy = center + hand[0], feet + hand[1]
    if piece in ("chest", "pants") and view != "side":
        # De frente e de costas, as mãos ficam dos dois lados do tronco, simétricas: o tronco vai até perto delas.
        half = max(6, abs(hand[0]) - ARM_MARGIN)
        mask &= np.abs(xs - center) <= half
    if piece in ("chest", "pants") and view == "side":
        mask &= np.abs(xs - center) <= SIDE_TORSO
    if piece == "chest" and view == "side":
        mask &= ~((np.abs(xs - hx) <= SIDE_ARM) & (ys <= hy))
    gx = hx + int(np.sign(hand[0])) * GRIP_OUTWARD
    mask &= ~((np.abs(xs - gx) <= GRIP_HALF) & (np.abs(ys - hy) <= GRIP_HALF))
    mask &= (xs - (center - hand[0])) ** 2 + (ys - hy) ** 2 > HAND_CLEAR**2
    return mask


def outline_top(mask: np.ndarray, layer: np.ndarray) -> None:
    """Linha escura na borda de cima da peça (onde ela encontra o corpo descoberto): a peça parece vestida."""
    above = np.zeros_like(mask)
    above[1:] = mask[:-1]
    edge = mask & ~above
    layer[edge, :3] = IRON[0]


def layer_for(
    frame: np.ndarray, class_id: str, piece: str, direction: str, feet: int, center: int, hand: tuple[int, int], bob: int
) -> np.ndarray:
    mask = piece_mask(frame, class_id, piece, direction, feet, center, hand, bob)
    layer = np.zeros_like(frame)
    layer[mask, :3] = recolor(frame[..., :3], PALETTES[piece])[mask]
    layer[mask, 3] = 255
    if piece != "boots":
        outline_top(mask, layer)
    return layer


def build(visual: str = "iron") -> dict:
    sockets = json.loads((CHARS / "hand_sockets.json").read_text(encoding="utf-8"))
    preview_rows = []
    for class_id in CLASSES:
        for direction in DIRECTIONS:
            idle_hand = sockets[class_id]["idle"][direction][0]
            idle = np.asarray(Image.open(CHARS / class_id / f"{direction}.png").convert("RGBA"))
            strip = np.asarray(Image.open(CHARS / class_id / f"walk-{direction}.png").convert("RGBA"))
            frames = [strip[:, i * STRIP[0] : (i + 1) * STRIP[0]] for i in range(strip.shape[1] // STRIP[0])]
            walk_hands = sockets[class_id]["walk"][direction]
            # Balanço de cada quadro da caminhada: quanto o topo da silhueta subiu em relação ao parado.
            idle_height = IDLE[1] - silhouette_top(idle[..., 3] > 128)
            row = [(idle, IDLE[0] // 2, IDLE[1], (idle_hand["dx"], idle_hand["dy"]), 0)]
            for f, s in zip(frames, walk_hands):
                bob = (STRIP[1] - silhouette_top(f[..., 3] > 128)) - idle_height
                row.append((f, STRIP[0] // 2, STRIP[1], (s["dx"], s["dy"]), bob))
            dressed = []
            for piece in PIECES:
                out = CHARS / class_id / "armor" / visual / piece
                out.mkdir(parents=True, exist_ok=True)
                layers = [layer_for(f, class_id, piece, direction, feet, cx, hand, bob) for f, cx, feet, hand, bob in row]
                Image.fromarray(layers[0]).save(out / f"{direction}.png")
                Image.fromarray(np.concatenate(layers[1:], axis=1)).save(out / f"walk-{direction}.png")
                dressed.append(layers)
            preview_rows.append((class_id, direction, row, dressed))
    save_preview(preview_rows, visual)
    return {"files": len(CLASSES) * len(DIRECTIONS) * len(PIECES) * 2}


def save_preview(rows: list, visual: str) -> None:
    """Folha de conferência: por classe e direção, o parado e 3 quadros da caminhada, sem e com a armadura inteira."""
    cell, scale, crop = 96, 2, 8
    picks = [0, 1, 3, 5]
    side = (cell - 2 * crop) * scale
    sheet = Image.new("RGBA", (side * len(picks) * 2, side * len(rows)), (54, 58, 54, 255))
    for r, (_, _, row, dressed) in enumerate(rows):
        for k, i in enumerate(picks):
            frame, cx, feet, _, _ = row[i]
            for dressed_too in (False, True):
                img = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                ox, oy = cell // 2 - cx, STRIP[1] - feet
                img.alpha_composite(Image.fromarray(frame), (ox, oy))
                if dressed_too:
                    for layers in dressed:
                        img.alpha_composite(Image.fromarray(layers[i]), (ox, oy))
                big = img.crop((crop, crop, cell - crop, cell - crop)).resize((side, side), Image.NEAREST)
                sheet.alpha_composite(big, ((k * 2 + int(dressed_too)) * side, r * side))
    WORK.mkdir(parents=True, exist_ok=True)
    sheet.save(WORK / f"armor_{visual}.png")


if __name__ == "__main__":
    print(build())
