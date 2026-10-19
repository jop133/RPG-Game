"""Armadura vestida nos personagens, quadro a quadro (Elmo, Peitoral, Calça, Bota).

Para cada classe, direção e quadro (o parado de 64x64 e os 6 quadros da caminhada de 96x96), tudo é medido a partir do
pivô dos pés: dx = x - centro (32 ou 48) e "up" = pés - y (61 ou 78), em px acima dos pés. As linhas do corpo de cada
classe (BODY) foram marcadas na arte; na caminhada, o que fica acima do quadril sobe e desce com o balanço do quadro.

    boots   dos pés até a canela, em todas as direções
    pants   da canela ao quadril (quadril, coxas e joelhos), em todas as direções; nunca as mãos
    chest   em T de frente, de costas e nas diagonais: ombreiras largas (pontas de baixo arredondadas) e a couraça só no
            tronco, deixando braços e mãos de fora; de lado, couraça e ombreira cobrindo tronco e braço de cima, com o
            antebraço e a mão de fora; um cinto escuro separa o peitoral da calça
    helm    uma calota desenhada (domo sombreado, contorno de 1 px, aro com rebites) sobre o topo da cabeça, acima das
            sobrancelhas: o rosto e o cabelo abaixo da linha do elmo ficam com as cores de verdade

Peitoral, calça e bota recolorem os pixels do próprio sprite com a paleta do metal pelo brilho, então seguem o
contorno, o sombreado e o movimento do quadro. Nunca são pintados: o punho da espada (o quadrado que o cliente redesenha
por cima do cabo) e a outra mão, o cabelo e a capa do elfo, o cabelo e a barba brancos do mago, o rabo do homem-fera e a
cabeça (que é do elmo).

Elmo no homem-fera e no mago: uma camada por cima não apaga pixels do corpo, então sai também uma versão do sprite do
corpo sem o que o elmo esconde (as orelhas do homem-fera, o chapéu do mago), que o cliente usa com o elmo equipado.

Saída: assets/characters/<classe>/armor/<visual>/<peça>/<direção>.png        (64x64, parado)
       assets/characters/<classe>/armor/<visual>/<peça>/walk-<direção>.png   (fita 96xN, caminhada)
       assets/characters/<classe>/helmed/<direção>.png e walk-<direção>.png  (corpo sob o elmo; homem-fera e mago)
       tools/assets/build/armor_<visual>.png                                 (folha de conferência)

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/build_armor_layers.py
"""

from __future__ import annotations

import json
from collections import deque
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
IDLE = (64, 32, 61)  # tamanho do quadro, centro x e linha dos pés
STRIP = (96, 48, 78)
PIECES = ["boots", "pants", "chest", "helm"]

# Linhas do corpo de cada classe, em px acima dos pés no sprite parado (marcadas na arte, de frente):
#   ankle            topo da bota (canela)              hip    topo da calça (abaixo do cinto)
#   belt             topo do cinto (fim da couraça)     shoulder_bottom / shoulder_top   faixa das ombreiras
#   chin             queixo (de frente, o peitoral não sobe na cabeça)     nape   nuca (o mesmo, de costas)
#   brow             sobrancelha (a borda de baixo do elmo)                crown  topo da calota
# Larguras (meia largura, em px): head (calota), shoulder (ombreiras), torso (couraça), pants (pernas, de frente);
# side_center / side_half: o tronco de lado (olhando para leste; oeste é o espelho). erase: acima disto (up), com o
# elmo, o que é da cabeça sai do corpo (orelhas do homem-fera, chapéu do mago); brim: no mago, a aba do chapéu desce
# até esta linha fora da coluna do rosto e também sai (só o que não é cabelo branco nem pele).
BODY = {
    "barbaro": dict(ankle=10, hip=23, belt=27, shoulder_bottom=39, shoulder_top=50, chin=40, nape=46, brow=52, crown=59,
                    head=8, shoulder=17, torso=10, pants=14, side_center=-2, side_half=10, erase=None),
    "elfo": dict(ankle=11, hip=24, belt=27, shoulder_bottom=35, shoulder_top=44, chin=43, nape=44, brow=50, crown=58,
                 head=7, shoulder=13, torso=8, pants=10, side_center=1, side_half=7, erase=None),
    "homem_fera": dict(ankle=10, hip=28, belt=30, shoulder_bottom=35, shoulder_top=45, chin=41, nape=44, brow=50,
                       crown=57, head=7, shoulder=17, torso=10, pants=13, side_center=-2, side_half=9, erase=50),
    "mago": dict(ankle=10, hip=24, belt=26, shoulder_bottom=29, shoulder_top=36, chin=33, nape=36, brow=44, crown=53,
                 head=7, shoulder=13, torso=8, pants=14, side_center=-1, side_half=8, erase=44, brim=39),
}
HAND_CLEAR = 4  # raio, em px, em volta da outra mão que fica de fora
# Na mão direita (a da espada), fica de fora o mesmo quadrado que o cliente redesenha por cima do cabo (o punho: 9x9,
# 2 px para fora do corpo; ver poseGrip em client/src/main.ts): assim o punho nunca pinta pele sobre o metal.
GRIP_HALF = 4
GRIP_OUTWARD = 2
# De lado, o antebraço e a mão ficam de fora: da mão até FOREARM px acima, FOREARM_HALF px para cada lado.
FOREARM = 11
FOREARM_HALF = 4
PAULDRON_ROUND = 3  # linhas de baixo da ombreira em que a ponta vai se arredondando

