"""HUD dark fantasy: recorta os kits de interface, mede os vãos e desenha os ícones dos itens.

Entrada: assets/tilesets/interface/hud_status_kit.png e hud_inventario_kit.png (fora do git: guarde uma cópia).
Saída:   assets/ui/hud/*.png          peças sem fundo, reduzidas por média de área para o tamanho do HUD
         assets/ui/hud/portrait-<classe>.png   rosto de cada classe (do sprite parado de frente)
         assets/ui/hud/items/<item>.png        ícone de cada item: 16x16 desenhado aqui, ou 48x48 recortado da folha
                                               assets/ui/Itens.png (equipamentos da Forja; fora do git)
         assets/ui/hud/status_scroll.png       pergaminho dos status (ao lado da janela de inventário), desenhado aqui
         assets/ui/hud/layout.json    onde ficam os vãos (retrato, calhas, slots da barra, couro da mochila),
                                      medidos na própria arte: o cliente não tem coordenada escrita à mão
         tools/assets/build/contato-hud.png    folha de conferência

O tamanho de cada peça está em "pixels de HUD": o cliente amplia tudo por um fator inteiro (pixels nítidos).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_hud.py
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_city import background_mask, components, contact_sheet, enclosed_holes, load_rgba, resize  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "tilesets" / "interface"
OUT = ROOT / "assets" / "ui" / "hud"
CHARS = ROOT / "assets" / "characters"
WORK = ROOT / "tools" / "assets" / "build"
CLASSES = ["mago", "elfo", "barbaro", "homem_fera"]

# Peças: centro aproximado na imagem original (2816x1536), largura final em pixels de HUD, e se tira buracos
# presos (só onde há ornamento vazado; nos slots brilhantes, o "buraco" claro é o brilho da moldura).
STATUS = {
    "status_frame": ((878, 330), 264, True),
    "bar_sample_hp": ((1040, 722), None, False),
    "bar_sample_mp": ((960, 844), None, False),
    "bar_sample_hunger": ((960, 966), None, False),
    "icon_hp": ((1962, 810), 16, False),
    "icon_mp": ((2198, 810), 16, False),
    "icon_hunger": ((2438, 810), 16, False),
    "hotbar_dock": ((1400, 1286), 360, True),
}
# No inventário, a largura pode ser uma lista: a mesma peça sai em vários tamanhos (a primeira sem sufixo, as outras
# com "-<tamanho>"). Reduzir a arte grande direto para cada tamanho fica mais limpo do que reduzir uma peça já pequena.
# Molduras de raridade: 48 na barra rápida, 34 na mochila, 28 no altar de essências. Equipamento: 40.
SLOT_SIZES = [48, 34, 28]
INVENTORY = {
    "inv_panel": ((468, 518), [360], True),
    "slot_common": ((1100, 628), SLOT_SIZES, False),
    "slot_rare": ((1552, 628), SLOT_SIZES, False),
    "slot_epic": ((2006, 628), SLOT_SIZES, False),
    "slot_legendary": ((2458, 628), SLOT_SIZES, False),
    "equip_helm": ((328, 1228), [40], False),
    "equip_chest": ((758, 1228), [40], False),
    "equip_weapon": ((1190, 1228), [40], False),
    "equip_shield": ((1622, 1228), [40], False),
    "equip_boots": ((2054, 1228), [40], False),
    "equip_ring": ((2486, 1228), [40], False),
}
# Sementes (na imagem original) dos vãos escuros que o cliente precisa saber onde ficam.
GUTTER_SEEDS = {"hp": (1100, 196), "mp": (1100, 324), "hunger": (1100, 456)}
PORTRAIT_SEED = (370, 330)
DOCK_SEEDS = [(810 + i * 236, 1280) for i in range(6)]
LEATHER_SEED = (468, 560)


# ---------------------------------------------------------------- recorte


def cleaned(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Duas versões sem fundo: só o fundo de fora tirado, e também sem os buracos presos na arte."""
    background = background_mask(rgba)
    outer = rgba.copy()
    outer[background, 3] = 0
    holes = outer.copy()
    holes[enclosed_holes(rgba, background), 3] = 0
    return outer, holes


def boxes_of(rgba: np.ndarray) -> list[tuple[int, int, int, int]]:
    return components(rgba[:, :, 3] > 8, min_area=3000)


