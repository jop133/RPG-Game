"""Processa a arte nova da cidade para o jogo: tira o fundo, recorta e reduz.

Entrada: assets/tilesets/novos tilesets/ (Casa 1..10, Portal, chao_cidade, enfeites_rua).
Saída:   assets/tilesets/city/          (vai para o jogo)
           houses/casa-N.png    casas sem fundo, recortadas e reduzidas
           portal.png           portal sem fundo, recortado e reduzido
           props/<nome>.png     cada objeto de enfeites_rua (nomes em PROP_NAMES)
         tools/assets/build/            (intermediário, fora do git; o build_city.py lê daqui)
           floor/floor-R-C.png  cada bloco de chao_cidade, 32x32, por linha e coluna da folha
           contato-*.png        folhas de conferência com o nome de cada peça

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_city.py
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "tilesets" / "novos tilesets"
OUT = ROOT / "assets" / "tilesets" / "city"
WORK = ROOT / "tools" / "assets" / "build"

TILE = 32
# Fundo "falso" das imagens geradas: quadriculado branco/cinza-claro, sem cor.
BG_MIN_LIGHT = 215  # menor canal >= isto
BG_MAX_SATURATION = 18  # (maior canal - menor canal) <= isto
COARSE = 4  # o preenchimento do fundo roda numa grade 4x menor (rápido) e depois é refinado
# Fundo preso dentro da arte (entre ripas de banco, grades, raios de roda): não encosta na borda, então o
# preenchimento não chega. Vira transparente se for quase branco puro e maior que um brilho da própria arte.
HOLE_MIN_LIGHT = 236
HOLE_MAX_SATURATION = 10
HOLE_MIN_AREA = 24

# Escalas: quanto cada imagem é reduzida para o tamanho do jogo (tile = 32 px, jogador = 24 px).
# As casas das imagens 2752x1536 ficam com ~12 tiles de altura (porta ~1,5x o jogador).
HOUSE_SCALE = 0.27
CASA1_HEIGHT = 380  # Casa 1 vem numa imagem pequena (677x369): ajusta pela altura final
PROP_SCALE = 0.17  # enfeites: poste ~3,5 tiles de altura, banco ~2 tiles de largura
# Nome de cada objeto de enfeites_rua, na ordem de leitura da folha (linha por linha, da esquerda para a direita).
PROP_NAMES = [
    "poste", "poste-duplo", "banco-a", "banco-b", "quadro-avisos", "placa-direcao",
    "chafariz", "correntes", "grade", "barris", "caixas", "carrinho", "barraca", "canteiro", "arvore",
]
# Peças que pedem outra escala: o chafariz é o centro da praça.
PROP_SCALE_OVERRIDE = {"chafariz": 0.30}
PORTAL_HEIGHT = 100
FLOOR_INSET = 0.10  # cada bloco de chão tem borda escura e vinheta: corta 10% de cada lado


def load_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).copy()


def background_mask(rgba: np.ndarray) -> np.ndarray:
    """Fundo = pixels claros e sem cor (ou já transparentes) ligados à borda da imagem."""
    rgb = rgba[:, :, :3].astype(int)
    candidate = (rgba[:, :, 3] == 0) | (
        (rgb.min(axis=2) >= BG_MIN_LIGHT) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= BG_MAX_SATURATION)
    )
    h, w = candidate.shape
    ch, cw = h // COARSE, w // COARSE
    # Grade grossa: um bloco só conta como fundo se todos os pixels dele forem fundo (não vaza por contorno fino).
    coarse = candidate[: ch * COARSE, : cw * COARSE].reshape(ch, COARSE, cw, COARSE).all(axis=(1, 3))
    seen = np.zeros_like(coarse)
    queue: deque[tuple[int, int]] = deque()
    for y in range(ch):
        for x in (0, cw - 1):
            if coarse[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for x in range(cw):
        for y in (0, ch - 1):
            if coarse[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < ch and 0 <= nx < cw and coarse[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    background = np.zeros_like(candidate)
    background[: ch * COARSE, : cw * COARSE] = np.repeat(np.repeat(seen, COARSE, axis=0), COARSE, axis=1)
    # Refino: cresce pelo fundo fino até encostar no contorno (poucos pixels).
    for _ in range(3 * COARSE):
        grown = background.copy()
        grown[1:] |= background[:-1]
        grown[:-1] |= background[1:]
        grown[:, 1:] |= background[:, :-1]
        grown[:, :-1] |= background[:, 1:]
        grown &= candidate
        if (grown == background).all():
            break
        background = grown
    # Bordas da imagem que são fundo mas ficaram fora da grade grossa (resto da divisão por COARSE).
    background[ch * COARSE :, :] |= candidate[ch * COARSE :, :]
    background[:, cw * COARSE :] |= candidate[:, cw * COARSE :]
    return background


def enclosed_holes(rgba: np.ndarray, background: np.ndarray) -> np.ndarray:
    rgb = rgba[:, :, :3].astype(int)
    strict = (rgb.min(axis=2) >= HOLE_MIN_LIGHT) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= HOLE_MAX_SATURATION) & ~background
    holes = np.zeros_like(strict)
    seen = np.zeros_like(strict)
    h, w = strict.shape
    for sy, sx in zip(*np.nonzero(strict)):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        pixels = [(sy, sx)]
        queue = deque(pixels)
        while queue:
            y, x = queue.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and strict[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    pixels.append((ny, nx))
                    queue.append((ny, nx))
        if len(pixels) >= HOLE_MIN_AREA:
            ys, xs = zip(*pixels)
            holes[list(ys), list(xs)] = True
    return holes


def remove_background(rgba: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    background = background_mask(rgba)
    out[background | enclosed_holes(rgba, background), 3] = 0
    return out


def trim(rgba: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(rgba[:, :, 3] > 8)
    return rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def resize(rgba: np.ndarray, width: int, height: int) -> Image.Image:
    """Média por área (BOX) com alfa pré-multiplicado: sem halo claro nas bordas recortadas."""
    image = Image.fromarray(rgba, "RGBA").convert("RGBa")
    return image.resize((max(1, width), max(1, height)), Image.BOX).convert("RGBA")


def scaled(rgba: np.ndarray, scale: float) -> Image.Image:
    h, w = rgba.shape[:2]
    return resize(rgba, round(w * scale), round(h * scale))


def components(solid: np.ndarray, min_area: int) -> list[tuple[int, int, int, int]]:
    """Caixas (x0, y0, x1, y1) das ilhas de pixels, calculadas na grade grossa e devolvidas em pixels."""
    h, w = solid.shape
    ch, cw = h // COARSE, w // COARSE
    coarse = solid[: ch * COARSE, : cw * COARSE].reshape(ch, COARSE, cw, COARSE).any(axis=(1, 3))
    seen = np.zeros_like(coarse)
    boxes = []
    for sy in range(ch):
        for sx in range(cw):
            if not coarse[sy, sx] or seen[sy, sx]:
                continue
            seen[sy, sx] = True
            queue = deque([(sy, sx)])
            y0, x0, y1, x1, area = sy, sx, sy, sx, 0
            while queue:
                y, x = queue.popleft()
                area += 1
                y0, x0, y1, x1 = min(y0, y), min(x0, x), max(y1, y), max(x1, x)
                for ny in (y - 1, y, y + 1):
                    for nx in (x - 1, x, x + 1):
                        if 0 <= ny < ch and 0 <= nx < cw and coarse[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))
            if area * COARSE * COARSE >= min_area:
                boxes.append((x0 * COARSE, y0 * COARSE, (x1 + 1) * COARSE, (y1 + 1) * COARSE))
    return boxes


def reading_order(boxes: list[tuple[int, int, int, int]]) -> list[list[tuple[int, int, int, int]]]:
    """Agrupa caixas em linhas (pelo centro vertical) e ordena cada linha da esquerda para a direita."""
    rows: list[list[tuple[int, int, int, int]]] = []
    for box in sorted(boxes, key=lambda b: (b[1] + b[3]) / 2):
        cy = (box[1] + box[3]) / 2
        for row in rows:
            ry = sum((b[1] + b[3]) / 2 for b in row) / len(row)
            height = max(b[3] - b[1] for b in row)
            if abs(cy - ry) < height / 2:
                row.append(box)
                break
        else:
            rows.append([box])
    return [sorted(row, key=lambda b: b[0]) for row in rows]


def contact_sheet(images: list[tuple[str, Image.Image]], path: Path, cell: int) -> None:
    cols = 8
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 14)), (90, 110, 90, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (label, image) in enumerate(images):
        x, y = (i % cols) * cell, (i // cols) * (cell + 14)
        thumb = image.copy()
        thumb.thumbnail((cell - 4, cell - 4), Image.BOX)
        sheet.alpha_composite(thumb, (x + 2, y + 14 + (cell - 4 - thumb.height)))
        draw.text((x + 2, y + 1), label, fill=(255, 255, 255, 255))
    sheet.save(path)


def main() -> None:
    (OUT / "houses").mkdir(parents=True, exist_ok=True)
    (OUT / "props").mkdir(exist_ok=True)
    (WORK / "floor").mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, int]] = {}

    houses = []
    for n in range(1, 11):
        art = trim(remove_background(load_rgba(SRC / f"Casa {n}.png")))
        scale = CASA1_HEIGHT / art.shape[0] if n == 1 else HOUSE_SCALE
        image = scaled(art, scale)
        name = f"houses/casa-{n}.png"
        image.save(OUT / name)
        manifest[name] = {"width": image.width, "height": image.height}
        houses.append((f"casa-{n} {image.width}x{image.height}", image))
        print(f"casa {n}: arte {art.shape[1]}x{art.shape[0]} -> {image.width}x{image.height}")
    contact_sheet(houses, WORK / "contato-casas.png", 220)

    portal = trim(remove_background(load_rgba(SRC / "Portal.png")))
    image = scaled(portal, PORTAL_HEIGHT / portal.shape[0])
    image.save(OUT / "portal.png")
    manifest["portal.png"] = {"width": image.width, "height": image.height}
    print(f"portal: {portal.shape[1]}x{portal.shape[0]} -> {image.width}x{image.height}")

    sheet = remove_background(load_rgba(SRC / "enfeites_rua.png"))
    props = []
    order = reading_order(components(sheet[:, :, 3] > 8, min_area=3000))
    boxes = [box for row in order for box in row]
    if len(boxes) != len(PROP_NAMES):
        raise SystemExit(f"enfeites_rua: achei {len(boxes)} objetos, esperava {len(PROP_NAMES)} (PROP_NAMES)")
    for i, ((x0, y0, x1, y1), prop) in enumerate(zip(boxes, PROP_NAMES)):
        art = trim(sheet[y0:y1, x0:x1])
        image = scaled(art, PROP_SCALE_OVERRIDE.get(prop, PROP_SCALE))
        name = f"props/{prop}.png"
        image.save(OUT / name)
        manifest[name] = {"width": image.width, "height": image.height}
        props.append((f"{prop} {image.width}x{image.height}", image))
    contact_sheet(props, WORK / "contato-props.png", 140)
    print(f"enfeites: {len(props)} objetos")

    floor_sheet = remove_background(load_rgba(SRC / "chao_cidade.png"))
    tiles = []
    rows = reading_order(components(floor_sheet[:, :, 3] > 8, min_area=20000))
    for r, row in enumerate(rows):
        for c, (x0, y0, x1, y1) in enumerate(row):
            inset_x, inset_y = round((x1 - x0) * FLOOR_INSET), round((y1 - y0) * FLOOR_INSET)
            block = floor_sheet[y0 + inset_y : y1 - inset_y, x0 + inset_x : x1 - inset_x]
            image = resize(block, TILE, TILE)
            name = f"floor/floor-{r}-{c}.png"
            image.save(WORK / name)
            tiles.append((f"{r}-{c}", image.resize((96, 96), Image.NEAREST)))
    contact_sheet(tiles, WORK / "contato-chao.png", 110)
    print(f"chão: {len(tiles)} blocos em {len(rows)} linhas: {[len(r) for r in rows]}")

    (WORK / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
