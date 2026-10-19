"""Armadura vestida nos personagens, quadro a quadro (Elmo, Peitoral, Calça, Bota).

Para cada classe, direção e quadro (o parado de 64x64 e os 6 quadros da caminhada de 96x96), tudo é medido a partir do
pivô dos pés: dx = x - centro (32 ou 48) e "up" = pés - y (61 ou 78), em px acima dos pés. As linhas do corpo de cada
classe (BODY) foram marcadas na arte; na caminhada, o que fica acima do quadril sobe e desce com o balanço do quadro.

    boots   dos pés até a canela, em todas as direções
    pants   da canela ao quadril (quadril, coxas e joelhos), em todas as direções; nunca as mãos
    chest   em T de frente, de costas e nas diagonais: ombreiras largas (pontas de baixo arredondadas) e a couraça só no
            tronco, deixando braços e mãos de fora; de lado, couraça e ombreira cobrindo tronco e braço de cima, com o
            antebraço e a mão de fora; um cinto escuro separa o peitoral da calça
    helm    um estilo por classe, sempre acima dos olhos e sem apagar nada do corpo (é só uma camada por cima):
              bárbaro     elmo viking: calota da testa ao topo, nasal de 2 px entre os olhos (de frente e de lado) e dois
                          chifres curtos de osso
              homem-fera  elmo aberto: faixa grossa na testa, entre as orelhas (que ficam inteiras, por cima) e acima dos
                          olhos, e jugulares dos lados do rosto; de costas, a faixa na nuca
              elfo        tiara: aro fino na testa com ponta em V e uma gema no centro; cabelo, olhos e orelhas livres
              mago        o próprio chapéu pontudo vira metal: só os pixels do chapéu são recoloridos (mesmo sombreado,
                          forma e aba), a faixa e a fivela ficam metal claro

Peitoral, calça e bota recolorem os pixels do próprio sprite com a paleta do metal pelo brilho, então seguem o
contorno, o sombreado e o movimento do quadro. Nunca são pintados: o punho da espada (o quadrado que o cliente redesenha
por cima do cabo) e a outra mão, o cabelo e a capa do elfo, o cabelo e a barba brancos do mago, o rabo do homem-fera e a
cabeça (que é do elmo).

Saída: assets/characters/<classe>/armor/<visual>/<peça>/<direção>.png        (64x64, parado)
       assets/characters/<classe>/armor/<visual>/<peça>/walk-<direção>.png   (fita 96xN, caminhada)
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
#   brow             sobrancelha (as linhas logo abaixo dela acham o centro da cabeça)
# Larguras (meia largura, em px): head (cabeça), shoulder (ombreiras), torso (couraça), pants (pernas, de frente);
# side_center / side_half: o tronco de lado (olhando para leste; oeste é o espelho).
BODY = {
    "barbaro": dict(ankle=10, hip=23, belt=27, shoulder_bottom=39, shoulder_top=50, chin=40, nape=46, brow=52,
                    head=8, shoulder=17, torso=10, pants=14, side_center=-2, side_half=10),
    "elfo": dict(ankle=11, hip=24, belt=27, shoulder_bottom=35, shoulder_top=44, chin=43, nape=44, brow=50,
                 head=7, shoulder=13, torso=8, pants=10, side_center=1, side_half=7),
    "homem_fera": dict(ankle=10, hip=28, belt=30, shoulder_bottom=35, shoulder_top=45, chin=41, nape=44, brow=50,
                       head=7, shoulder=17, torso=10, pants=13, side_center=-2, side_half=9),
    "mago": dict(ankle=10, hip=24, belt=26, shoulder_bottom=29, shoulder_top=36, chin=33, nape=36, brow=44,
                 head=7, shoulder=13, torso=8, pants=14, side_center=-1, side_half=8),
}
# O elmo de cada classe, nas mesmas medidas (marcadas na arte; os olhos ficam em up 50 no bárbaro, 48-49 no
# homem-fera, 49-50 no elfo e abaixo da aba, em 41-43, no mago):
#   barbaro     brow/crown: base e topo da calota; half: meia largura; nasal: linhas que o nasal desce abaixo da base
#   homem_fera  band: linha de baixo da faixa da testa (3 linhas, a de cima encosta no pé das orelhas);
#               cheek_bottom: até onde descem as jugulares; cheek_rel: as colunas delas, a partir do centro da cabeça
#   elfo        band: linha de baixo do aro (2 linhas de metal e o contorno em cima); half: meia largura do aro
#   mago        floor: o chapéu é o que está ligado ao topo acima desta linha (a aba desce até aqui de lado)
HELM = {
    "barbaro": dict(brow=52, crown=60, half=8, nasal=4),
    "homem_fera": dict(band=50, cheek_bottom=44, cheek_rel=(5, 7)),
    "elfo": dict(band=51, half=6),
    "mago": dict(floor=40),
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
OUTLINE = (8, 8, 10)
SHINE = (226, 230, 238)
BONE = [(96, 84, 66), (186, 174, 146), (229, 222, 201)]  # ponta escura, sombra e o osso (#e5dec9) dos chifres
GEM = [(120, 16, 30), (200, 40, 60), (255, 150, 160)]  # sombra, cor e brilho da gema da tiara
# Chifre viking, a partir da borda da calota 3 linhas acima da base: (quantos px para fora, linhas acima da base, tom de
# BONE). Sai quase deitado, sobe e a ponta escura volta para dentro (meia-lua).
HORN = [(1, 2, 1), (2, 2, 1), (2, 3, 2), (3, 3, 2), (3, 4, 1), (4, 4, 2), (4, 5, 2), (4, 6, 0), (3, 7, 0)]


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


def paint(layer: np.ndarray, mask: np.ndarray, color) -> None:
    layer[mask, :3] = color
    layer[mask, 3] = 255


def ring(mask: np.ndarray) -> np.ndarray:
    """Os pixels logo fora da máscara (vizinhança de 4): o contorno de algo desenhado."""
    p = np.pad(mask, 1)
    return (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~mask


def front_column(frame: Frame, up: int, head_x: float, s: int) -> int | None:
    """De lado: a coluna (dx) mais à frente da cabeça nesta linha, já sem o contorno preto."""
    y = frame.feet - up
    cols = frame.dx[y][frame.alpha[y] & (np.abs(frame.dx[y] - head_x) <= 12)]
    if cols.size == 0:
        return None
    return int((cols * s).max() * s) - s


def face_center(head_x: float, direction: str) -> float:
    """Onde fica o meio do rosto: no centro da cabeça de frente, 2 px para o lado em que olha nas diagonais."""
    return head_x + 2 * facing_sign(direction) if direction in FRONT else head_x


def viking_helm(frame: Frame, direction: str, head_x: float) -> np.ndarray:
    """Bárbaro: a calota (meia elipse da base ao topo, luz de cima e da esquerda, um brilho, crista no meio, aro de 2
    linhas com rebites e contorno preto), o nasal descendo entre os olhos e os chifres de osso. De lado, o nasal fica na
    frente do rosto e só o chifre de trás aparece."""
    helm = HELM["barbaro"]
    brow, crown = helm["brow"] + frame.bob, helm["crown"] + frame.bob
    view, s = view_of(direction), facing_sign(direction)
    nx = (frame.dx - head_x) / helm["half"]
    ny = (frame.up - brow) / (crown - brow)
    dome = (ny >= 0) & (nx**2 + ny**2 <= 1.0)
    light = 0.55 - 0.35 * nx + 0.35 * ny - 0.25 * (nx**2 + ny**2)
    rgb = np.array(IRON, np.uint8)[np.clip((light * (len(IRON) - 1)).round().astype(int), 1, len(IRON) - 1)]
    rgb[((nx + 0.4) ** 2 + (ny - 0.62) ** 2) < 0.03] = SHINE
    if view != "side":
        rgb[(frame.dx == round(head_x)) & (frame.up >= brow + 2)] = IRON[4]
    band = dome & (frame.up < brow + 2)
    rgb[band] = IRON[2]
    rgb[band & (frame.up == brow + 1) & ((frame.dx - round(head_x)) % 3 == 0)] = IRON[4]
    layer = np.zeros_like(frame.pixels)
    paint(layer, dome, rgb[dome])
    padded = np.pad(dome, 1)
    outline = dome & ~(padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:])
    layer[outline & ~band, :3] = OUTLINE

    horns = np.zeros_like(dome)
    base_y = frame.feet - (brow + 3)
    edge = frame.dx[base_y][dome[base_y]]
    for side in ([-s] if view == "side" else [-1, 1]):
        start = edge.max() if side > 0 else edge.min()
        for out, rise, tone in HORN:
            y, x = frame.feet - (brow + rise), frame.center + start + side * out
            if 0 <= y < frame.feet and 0 <= x < dome.shape[1]:
                horns[y, x] = True
                layer[y, x] = (*BONE[tone], 255)
    paint(layer, ring(horns) & ~dome, OUTLINE)

    if view != "back":
        nasal = np.zeros_like(dome)
        for k in range(1, helm["nasal"] + 1):
            up = brow - k
            if view == "side":
                front = front_column(frame, up, head_x, s)
                cols = [] if front is None else [front, front - s]
            else:
                left = int(np.floor(face_center(head_x, direction)))
                cols = [left, left + 1]
            for col in cols:
                y, x = frame.feet - up, frame.center + col
                if frame.alpha[y, x]:
                    nasal[y, x] = True
                    lit = col == min(cols)  # a luz vem da esquerda
                    layer[y, x] = (*IRON[(4 if lit else 2) - (k == helm["nasal"])], 255)
    return layer


def war_band(frame: Frame, direction: str, head_x: float) -> np.ndarray:
    """Homem-fera: elmo aberto. Uma faixa grossa (3 linhas: borda escura, rebites, borda clara) na testa, entre as
    orelhas e acima dos olhos, só sobre a cabeça; dos lados do rosto, as jugulares descem até a bochecha. As orelhas
    ficam por cima, inteiras. De costas, a mesma faixa passa pela nuca, abaixo das orelhas; de lado, uma jugular atrás
    do olho."""
    helm = HELM["homem_fera"]
    view, s = view_of(direction), facing_sign(direction)
    bottom = helm["band"] + frame.bob
    rel = frame.dx - head_x
    head = BODY["homem_fera"]["head"]
    layer = np.zeros_like(frame.pixels)
    band = frame.alpha & (frame.up >= bottom) & (frame.up < bottom + 3) & (np.abs(rel) <= head + 1)
    tones = np.array([IRON[1], IRON[3], IRON[4]], np.uint8)[np.clip(frame.up - bottom, 0, 2)]
    paint(layer, band, tones[band])
    rivets = band & (frame.up == bottom + 1) & ((frame.dx - round(head_x)) % 3 == 0)
    paint(layer, rivets, IRON[5])
    if view == "back":
        return layer
    low, high = helm["cheek_rel"]
    if view == "side":
        cheek_cols = (rel * s >= -2) & (rel * s <= 0)
    else:
        cheek_cols = (np.abs(rel) >= low) & (np.abs(rel) <= high)
    cheek = frame.alpha & cheek_cols & (frame.up >= helm["cheek_bottom"] + frame.bob) & (frame.up < bottom)
    # Mais escura na borda de dentro (junto do rosto) e embaixo, clara no meio: uma placa com volume.
    inner = np.abs(rel) <= low + 0.5 if view != "side" else rel * s >= -0.5
    shade = np.where(inner | (frame.up == helm["cheek_bottom"] + frame.bob), 1, 4 - (np.abs(rel) > high - 0.5) * 2)
    paint(layer, cheek, np.array(IRON, np.uint8)[shade][cheek])
    return layer


def tiara(frame: Frame, direction: str, head_x: float) -> np.ndarray:
    """Elfo: um aro fino (2 linhas de metal, a de cima mais clara, e contorno escuro em cima) na testa, sobre o cabelo e a
    pele da cabeça só, descendo um pouco em volta dela; de frente e nas diagonais, uma ponta em V descendo entre os olhos e uma gema no centro; de lado,
    a gema na frente da cabeça; de costas, só o aro."""
    helm = HELM["elfo"]
    view, s = view_of(direction), facing_sign(direction)
    bottom = helm["band"] + frame.bob
    rel = frame.dx - head_x
    # O aro contorna a cabeça: desce 1 px nas pontas (de frente e de costas) e na metade de trás (de lado).
    if view == "side":
        across = frame.alpha & (rel * s >= -helm["half"]) & (rel * s <= helm["half"] + 2)
        dip = (rel * s < -1).astype(int) + (rel * s < -4)
    else:
        across = frame.alpha & (np.abs(rel) <= helm["half"])
        dip = (np.abs(rel) > helm["half"] - 2).astype(int)
    line = frame.up - bottom + dip
    layer = np.zeros_like(frame.pixels)
    paint(layer, across & (line == 0), IRON[3])
    paint(layer, across & (line == 1), IRON[5])
    paint(layer, across & (line == 2), IRON[0])
    if view == "back":
        return layer
    if view == "side":
        center = front_column(frame, bottom, head_x, s)
        if center is None:
            return layer
        center -= s
    else:
        center = round(face_center(head_x, direction))
    def at(dx: int, up: int, color) -> None:
        y, x = frame.feet - up, frame.center + dx
        if frame.alpha[y, x]:
            layer[y, x] = (*color, 255)
    if view != "side":
        at(center, bottom - 1, IRON[4])
        at(center - 1, bottom - 1, IRON[0])
        at(center + 1, bottom - 1, IRON[0])
        at(center, bottom - 2, IRON[0])
    at(center, bottom, GEM[1])
    at(center, bottom + 1, GEM[2])
    at(center - 1, bottom, GEM[0])
    at(center + 1, bottom, GEM[0])
    return layer


def armored_hat(frame: Frame, direction: str, head_x: float) -> np.ndarray:
    """Mago: o chapéu pontudo vira metal. O chapéu é o que está ligado ao topo do sprite (vizinhança de 4, sem passar
    pelo contorno preto) acima de `floor`; dentro dele, o azul e as sombras são recoloridos com a paleta do ferro pelo
    brilho (mesmo sombreado e forma), a faixa (as linhas com vinho de ponta a ponta) fica metal claro e a fivela dourada
    dela, o brilho. As estrelas douradas, o cabelo branco, os óculos e o rosto ficam como estão."""
    rgb = frame.pixels[..., :3]
    r, g, b = channels(rgb)
    dark = np.maximum(np.maximum(r, g), b) < 20
    region = frame.alpha & ~dark & (frame.up > HELM["mago"]["floor"] + frame.bob)
    rows = np.nonzero(region.any(axis=1))[0]
    layer = np.zeros_like(frame.pixels)
    if rows.size == 0:
        return layer
    hat = np.zeros_like(region)
    hat[rows[0]] = region[rows[0]]
    queue = deque(zip(*np.nonzero(hat)))
    h, w = region.shape
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and region[ny, nx] and not hat[ny, nx]:
                hat[ny, nx] = True
                queue.append((ny, nx))
    gold = (r > 150) & (g > 100) & (b < 0.6 * r)
    skin = (r > 140) & (g > 0.6 * r) & (b > 0.45 * r)
    wine = hat & (r > b + 20) & (g < 0.6 * r)
    band_rows = (wine.sum(axis=1) >= 4)[:, None]
    band = wine & band_rows
    buckle = hat & gold & band_rows
    metal = hat & ~gold & ~skin & ~protected("mago", rgb) & ~band
    paint(layer, metal, recolor(rgb, IRON)[metal])
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    paint(layer, band, np.array(IRON, np.uint8)[np.where(luminance < 0.24, 3, np.where(luminance < 0.3, 4, 5))][band])
    paint(layer, buckle, SHINE)
    return layer


HELMS = {"barbaro": viking_helm, "homem_fera": war_band, "elfo": tiara, "mago": armored_hat}


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
                    layer = HELMS[class_id](frame, direction, head_x) if piece == "helm" else \
                        body_piece_layer(frame, class_id, piece, direction, head_x)
                    layers[piece].append(layer)
            for piece in PIECES:
                out = CHARS / class_id / "armor" / visual / piece
                out.mkdir(parents=True, exist_ok=True)
                Image.fromarray(layers[piece][0]).save(out / f"{direction}.png")
                Image.fromarray(np.concatenate(layers[piece][1:], axis=1)).save(out / f"walk-{direction}.png")
            preview_rows.append((frames, layers))
    save_preview(preview_rows, visual)
    return {"armor": len(CLASSES) * len(DIRECTIONS) * len(PIECES) * 2}


def save_preview(rows: list, visual: str) -> None:
    """Folha de conferência: por classe e direção, o parado e 3 quadros da caminhada, sem e com a armadura inteira."""
    cell, scale, crop = 96, 2, 8
    picks = [0, 1, 3, 5]
    side = (cell - 2 * crop) * scale
    sheet = Image.new("RGBA", (side * len(picks) * 2, side * len(rows)), (54, 58, 54, 255))
    for r, (frames, layers) in enumerate(rows):
        for k, i in enumerate(picks):
            frame = frames[i]
            for dressed in (False, True):
                img = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                ox, oy = cell // 2 - frame.center, STRIP[2] - frame.feet
                img.alpha_composite(Image.fromarray(frame.pixels), (ox, oy))
                if dressed:
                    for piece in PIECES:
                        img.alpha_composite(Image.fromarray(layers[piece][i]), (ox, oy))
                big = img.crop((crop, crop, cell - crop, cell - crop)).resize((side, side), Image.NEAREST)
                sheet.alpha_composite(big, ((k * 2 + int(dressed)) * side, r * side))
    WORK.mkdir(parents=True, exist_ok=True)
    sheet.save(WORK / f"armor_{visual}.png")


if __name__ == "__main__":
    print(build())