def box_at(boxes: list[tuple[int, int, int, int]], x: int, y: int) -> tuple[int, int, int, int]:
    inside = [b for b in boxes if b[0] <= x < b[2] and b[1] <= y < b[3]]
    if len(inside) != 1:
        raise SystemExit(f"esperava 1 peça em ({x},{y}), achei {len(inside)}: {boxes}")
    return inside[0]


def dark_region(rgba: np.ndarray, seed: tuple[int, int], tolerance: int = 8) -> tuple[int, int, int, int]:
    """Caixa do vão escuro em volta de seed: pixels opacos com cor parecida com a da semente, ligados a ela."""
    h, w = rgba.shape[:2]
    rgb = rgba[:, :, :3].astype(int)
    target = rgb[seed[1], seed[0]]
    near = (np.abs(rgb - target).max(axis=2) <= tolerance) & (rgba[:, :, 3] > 200)
    seen = np.zeros((h, w), bool)
    seen[seed[1], seed[0]] = True
    queue = deque([seed])
    x0 = x1 = seed[0]
    y0 = y1 = seed[1]
    while queue:
        x, y = queue.popleft()
        x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((nx, ny))
    return x0, y0, x1 + 1, y1 + 1


def scaled_rect(rect: tuple[int, int, int, int], origin: tuple[int, int], k: float) -> dict:
    x0, y0, x1, y1 = rect
    left, top = round((x0 - origin[0]) * k), round((y0 - origin[1]) * k)
    right, bottom = round((x1 - origin[0]) * k), round((y1 - origin[1]) * k)
    return {"x": left, "y": top, "w": right - left, "h": bottom - top}


def fill_strip(sample: np.ndarray, width: int, height: int) -> Image.Image:
    """Tira de preenchimento com 100% do vão: pega o miolo da parte colorida da amostra (as amostras azul e âmbar
    estão cheias só até ~60%) e estica para o tamanho do vão. As pontas arredondadas da amostra ficam de fora."""
    rgb = sample[:, :, :3].astype(int)
    colored = (rgb.max(axis=2) - rgb.min(axis=2) > 60) & (rgb.max(axis=2) > 90) & (sample[:, :, 3] > 200)
    ys, xs = np.nonzero(colored)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    margin = (x1 - x0) // 10
    return resize(sample[y0:y1, x0 + margin : x1 - margin], width, height)


# ---------------------------------------------------------------- retratos


# Do alto da testa até o meio do rosto, em pixels do sprite. O mago mostra pouca pele (chapéu em cima, barba
# embaixo): o rosto dele fica mais para baixo da primeira linha de pele.
FACE_BELOW_FOREHEAD = {"mago": 11}
FACE_BELOW_FOREHEAD_DEFAULT = 6