# Paletas por brilho (escuro -> claro). Ferro escuro, com um toque frio; a malha da calça um pouco mais escura.
IRON = [(22, 24, 30), (48, 52, 62), (78, 84, 96), (112, 118, 132), (150, 156, 170), (196, 202, 214)]
MAIL = [(20, 22, 26), (40, 44, 52), (64, 68, 78), (92, 98, 110), (124, 130, 142), (160, 166, 178)]
LEATHER = [(30, 20, 14), (62, 40, 26), (92, 62, 40)]
PALETTES = {"boots": IRON, "pants": MAIL, "chest": IRON}


def view_of(direction: str) -> str:
    return "front" if direction in FRONT else "back" if direction in BACK else "side"


def facing_sign(direction: str) -> int:
    """De lado e nas diagonais: +1 olhando para leste, -1 para oeste (a frente do corpo fica nesse lado)."""
    return 1 if "east" in direction else -1 if "west" in direction else 0


def channels(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return tuple(rgb[..., i].astype(int) for i in range(3))  # type: ignore[return-value]


def protected(class_id: str, rgb: np.ndarray) -> np.ndarray:
    """Pixels que a armadura nunca pinta, pela cor: o cabelo e a capa do elfo (verdes e amarelos), o cabelo e a barba
    brancos do mago, o rabo do homem-fera (pelo laranja com pouco azul, e a ponta branco-azulada). A pele não passa em
    nenhum destes testes (medido nos sprites)."""
    r, g, b = channels(rgb)
    top, bottom = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    saturation = (top - bottom) / np.maximum(top, 1)
    if class_id == "elfo":
        return (g >= r - 10) & (g > b + 25) & (saturation > 0.3)
    if class_id == "mago":
        return (saturation < 0.18) & (top > 150)
    if class_id == "homem_fera":
        fur = (r > 90) & (b < 0.35 * r) & (g > 0.5 * r)
        tip = (b >= r - 10) & (bottom > 140)
        tail = fur | tip
        # As sombras do pelo (mais escuras, mesmo tom) encostadas no pelo também são rabo.
        near = np.zeros_like(tail)
        near[1:] |= tail[:-1]
        near[:-1] |= tail[1:]
        near[:, 1:] |= tail[:, :-1]
        near[:, :-1] |= tail[:, 1:]
        shade = (r > 70) & (b < 0.42 * r) & (g > 0.42 * r)
        return tail | (near & shade)
    return np.zeros(r.shape, bool)


def recolor(rgb: np.ndarray, palette: list[tuple[int, int, int]]) -> np.ndarray:
    """Cada pixel ganha o tom da paleta do brilho dele; o contorno (muito escuro) continua contorno."""
    luminance = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255
    stretched = np.clip((luminance - 0.08) / 0.62, 0, 1)
    index = np.clip((stretched * (len(palette) - 1) + 0.5).astype(int), 0, len(palette) - 1)
    index[luminance < 0.1] = 0
    return np.array(palette, np.uint8)[index]


class Frame:
    """Um quadro do sprite com as coordenadas relativas ao pivô dos pés."""

    def __init__(self, pixels: np.ndarray, center: int, feet: int, hand: tuple[int, int], bob: int):
        self.pixels = pixels
        self.alpha = pixels[..., 3] > 128
        h, w = self.alpha.shape
        ys, xs = np.mgrid[0:h, 0:w]
        self.dx = xs - center
        self.up = feet - ys
        self.center, self.feet = center, feet
        self.hand = hand
        self.bob = bob

    def at(self, dx: int, up: int) -> tuple[int, int]:
        return self.feet - up, self.center + dx


def hands_clear(frame: Frame, direction: str) -> np.ndarray:
    """Onde as mãos ficam de fora: o quadrado do punho da espada e um círculo na outra mão (de frente e de costas, o
    espelho da mão da espada)."""
    hx, hy = frame.hand
    grip_x = hx + int(np.sign(hx)) * GRIP_OUTWARD
    out = (np.abs(frame.dx - grip_x) <= GRIP_HALF) & (np.abs(-frame.up - hy) <= GRIP_HALF)
    if view_of(direction) != "side":
        out |= (frame.dx + hx) ** 2 + (-frame.up - hy) ** 2 <= HAND_CLEAR**2
    return out


def head_center(frame: Frame, class_id: str, direction: str) -> float:
    """Centro da cabeça no quadro: a média das colunas do rosto/crânio logo abaixo da sobrancelha, perto de onde a
    cabeça costuma ficar nesta vista (sem cabelo e capa)."""
    body = BODY[class_id]
    brow = body["brow"] + frame.bob
    expected = 3 * facing_sign(direction) if view_of(direction) == "side" else facing_sign(direction)
    rows = (frame.up <= brow) & (frame.up > brow - 4)
    near = np.abs(frame.dx - expected) <= body["head"] + 3
    mask = frame.alpha & rows & near & ~protected(class_id, frame.pixels[..., :3])
    return float(frame.dx[mask].mean()) if mask.any() else float(expected)


def chest_mask(frame: Frame, class_id: str, direction: str, head_x: float) -> np.ndarray:
    body = BODY[class_id]
    bob = frame.bob
    up, dx = frame.up, frame.dx
    view = view_of(direction)
    top = body["shoulder_top"] + bob
    shoulders = (up >= body["shoulder_bottom"] + bob) & (up <= top)
    torso = (up >= body["belt"]) & (up < body["shoulder_bottom"] + bob)
    belt = (up >= body["hip"]) & (up < body["belt"])
    if view == "side":
        s = facing_sign(direction)
        core = np.abs(dx * s - body["side_center"]) <= body["side_half"]
        region = (shoulders | torso | belt) & core
        hx, hy = frame.hand
        region &= ~((np.abs(dx - hx) <= FOREARM_HALF) & (-up >= hy - FOREARM) & (-up <= hy + 3))
        head = (up > body["chin"] + bob) & (np.abs(dx - head_x) <= body["head"] - 2)
    else:
        # Ombreira: larga, com as pontas de baixo arredondadas (encolhe nas últimas linhas da faixa).
        rows_from_bottom = up - (body["shoulder_bottom"] + bob)
        shrink = np.clip(PAULDRON_ROUND - rows_from_bottom, 0, PAULDRON_ROUND)
        pauldron = shoulders & (np.abs(dx) <= body["shoulder"] - shrink)
        region = pauldron | (torso & (np.abs(dx) <= body["torso"])) | (belt & (np.abs(dx) <= body["torso"] + 1))
        neck = body["chin"] if view == "front" else body["nape"]
        head = (up > neck + bob) & (np.abs(dx - head_x) <= body["head"])
    return region & ~head


def pants_mask(frame: Frame, class_id: str, direction: str) -> np.ndarray:
    body = BODY[class_id]
    region = (frame.up >= body["ankle"]) & (frame.up < body["hip"])
    if view_of(direction) != "side":
        region &= np.abs(frame.dx) <= body["pants"]
    return region


def body_piece_layer(frame: Frame, class_id: str, piece: str, direction: str, head_x: float) -> np.ndarray:
    if piece == "boots":
        region = frame.up < BODY[class_id]["ankle"]
    elif piece == "pants":
        region = pants_mask(frame, class_id, direction)
    else:
        region = chest_mask(frame, class_id, direction, head_x)
    mask = frame.alpha & region & ~protected(class_id, frame.pixels[..., :3]) & ~hands_clear(frame, direction)
    layer = np.zeros_like(frame.pixels)
    layer[mask, :3] = recolor(frame.pixels[..., :3], PALETTES[piece])[mask]
    layer[mask, 3] = 255
    edge_lines(mask, frame.alpha, layer)
    if piece == "chest":
        belt = mask & (frame.up >= BODY[class_id]["hip"]) & (frame.up < BODY[class_id]["belt"])
        layer[belt, :3] = np.array(LEATHER)[(frame.up[belt] - BODY[class_id]["hip"]) % len(LEATHER)]
    return layer


def edge_lines(mask: np.ndarray, alpha: np.ndarray, layer: np.ndarray) -> None:
    """Contorno escuro onde a peça encontra o corpo descoberto (em cima e dos lados): a peça parece vestida, sem corte
    reto de cor lisa."""
    bare = alpha & ~mask
    edge = np.zeros_like(mask)
    edge[1:] |= bare[:-1]
    edge[:, 1:] |= bare[:, :-1]
    edge[:, :-1] |= bare[:, 1:]
    layer[mask & edge, :3] = IRON[1]


def helm_layer(frame: Frame, class_id: str, direction: str, head_x: float) -> np.ndarray:
    """A calota: meia elipse com a base na sobrancelha e o topo na coroa, centrada na cabeça. Luz de cima e da esquerda
    (domo 3D), um brilho, contorno preto de 1 px e o aro de baixo (2 linhas) com rebites."""
    body = BODY[class_id]
    brow, crown = body["brow"] + frame.bob, body["crown"] + frame.bob
    height = max(1, crown - brow)
    nx = (frame.dx - head_x) / body["head"]
    ny = (frame.up - brow) / height
    dome = (ny >= 0) & (nx**2 + ny**2 <= 1.0)
    layer = np.zeros_like(frame.pixels)
    light = 0.55 - 0.35 * nx + 0.35 * ny - 0.25 * (nx**2 + ny**2)
    index = np.clip((light * (len(IRON) - 1)).round().astype(int), 1, len(IRON) - 1)
    rgb = np.array(IRON, np.uint8)[index]
    shine = ((nx + 0.4) ** 2 + (ny - 0.62) ** 2) < 0.03
    rgb[shine] = (226, 230, 238)
    band = dome & (frame.up < brow + 2)
    rgb[band] = IRON[2]
    rivets = band & (frame.up == brow + 1) & ((frame.dx - round(head_x)) % 3 == 0)
    rgb[rivets] = IRON[4]
    layer[dome, :3] = rgb[dome]
    layer[dome, 3] = 255
    padded = np.pad(dome, 1)
    outline = dome & ~(padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:])
    layer[outline & ~band, :3] = (8, 8, 10)
    return layer