def portrait(class_id: str, width: int, height: int) -> Image.Image:
    """Rosto e ombros do sprite parado de frente, sem reduzir (o HUD mostra em 2x). O recorte é centrado no rosto:
    a primeira linha com pele (a testa; o chapéu do mago fica acima) mais FACE_BELOW_FOREHEAD. Pelo centro da pele
    toda não dá: bárbaro, elfo e homem fera têm o peito de fora."""
    sprite = np.asarray(Image.open(CHARS / class_id / "south.png").convert("RGBA"))
    rgb = sprite[:, :, :3].astype(int)
    opaque = sprite[:, :, 3] > 8
    rows = np.nonzero(opaque.any(axis=1))[0]
    top, bottom = int(rows[0]), int(rows[-1])
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = opaque & (r > 150) & (g > 90) & (b > 50) & (r > g) & (g > b) & (r - b > 40)
    skin[top + (bottom - top) // 2 :] = False
    if skin.any():
        forehead = int(np.nonzero(skin.any(axis=1))[0][0])
        cy = forehead + FACE_BELOW_FOREHEAD.get(class_id, FACE_BELOW_FOREHEAD_DEFAULT)
        cx = int(np.nonzero(skin[forehead : forehead + 4].any(axis=0))[0].mean())
    else:
        cols = np.nonzero(opaque[top : top + 14].any(axis=0))[0]
        cy, cx = top + 10, (int(cols[0]) + int(cols[-1])) // 2
    left = max(0, min(sprite.shape[1] - width, cx - width // 2))
    upper = max(0, min(sprite.shape[0] - height, cy - height // 2 + 2))
    return Image.fromarray(np.ascontiguousarray(sprite[upper : upper + height, left : left + width]))


# ---------------------------------------------------------------- ícones dos itens

OUTLINE = (24, 16, 14, 255)
ICON = 16


def ellipse(mask: np.ndarray, cx: float, cy: float, rx: float, ry: float) -> None:
    yy, xx = np.mgrid[0:ICON, 0:ICON] + 0.5
    mask |= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


def polygon(mask: np.ndarray, points: list[tuple[float, float]]) -> None:
    yy, xx = np.mgrid[0:ICON, 0:ICON] + 0.5
    inside = np.zeros_like(mask)
    n = len(points)
    for i in range(n):
        (xa, ya), (xb, yb) = points[i], points[(i + 1) % n]
        crosses = (ya > yy) != (yb > yy)
        x_at = xa + (yy - ya) * (xb - xa) / np.where(yb == ya, 1e-9, yb - ya)
        inside ^= crosses & (xx < x_at)
    mask |= inside


def paint(layers: list[tuple[np.ndarray, tuple[int, int, int]]]) -> Image.Image:
    """Camadas de (máscara, cor), de baixo para cima. Cada camada ganha luz em cima/à esquerda e sombra embaixo/à
    direita; depois um contorno escuro em volta de tudo (o jeito de pixel art)."""
    img = np.zeros((ICON, ICON, 4), np.uint8)
    every = np.zeros((ICON, ICON), bool)
    for mask, color in layers:
        base = np.array(color, float)
        padded = np.pad(mask, 1)
        lit = mask & (~padded[:-2, 1:-1] | ~padded[1:-1, :-2])
        shade = mask & (~padded[2:, 1:-1] | ~padded[1:-1, 2:])
        rgb = np.where(lit[..., None], np.minimum(255, base * 1.3 + 20), np.where(shade[..., None], base * 0.62, base))
        img[mask, :3] = rgb[mask].astype(np.uint8)
        img[mask, 3] = 255
        every |= mask
    padded = np.pad(every, 1)
    ring = ~every & (padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:])
    img[ring] = OUTLINE
    return Image.fromarray(img)


def dot(img: Image.Image, x: int, y: int, color: tuple[int, int, int]) -> Image.Image:
    img.putpixel((x, y), (*color, 255))
    return img


def icon_ration() -> Image.Image:
    loaf, crust = np.zeros((ICON, ICON), bool), np.zeros((ICON, ICON), bool)
    ellipse(loaf, 8, 9.5, 6.5, 4)
    ellipse(crust, 8, 8, 5, 2.2)
    img = paint([(loaf, (150, 92, 44)), (crust, (196, 136, 72))])
    for x, y in ((5, 8), (6, 7), (8, 8), (9, 7), (11, 8), (12, 7)):  # cortes na casca
        dot(img, x, y, (110, 62, 28))
    return img


def icon_pelt(color: tuple[int, int, int]) -> Image.Image:
    hide = np.zeros((ICON, ICON), bool)
    ellipse(hide, 8, 8.5, 5, 4.5)
    for cx, cy in ((3.5, 5), (12.5, 5), (3.5, 12.5), (12.5, 12.5)):  # patas
        ellipse(hide, cx, cy, 1.8, 1.6)
    ellipse(hide, 8, 3.2, 2.2, 1.8)  # cabeça
    img = paint([(hide, color)])
    for x, y in ((7, 8), (9, 9), (8, 11)):  # pelagem
        dot(img, x, y, tuple(int(c * 0.75) for c in color))
    return img


def icon_tooth() -> Image.Image:
    tooth, root = np.zeros((ICON, ICON), bool), np.zeros((ICON, ICON), bool)
    polygon(tooth, [(5, 3), (11, 3), (11.5, 6), (9.5, 11), (8, 14), (7, 10.5), (5.5, 7)])
    polygon(root, [(5, 2), (11, 2), (11, 4.5), (5, 4.5)])
    return paint([(tooth, (232, 222, 196)), (root, (150, 96, 70))])


def icon_crystal() -> Image.Image:
    left, right = np.zeros((ICON, ICON), bool), np.zeros((ICON, ICON), bool)
    polygon(left, [(8, 1.5), (8, 14.5), (4.5, 10), (5, 5)])
    polygon(right, [(8, 1.5), (11, 5), (11.5, 10), (8, 14.5)])
    img = paint([(left, (90, 230, 255)), (right, (30, 150, 200))])
    return dot(dot(img, 7, 4, (230, 255, 255)), 6, 6, (200, 250, 255))


def icon_goo() -> Image.Image:
    blob = np.zeros((ICON, ICON), bool)
    ellipse(blob, 8, 10.5, 6, 3.6)
    ellipse(blob, 8, 7, 3.4, 3.2)
    ellipse(blob, 12.5, 13, 1.2, 1.4)  # gota escorrendo
    img = paint([(blob, (110, 210, 44))])
    return dot(dot(img, 6, 6, (210, 255, 160)), 7, 5, (210, 255, 160))


def icon_essence(color: tuple[int, int, int]) -> Image.Image:
    orb, core = np.zeros((ICON, ICON), bool), np.zeros((ICON, ICON), bool)
    ellipse(orb, 8, 8.5, 5.6, 5.6)
    ellipse(core, 8.6, 9.2, 2.6, 2.6)
    img = paint([(orb, color), (core, tuple(min(255, int(c * 1.25)) for c in color))])
    for x, y in ((5, 5), (6, 5), (5, 6)):  # reflexo
        dot(img, x, y, (255, 255, 255))
    for x, y in ((1, 3), (14, 2), (14, 13)):  # faíscas em volta
        dot(img, x, y, tuple(min(255, int(c * 1.3)) for c in color))
    return img


def icon_sword() -> Image.Image:
    blade, guard, grip = (np.zeros((ICON, ICON), bool) for _ in range(3))
    polygon(blade, [(13.5, 1.5), (14.5, 2.5), (6, 11), (5, 10)])
    polygon(guard, [(2.5, 8.5), (3.5, 7.5), (8.5, 12.5), (7.5, 13.5)])
    polygon(grip, [(4.5, 11.5), (5.5, 12.5), (2.5, 15.5), (1.5, 14.5)])
    return paint([(blade, (196, 204, 214)), (guard, (150, 110, 60)), (grip, (96, 64, 40))])


def icon_lock() -> Image.Image:
    shackle, body = np.zeros((ICON, ICON), bool), np.zeros((ICON, ICON), bool)
    ellipse(shackle, 8, 6, 4, 4.2)
    hole = np.zeros((ICON, ICON), bool)
    ellipse(hole, 8, 6, 2.2, 2.6)
    shackle &= ~hole
    polygon(body, [(3, 7.5), (13, 7.5), (13, 14), (3, 14)])
    img = paint([(shackle, (120, 120, 128)), (body, (160, 128, 60))])
    return dot(dot(img, 8, 10, (40, 28, 16)), 8, 11, (40, 28, 16))


def icon_coin() -> Image.Image:
    """Moeda pequena (11x11), do tamanho do texto da plaqueta: mostrada em tamanho real, sem reamostrar."""
    rim, face = np.zeros((ICON, ICON), bool), np.zeros((ICON, ICON), bool)
    ellipse(rim, 5.5, 5.5, 4.4, 4.4)
    ellipse(face, 5.5, 5.5, 2.5, 2.5)
    img = paint([(rim, (190, 132, 36)), (face, (240, 192, 64))])
    dot(dot(img, 4, 3, (255, 240, 170)), 3, 4, (255, 240, 170))  # brilho
    return img.crop((0, 0, 11, 11))


# Desenhos do HUD que não são itens.

# ---------------------------------------------------------------- folha oficial dos equipamentos (Itens.png)

# Arte do dono do projeto: grade de 4 colunas x 2 linhas sobre fundo preto (ou transparente). Linha de cima: elmo,
# peitoral, calça e bota de ferro; de baixo: amuleto, anel e as molduras dos slots vazios de calça e amuleto. Fica fora
# do git, como os kits da HUD.
ITEMS_SHEET = ROOT / "assets" / "ui" / "Itens.png"
SHEET_ICONS = {
    (0, 0): "elmo_ferro",
    (1, 0): "peitoral_ferro",
    (2, 0): "calca_ferro",
    (3, 0): "bota_ferro",
    (0, 1): "amuleto_runico",
    (1, 1): "anel_vitalidade",
}
SHEET_SLOTS = {(2, 1): "equip_pants", (3, 1): "equip_amulet"}
# Ícone de item da folha: quadrado, no tamanho em que a mochila, os slots de equipamento e o quadro de inspeção o
# mostram (48 px), reduzido por média de área; a peça ocupa o quadrado menos ICON_MARGIN de cada lado.
SHEET_ICON = 48
ICON_MARGIN = 0.06
BACKGROUND_MAX = 14  # brilho máximo de um pixel de fundo preto
HOLE_MIN = 30  # vão interno de preto puro maior que isto (px da folha) é fundo preso, não contorno


def clear_background(cell: np.ndarray, holes: bool) -> np.ndarray:
    """Fundo preto vira transparente: o que é preto e se liga à borda da célula (flood-fill a partir da borda). Com
    `holes`, também os vãos internos de preto (o furo do anel, o laço da corrente), se forem maiores que um contorno.
    Contornos e sombras do desenho são mais claros que o fundo e continuam."""
    out = cell.copy()
    dark = (out[..., :3].max(axis=2) <= BACKGROUND_MAX) | (out[..., 3] < 8)
    h, w = dark.shape
    seen = np.zeros_like(dark)
    queue = deque((y, x) for y in range(h) for x in (0, w - 1) if dark[y, x])
    queue.extend((y, x) for x in range(w) for y in (0, h - 1) if dark[y, x])
    for y, x in queue:
        seen[y, x] = True
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    if holes:
        for component in dark_groups(dark & ~seen):
            if len(component) >= HOLE_MIN:
                for y, x in component:
                    seen[y, x] = True
    out[seen, 3] = 0
    return out


def dark_groups(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """Grupos de pixels ligados (vizinhança de 4) de uma máscara."""
    h, w = mask.shape
    left = mask.copy()
    groups = []
    for y0, x0 in zip(*np.nonzero(left)):
        if not left[y0, x0]:
            continue
        left[y0, x0] = False
        group, queue = [], deque([(y0, x0)])
        while queue:
            y, x = queue.popleft()
            group.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and left[ny, nx]:
                    left[ny, nx] = False
                    queue.append((ny, nx))
        groups.append(group)
    return groups


def crop_to_content(cell: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(cell[..., 3] > 16)
    return cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def area_resize(art: np.ndarray, width: int, height: int) -> Image.Image:
    """Redução por média de área com alfa pré-multiplicado (sem franja escura na borda)."""
    return Image.fromarray(art).convert("RGBa").resize((width, height), Image.BOX).convert("RGBA")


def sheet_icon(art: np.ndarray) -> Image.Image:
    """A peça centrada num quadrado com margem, reduzida para SHEET_ICON."""
    h, w = art.shape[:2]
    side = round(max(h, w) / (1 - 2 * ICON_MARGIN))
    square = np.zeros((side, side, 4), np.uint8)
    square[(side - h) // 2 : (side - h) // 2 + h, (side - w) // 2 : (side - w) // 2 + w] = art
    return area_resize(square, SHEET_ICON, SHEET_ICON)


def opaque_luminance(image: Image.Image) -> float:
    px = np.asarray(image.convert("RGBA")).astype(float)
    solid = px[..., 3] > 128
    return float((0.299 * px[..., 0] + 0.587 * px[..., 1] + 0.114 * px[..., 2])[solid].mean())


def sheet_slot(art: np.ndarray, size: tuple[int, int], target_luminance: float) -> Image.Image:
    """Moldura de slot vazio da folha no tamanho dos outros slots de equipamento, com o brilho médio deles."""
    image = area_resize(art, *size)
    px = np.asarray(image).astype(float)
    gain = target_luminance / max(1.0, opaque_luminance(image))
    px[..., :3] = np.clip(px[..., :3] * gain, 0, 255)
    return Image.fromarray(px.astype(np.uint8))


def items_from_sheet(layout: dict, sheet: list[tuple[str, Image.Image]]) -> None:
    """Recorta a folha: 6 ícones em items/<item>.png e as 2 molduras de slot vazio, no tamanho e no brilho das 6
    molduras que já existem (equip_helm ... equip_ring)."""
    art = np.asarray(Image.open(ITEMS_SHEET).convert("RGBA"))
    cell_w, cell_h = art.shape[1] // 4, art.shape[0] // 2
    cell = lambda col, row: art[row * cell_h : (row + 1) * cell_h, col * cell_w : (col + 1) * cell_w]
    for (col, row), item in SHEET_ICONS.items():
        image = sheet_icon(crop_to_content(clear_background(cell(col, row), holes=True)))
        image.save(OUT / "items" / f"{item}.png")
        sheet.append((item, image.resize((SHEET_ICON * 2, SHEET_ICON * 2), Image.NEAREST)))
    others = ["equip_helm", "equip_chest", "equip_boots", "equip_weapon", "equip_shield", "equip_ring"]
    target = float(np.mean([opaque_luminance(Image.open(OUT / f"{name}.png")) for name in others]))
    size = (layout["equip_ring"]["w"], layout["equip_ring"]["h"])
    for (col, row), name in SHEET_SLOTS.items():
        image = sheet_slot(crop_to_content(clear_background(cell(col, row), holes=False)), size, target)
        image.save(OUT / f"{name}.png")
        sheet.append((name, image))
        layout[name] = dict(layout["equip_ring"])


EXTRA_ICONS = {"weapon": icon_sword, "lock": icon_lock, "coin": icon_coin}

# Um ícone por item de ITEMS (shared/src/balance.ts), desenhado aqui; os equipamentos da Forja vêm da folha oficial
# (SHEET_ICONS). Item novo sem ícone aparece com a sigla no slot.
ICONS = {
    "racao": icon_ration,
    "pele_de_rato": lambda: icon_pelt((140, 134, 128)),
    "pele_de_lobo": lambda: icon_pelt((104, 122, 140)),
    "dente_de_goblin": icon_tooth,
    "fragmento_de_cristal": icon_crystal,
    "gosma_de_slime": icon_goo,
    "essencia_rato": lambda: icon_essence((179, 157, 219)),
    # essencia_lobo e essencia_goblin (e as de slime e gnomo) vêm da arte oficial: tools/assets/process_loot.py.
    "essencia_goblin_rara": lambda: icon_essence((255, 200, 60)),
    "espada_ferro": icon_sword,
}


# ---------------------------------------------------------------- pergaminho de status

# Pergaminho aberto ao lado da janela de inventário (status do personagem): papel envelhecido da cor do Paper UI
# (o mesmo da ficha de registro), com manchas e bordas escurecidas, entre dois rolos de papel com pontas de madeira.
# Desenhado aqui, em pixel art, no tamanho exibido (1x na tela-base, como o painel da mochila).
SCROLL = (300, 640)
SCROLL_ROLL = 30  # altura de cada rolo
SCROLL_KNOB = 14  # largura da ponta de madeira de cada lado
SCROLL_MARGIN = 22  # recuo do papel em relação às pontas dos rolos
PAPER = np.array((212, 176, 119))
PAPER_DARK = np.array((150, 108, 62))
INK = (60, 36, 20)
WOOD = ((44, 26, 16), (92, 58, 32), (128, 84, 46), (164, 112, 62))  # contorno, sombra, base, brilho
ROLL_PAPER = ((60, 40, 24), (150, 112, 70), (196, 160, 106), (226, 198, 148))


def status_scroll() -> tuple[Image.Image, dict]:
    w, h = SCROLL
    rng = np.random.default_rng(7)
    px = np.zeros((h, w, 4), np.uint8)
    half = SCROLL_ROLL // 2
    x0, x1 = SCROLL_MARGIN, w - SCROLL_MARGIN  # papel em [x0, x1)
    y0, y1 = half, h - half
    # Papel: cor base com ruído em blocos de 2x2 (textura de fibra), escurecendo nas bordas e sob os rolos.
    noise = np.kron(rng.normal(0, 5, ((y1 - y0 + 1) // 2, (x1 - x0 + 1) // 2)), np.ones((2, 2)))[: y1 - y0, : x1 - x0]
    ys, xs = np.mgrid[y0:y1, x0:x1]
    edge = np.minimum(xs - x0, x1 - 1 - xs)
    near_roll = np.minimum(ys - y0, y1 - 1 - ys)
    shade = np.clip(1 - edge / 14, 0, 1) * 0.45 + np.clip(1 - near_roll / 22, 0, 1) * 0.5
    color = PAPER[None, None, :] * (1 - shade[..., None]) + PAPER_DARK[None, None, :] * shade[..., None] + noise[..., None]
    # Manchas de idade: elipses levemente mais escuras.
    for _ in range(9):
        cx, cy = rng.uniform(x0 + 20, x1 - 20), rng.uniform(y0 + 40, y1 - 40)
        rx, ry = rng.uniform(10, 34), rng.uniform(8, 26)
        spot = ((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2 <= 1
        color[spot] -= rng.uniform(5, 11)
    px[y0:y1, x0:x1, :3] = np.clip(color, 0, 255).astype(np.uint8)
    px[y0:y1, x0:x1, 3] = 255
    # Bordas do papel um pouco irregulares, com contorno escuro.
    for y in range(y0, y1):
        for side in (x0, x1 - 1):
            bite = int(rng.integers(0, 3) == 0)
            inner = side + bite if side == x0 else side - bite
            if bite:
                px[y, side, 3] = 0
            px[y, inner, :3] = INK
    # Rolos (em cima e embaixo): papel enrolado com sombreado horizontal e pontas de madeira.
    for top in (0, h - SCROLL_ROLL):
        for i in range(SCROLL_ROLL):
            t = i / (SCROLL_ROLL - 1)
            # Cilindro: brilho um pouco acima do meio, sombra embaixo, contorno nas pontas.
            level = 0 if i in (0, SCROLL_ROLL - 1) else 3 if 0.2 < t < 0.42 else 2 if t < 0.7 else 1
            px[top + i, SCROLL_KNOB : w - SCROLL_KNOB, :3] = ROLL_PAPER[level]
            px[top + i, SCROLL_KNOB : w - SCROLL_KNOB, 3] = 255
            knob_level = 0 if i in (0, SCROLL_ROLL - 1) else 3 if 0.2 < t < 0.4 else 2 if t < 0.7 else 1
            # Pontas arredondadas: encolhem perto do topo e da base do rolo.
            inset = 3 if i in (0, SCROLL_ROLL - 1) else 1 if i in (1, SCROLL_ROLL - 2) else 0
            for x in list(range(inset, SCROLL_KNOB + 2)) + list(range(w - SCROLL_KNOB - 2, w - inset)):
                px[top + i, x, :3] = WOOD[knob_level]
                px[top + i, x, 3] = 255
        # Contorno das pontas e a linha da borda do papel enrolado.
        for x in (SCROLL_KNOB + 2, w - SCROLL_KNOB - 3):
            px[top + 1 : top + SCROLL_ROLL - 1, x, :3] = WOOD[0]
        edge_row = top + (SCROLL_ROLL - 4 if top == 0 else 3)
        px[edge_row, SCROLL_KNOB + 3 : w - SCROLL_KNOB - 3, :3] = ROLL_PAPER[0]
    # Onde vai o texto: o papel entre os rolos, com folga.
    content = {"x": x0 + 14, "y": SCROLL_ROLL + 6, "w": (x1 - x0) - 28, "h": h - 2 * SCROLL_ROLL - 12}
    return Image.fromarray(px), content

# ---------------------------------------------------------------- montagem


# Janela de inventário em duas alas: o painel alargado sem esticar cantos, brasão e arabescos. Cresce repetindo
# colunas e uma linha lisas (só viga, costura e couro): as colunas entre as pontas do brasão e o centro dele, a linha
# no meio dos pilares. Exibido em 1x na tela-base, fica nítido.
WIDE_PANEL = (490, 640)
WIDE_COLUMNS = (118, 242)
WIDE_ROW = 250


def widen_panel(panel: np.ndarray, width: int, height: int) -> np.ndarray:
    h, w = panel.shape[:2]
    extra = width - w
    left, right = WIDE_COLUMNS
    grow = [extra // 2, extra - extra // 2]
    parts = [panel[:, :left], np.repeat(panel[:, left : left + 1], grow[0], axis=1), panel[:, left:right],
             np.repeat(panel[:, right : right + 1], grow[1], axis=1), panel[:, right:]]
    wide = np.concatenate(parts, axis=1)
    rows = height - h
    return np.concatenate([wide[:WIDE_ROW], np.repeat(wide[WIDE_ROW : WIDE_ROW + 1], rows, axis=0), wide[WIDE_ROW:]], axis=0)


def main() -> None:
    (OUT / "items").mkdir(parents=True, exist_ok=True)
    layout: dict = {}
    sheet: list[tuple[str, Image.Image]] = []

    status = load_rgba(SRC / "hud_status_kit.png")
    outer, holes = cleaned(status)
    boxes = boxes_of(holes)
    crops: dict[str, tuple[np.ndarray, tuple[int, int, int, int]]] = {}
    for name, ((cx, cy), width, no_holes) in STATUS.items():
        box = box_at(boxes, cx, cy)
        x0, y0, x1, y1 = box
        crops[name] = ((holes if no_holes else outer)[y0:y1, x0:x1], box)
        if width is None:
            continue
        art = crops[name][0]
        height = round(art.shape[0] * width / art.shape[1])
        image = resize(art, width, height)
        image.save(OUT / f"{name}.png")
        sheet.append((name, image))
        layout[name] = {"w": width, "h": height}

    # Vãos do quadro: retrato e as 3 calhas, na escala do quadro.
    frame_art, frame_box = crops["status_frame"]
    k = layout["status_frame"]["w"] / frame_art.shape[1]
    origin = frame_box[:2]
    layout["portrait"] = scaled_rect(dark_region(status, PORTRAIT_SEED), origin, k)
    layout["gutters"] = {key: scaled_rect(dark_region(status, seed), origin, k) for key, seed in GUTTER_SEEDS.items()}
    for key, rect in layout["gutters"].items():
        strip = fill_strip(crops[f"bar_sample_{key}"][0], rect["w"], rect["h"])
        strip.save(OUT / f"bar_{key}.png")
        sheet.append((f"bar_{key}", strip.resize((strip.width, strip.height * 4), Image.NEAREST)))

    dock_art, dock_box = crops["hotbar_dock"]
    kd = layout["hotbar_dock"]["w"] / dock_art.shape[1]
    layout["dock_slots"] = [scaled_rect(dark_region(status, seed), dock_box[:2], kd) for seed in DOCK_SEEDS]

    inventory = load_rgba(SRC / "hud_inventario_kit.png")
    outer, holes = cleaned(inventory)
    boxes = boxes_of(holes)
    for name, ((cx, cy), widths, no_holes) in INVENTORY.items():
        x0, y0, x1, y1 = box = box_at(boxes, cx, cy)
        art = (holes if no_holes else outer)[y0:y1, x0:x1]
        for i, width in enumerate(widths):
            height = round(art.shape[0] * width / art.shape[1])
            image = resize(art, width, height)
            image.save(OUT / (f"{name}.png" if i == 0 else f"{name}-{width}.png"))
            sheet.append((f"{name} {width}", image))
        width = widths[0]
        layout[name] = {"w": width, "h": round(art.shape[0] * width / art.shape[1])}
        if name == "inv_panel":
            layout["leather"] = scaled_rect(dark_region(inventory, LEATHER_SEED, tolerance=14), box[:2], width / art.shape[1])
            panel = np.asarray(Image.open(OUT / "inv_panel.png").convert("RGBA"))
            wide = Image.fromarray(widen_panel(panel, *WIDE_PANEL))
            wide.save(OUT / "inv_panel_wide.png")
            sheet.append(("inv_panel_wide", wide))
            leather = layout["leather"]
            layout["inv_panel_wide"] = {"w": WIDE_PANEL[0], "h": WIDE_PANEL[1]}
            layout["leather_wide"] = {"x": leather["x"], "y": leather["y"], "w": leather["w"] + WIDE_PANEL[0] - width,
                                      "h": leather["h"] + WIDE_PANEL[1] - layout["inv_panel"]["h"]}

    # Equipamentos da Forja e os slots de calça e amuleto: recortes da folha oficial (Itens.png).
    items_from_sheet(layout, sheet)

    scroll, content = status_scroll()
    scroll.save(OUT / "status_scroll.png")
    sheet.append(("status_scroll", scroll))
    layout["status_scroll"] = {"w": SCROLL[0], "h": SCROLL[1], "content": content}

    p = layout["portrait"]
    for class_id in CLASSES:
        image = portrait(class_id, p["w"] // 2, p["h"] // 2)
        image.save(OUT / f"portrait-{class_id}.png")
        sheet.append((f"retrato {class_id}", image.resize((image.width * 2, image.height * 2), Image.NEAREST)))

    for item, draw in ICONS.items():
        image = draw()
        image.save(OUT / "items" / f"{item}.png")
        sheet.append((item, image.resize((ICON * 3, ICON * 3), Image.NEAREST)))
    for name, draw in EXTRA_ICONS.items():
        image = draw()
        image.save(OUT / f"icon_{name}.png")
        sheet.append((name, image.resize((ICON * 3, ICON * 3), Image.NEAREST)))

    (OUT / "layout.json").write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
    contact_sheet(sheet, WORK / "contato-hud.png", 280)
    print(json.dumps({k: v for k, v in layout.items() if k in ("portrait", "gutters", "dock_slots", "leather")}))


if __name__ == "__main__":
    main()