def helmed_body(frame: Frame, class_id: str, head_x: float) -> np.ndarray:
    """O corpo sob o elmo: sai o que é da cabeça acima de `erase` (o pedaço ligado ao topo da cabeça: orelhas, crânio,
    chapéu). O que não encosta na cabeça lá em cima (a ponta do rabo do homem-fera) fica. No mago, sai também a aba do
    chapéu, que desce dos lados do rosto (`brim`)."""
    body = BODY[class_id]
    erase = body["erase"]
    out = frame.pixels.copy()
    if erase is None:
        return out
    if "brim" in body:
        r, g, b = channels(frame.pixels[..., :3])
        skin = (r > 140) & (g > 0.6 * r) & (b > 0.45 * r)  # o dourado das estrelas do chapéu tem pouco azul
        outside_face = np.abs(frame.dx - head_x) > body["head"] - 1
        brim = frame.alpha & outside_face & (frame.up > body["brim"] + frame.bob)
        brim &= ~protected(class_id, frame.pixels[..., :3]) & ~skin
        out[brim] = 0
    high = frame.alpha & (frame.up > erase + frame.bob)
    seeds = high & (np.abs(frame.dx - head_x) <= 2)
    seen = seeds.copy()
    queue = deque(zip(*np.nonzero(seeds)))
    h, w = high.shape
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and high[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    out[seen] = 0
    return drop_floating(out, frame.up > body.get("brim", erase) + frame.bob)


def drop_floating(pixels: np.ndarray, region: np.ndarray) -> np.ndarray:
    """Tira de `region` o que sobrou solto depois de apagar (um fiapo de contorno da aba): fica só o que se liga ao
    corpo por baixo da região."""
    alpha = pixels[..., 3] > 0
    keep = alpha & ~region
    queue = deque(zip(*np.nonzero(keep)))
    h, w = alpha.shape
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not keep[ny, nx]:
                keep[ny, nx] = True
                queue.append((ny, nx))
    out = pixels.copy()
    out[alpha & ~keep] = 0
    return out


def build(visual: str = "iron") -> dict:
    sockets = json.loads((CHARS / "hand_sockets.json").read_text(encoding="utf-8"))
    preview_rows = []
    for class_id in CLASSES:
        for direction in DIRECTIONS:
            idle_px = np.asarray(Image.open(CHARS / class_id / f"{direction}.png").convert("RGBA"))
            strip = np.asarray(Image.open(CHARS / class_id / f"walk-{direction}.png").convert("RGBA"))
            idle_hand = sockets[class_id]["idle"][direction][0]
            frames = [Frame(idle_px, IDLE[1], IDLE[2], (idle_hand["dx"], idle_hand["dy"]), 0)]
            idle_height = IDLE[2] - int(np.nonzero((idle_px[..., 3] > 128).any(axis=1))[0].min())
            for i, s in enumerate(sockets[class_id]["walk"][direction]):
                px = strip[:, i * STRIP[0] : (i + 1) * STRIP[0]]
                top = int(np.nonzero((px[..., 3] > 128).any(axis=1))[0].min())
                frames.append(Frame(px, STRIP[1], STRIP[2], (s["dx"], s["dy"]), (STRIP[2] - top) - idle_height))
            centers = [head_center(f, class_id, direction) for f in frames]
            layers = {piece: [] for piece in PIECES}
            for frame, head_x in zip(frames, centers):
                for piece in PIECES:
                    layer = helm_layer(frame, class_id, direction, head_x) if piece == "helm" else \
                        body_piece_layer(frame, class_id, piece, direction, head_x)
                    layers[piece].append(layer)
            for piece in PIECES:
                out = CHARS / class_id / "armor" / visual / piece
                out.mkdir(parents=True, exist_ok=True)
                Image.fromarray(layers[piece][0]).save(out / f"{direction}.png")
                Image.fromarray(np.concatenate(layers[piece][1:], axis=1)).save(out / f"walk-{direction}.png")
            helmed = [helmed_body(f, class_id, x) for f, x in zip(frames, centers)]
            if BODY[class_id]["erase"] is not None:
                out = CHARS / class_id / "helmed"
                out.mkdir(parents=True, exist_ok=True)
                Image.fromarray(helmed[0]).save(out / f"{direction}.png")
                Image.fromarray(np.concatenate(helmed[1:], axis=1)).save(out / f"walk-{direction}.png")
            preview_rows.append((frames, helmed, layers))
    save_preview(preview_rows, visual)
    return {"armor": len(CLASSES) * len(DIRECTIONS) * len(PIECES) * 2}


def save_preview(rows: list, visual: str) -> None:
    """Folha de conferência: por classe e direção, o parado e 3 quadros da caminhada, sem e com a armadura inteira."""
    cell, scale, crop = 96, 2, 8
    picks = [0, 1, 3, 5]
    side = (cell - 2 * crop) * scale
    sheet = Image.new("RGBA", (side * len(picks) * 2, side * len(rows)), (54, 58, 54, 255))
    for r, (frames, helmed, layers) in enumerate(rows):
        for k, i in enumerate(picks):
            frame = frames[i]
            for dressed in (False, True):
                img = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                ox, oy = cell // 2 - frame.center, STRIP[2] - frame.feet
                img.alpha_composite(Image.fromarray(helmed[i] if dressed else frame.pixels), (ox, oy))
                if dressed:
                    for piece in PIECES:
                        img.alpha_composite(Image.fromarray(layers[piece][i]), (ox, oy))
                big = img.crop((crop, crop, cell - crop, cell - crop)).resize((side, side), Image.NEAREST)
                sheet.alpha_composite(big, ((k * 2 + int(dressed)) * side, r * side))
    WORK.mkdir(parents=True, exist_ok=True)
    sheet.save(WORK / f"armor_{visual}.png")


if __name__ == "__main__":
    print(build())
