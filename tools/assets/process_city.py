"""Processa a arte da cidade para o jogo: tira o fundo, recorta e reduz.

Entrada: assets/tilesets/novos tilesets/ (fora do git):
           Casas1.png, Casas2.png        6 casas cada, numa grade 3x2
           Guilda.png                    o Salão da Guilda
           Ferreiro e Mercador.png       Forja (à esquerda de 46% da largura) e Estalagem/Cofre (à direita)
           EnfenitesRua.png, EnfeitesRua2.png   enfeites (feira, taverna, chafariz, árvores, cercas, postes...)
           Tileset.png                   38 tiles de chão nobre (grade de 5 linhas, até 8 colunas)
           chao_cidade.png               paralelepípedo rústico (bairros de fora)
           Portal.png
Saída:   assets/tilesets/city/          (vai para o jogo)
           houses/house_NN.png  casas (01-06 de Casas1, 07-12 de Casas2)
           landmarks/<nome>.png Guilda, Forja, Estalagem
           props/<nome>.png     enfeites (nomes em PROPS)
           portal.png
         tools/assets/build/            (intermediário, fora do git; o build_city.py lê daqui)
           floor/floor-R-C.png  blocos de chao_cidade, 32x32
           floor2/tile-R-C.png  tiles de Tileset.png, 32x32 (linha e coluna da folha, a partir de 0)
           contato-*.png        folhas de conferência

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_city.py
"""

from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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

# Escalas: quanto cada imagem é reduzida para o jogo (tile = 32 px, jogador ~60 px de altura ~ 1,8 m).
# Calibradas pela porta: porta de casa ~65 px, portas dos prédios grandes 75-90 px.
HOUSE_SCALE = 0.46  # porta ~60 px (a altura do jogador): com 0.50, as 12 casas não cabem nas 80 colunas
LANDMARK_SCALE = 0.32
PORTAL_HEIGHT = 100
FLOOR_INSET = 0.10  # cada bloco de chao_cidade tem borda escura e vinheta: corta 10% de cada lado
TILESET_INSET = 0.03  # os tiles de Tileset.png são limpos: só tira a borda serrilhada
BLACKSMITH_SPLIT = 0.46  # Ferreiro e Mercador.png: a Forja fica à esquerda desta fração da largura
GROUP_KERNEL = 25  # dilatação dos enfeites: junta partes soltas (barril afastado, saco, chama do braseiro)
# Nas casas, pouca dilatação: cada casa já é um objeto só (fumaça e cata-vento inclusos); mais que isso, o cata-vento
# da casa 4 encosta na casa 1 e as duas viram uma.
HOUSE_KERNEL = 5

# Enfeites: centro aproximado na imagem original (2752x1536), nome e escala.
PROPS = {
    "EnfenitesRua.png": {
        (378, 300): ("barraca-vermelha", 0.18),
        (1078, 308): ("barraca-ocre", 0.18),
        (1758, 326): ("rack-armas", 0.18),
        (2386, 318): ("caixotes-pilha", 0.18),
        (378, 846): ("barraca-verde", 0.18),
        (1164, 860): ("carroca-cristais", 0.18),
        (1856, 866): ("mesa-taverna-a", 0.18),
        (2420, 870): ("mesa-taverna-b", 0.18),
        (236, 1310): ("barris-a", 0.18),
        (652, 1316): ("barris-b", 0.18),
        (942, 1362): ("barril-coberto", 0.18),
        (1256, 1314): ("mochilas-a", 0.18),
        (1600, 1306): ("mochilas-b", 0.18),
        (2058, 1322): ("caixotes", 0.18),
        (2504, 1338): ("cestos", 0.18),
    },
    "EnfeitesRua2.png": {
        (568, 412): ("chafariz", 0.20),
        (1636, 406): ("arvore-verde", 0.22),
        (2310, 412): ("arvore-outono", 0.22),
        (418, 952): ("cerca-a", 0.18),
        (412, 1342): ("cerca-b", 0.18),
        (916, 1148): ("cerca-vertical", 0.18),
        (1150, 954): ("pilar", 0.18),
        (1580, 948): ("banco-madeira", 0.16),
        (2070, 952): ("banco-ferro", 0.16),
        (2484, 976): ("placa-direcao", 0.20),
        (1452, 1290): ("poste-duplo", 0.30),
        (1738, 1294): ("poste", 0.30),
        (2116, 1338): ("braseiro-a", 0.15),
        (2476, 1336): ("braseiro-b", 0.15),
    },
}
# Tileset.png: 5 linhas; as linhas 0 e 4 têm 7 tiles, as outras 8. Os dois cantos curvos (linha 2, colunas 6 e 7)
# têm um pedaço "vazio" (branco na arte, transparente depois do fundo): ele recebe a rua por baixo.
TILESET_COLUMNS = [7, 8, 8, 8, 7]
TILESET_FILL_UNDER = {(2, 6), (2, 7)}
TILESET_STREET = (0, 0)  # paralelepípedo claro: a rua que aparece nos cantos curvos


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


def grouped_boxes(rgba: np.ndarray, kernel: int = GROUP_KERNEL, min_area: int = 4000) -> list[tuple[int, int, int, int]]:
    """Caixas dos objetos depois de dilatar a máscara (partes a até ~kernel px viram um objeto só)."""
    mask = Image.fromarray(((rgba[:, :, 3] > 8) * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(kernel))
    return components(np.asarray(mask) > 0, min_area=min_area)


def box_at(boxes: list[tuple[int, int, int, int]], x: int, y: int, label: str) -> tuple[int, int, int, int]:
    inside = [b for b in boxes if b[0] <= x < b[2] and b[1] <= y < b[3]]
    if len(inside) != 1:
        raise SystemExit(f"{label}: {len(inside)} objetos em ({x},{y}), esperava 1")
    return inside[0]


def save(image: Image.Image, name: str, manifest: dict, sheet: list) -> None:
    (OUT / name).parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT / name)
    manifest[name] = {"width": image.width, "height": image.height}
    sheet.append((f"{Path(name).stem} {image.width}x{image.height}", image))


def process_houses(manifest: dict, sheet: list) -> None:
    """Casas1 e Casas2: grade 3x2, uma casa por célula. Cada objeto (fumaça, placa e cata-vento já vêm grudados na
    casa) vai para a célula onde fica o centro dele; assim a ponta da placa ou do cata-vento que invade a célula
    vizinha continua na casa certa. Pixels de objetos de outra célula ficam transparentes."""
    n = 0
    for file in ("Casas1.png", "Casas2.png"):
        art = remove_background(load_rgba(SRC / file))
        h, w = art.shape[:2]
        boxes = grouped_boxes(art, HOUSE_KERNEL, min_area=200)
        for row in range(2):
            for col in range(3):
                n += 1
                mine = [b for b in boxes if col * w // 3 <= (b[0] + b[2]) // 2 < (col + 1) * w // 3
                        and row * h // 2 <= (b[1] + b[3]) // 2 < (row + 1) * h // 2]
                if not mine:
                    raise SystemExit(f"{file}: célula {row},{col} vazia")
                keep = np.zeros(art.shape[:2], bool)
                for x0, y0, x1, y1 in mine:
                    keep[y0:y1, x0:x1] = True
                house = art.copy()
                house[~keep, 3] = 0
                save(scaled(trim(house), HOUSE_SCALE), f"houses/house_{n:02d}.png", manifest, sheet)


def process_landmarks(manifest: dict, sheet: list) -> None:
    guild = remove_background(load_rgba(SRC / "Guilda.png"))
    save(scaled(trim(guild), LANDMARK_SCALE), "landmarks/landmark_guild.png", manifest, sheet)
    pair = remove_background(load_rgba(SRC / "Ferreiro e Mercador.png"))
    split = round(pair.shape[1] * BLACKSMITH_SPLIT)
    save(scaled(trim(pair[:, :split]), LANDMARK_SCALE), "landmarks/landmark_blacksmith.png", manifest, sheet)
    save(scaled(trim(pair[:, split:]), LANDMARK_SCALE), "landmarks/landmark_inn_vault.png", manifest, sheet)


def process_props(manifest: dict, sheet: list) -> None:
    for file, props in PROPS.items():
        art = remove_background(load_rgba(SRC / file))
        boxes = grouped_boxes(art)
        if len(boxes) != len(props):
            raise SystemExit(f"{file}: achei {len(boxes)} objetos, esperava {len(props)} (PROPS)")
        for (cx, cy), (name, scale) in props.items():
            x0, y0, x1, y1 = box_at(boxes, cx, cy, f"{file} {name}")
            save(scaled(trim(art[y0:y1, x0:x1]), scale), f"props/{name}.png", manifest, sheet)


def tileset_grid(art: np.ndarray) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """Faixas (início, fim) das colunas e linhas de tiles: onde há arte, separadas pelas sobras de fundo."""
    def runs(filled: np.ndarray) -> list[tuple[int, int]]:
        out, start = [], None
        for i, on in enumerate(filled):
            if on and start is None:
                start = i
            if not on and start is not None:
                out.append((start, i))
                start = None
        if start is not None:
            out.append((start, len(filled)))
        return [r for r in out if r[1] - r[0] > 50]

    opaque = art[:, :, 3] > 8
    return runs(opaque.any(axis=0)), runs(opaque.any(axis=1))


def process_tileset(sheet: list) -> None:
    art = remove_background(load_rgba(SRC / "Tileset.png"))
    columns, rows = tileset_grid(art)
    if len(rows) != len(TILESET_COLUMNS) or len(columns) != max(TILESET_COLUMNS):
        raise SystemExit(f"Tileset.png: grade {len(rows)}x{len(columns)}, esperava {len(TILESET_COLUMNS)}x{max(TILESET_COLUMNS)}")
    (WORK / "floor2").mkdir(parents=True, exist_ok=True)
    tiles: dict[tuple[int, int], Image.Image] = {}
    for r, (y0, y1) in enumerate(rows):
        for c in range(TILESET_COLUMNS[r]):
            x0, x1 = columns[c]
            ix, iy = round((x1 - x0) * TILESET_INSET), round((y1 - y0) * TILESET_INSET)
            tiles[(r, c)] = resize(art[y0 + iy : y1 - iy, x0 + ix : x1 - ix], TILE, TILE)
    for key in TILESET_FILL_UNDER:
        under = tiles[TILESET_STREET].copy()
        under.alpha_composite(tiles[key])
        tiles[key] = under
    for (r, c), image in tiles.items():
        image.save(WORK / "floor2" / f"tile-{r}-{c}.png")
        sheet.append((f"{r}-{c}", image.resize((96, 96), Image.NEAREST)))
    print(f"tileset: {len(tiles)} tiles em {len(rows)} linhas: {TILESET_COLUMNS}")


def process_rustic_floor(sheet: list) -> None:
    """chao_cidade.png: paralelepípedo rústico e guias antigas, usados nos bairros de fora."""
    (WORK / "floor").mkdir(parents=True, exist_ok=True)
    floor_sheet = remove_background(load_rgba(SRC / "chao_cidade.png"))
    rows = reading_order(components(floor_sheet[:, :, 3] > 8, min_area=20000))
    for r, row in enumerate(rows):
        for c, (x0, y0, x1, y1) in enumerate(row):
            inset_x, inset_y = round((x1 - x0) * FLOOR_INSET), round((y1 - y0) * FLOOR_INSET)
            block = floor_sheet[y0 + inset_y : y1 - inset_y, x0 + inset_x : x1 - inset_x]
            image = resize(block, TILE, TILE)
            image.save(WORK / "floor" / f"floor-{r}-{c}.png")
            sheet.append((f"{r}-{c}", image.resize((96, 96), Image.NEAREST)))
    print(f"chão rústico: {sum(len(r) for r in rows)} blocos em {len(rows)} linhas: {[len(r) for r in rows]}")


def main() -> None:
    # As casas e enfeites da cidade antiga (isométricos) saem: a pasta é refeita do zero.
    for old in ("houses", "landmarks", "props"):
        shutil.rmtree(OUT / old, ignore_errors=True)
    manifest: dict[str, dict[str, int]] = {}
    buildings: list = []
    process_houses(manifest, buildings)
    process_landmarks(manifest, buildings)
    contact_sheet(buildings, WORK / "contato-predios.png", 280)
    props: list = []
    process_props(manifest, props)
    contact_sheet(props, WORK / "contato-props.png", 160)

    portal = trim(remove_background(load_rgba(SRC / "Portal.png")))
    image = scaled(portal, PORTAL_HEIGHT / portal.shape[0])
    image.save(OUT / "portal.png")
    manifest["portal.png"] = {"width": image.width, "height": image.height}

    floors: list = []
    process_tileset(floors)
    contact_sheet(floors, WORK / "contato-tileset.png", 110)
    rustic: list = []
    process_rustic_floor(rustic)
    contact_sheet(rustic, WORK / "contato-chao.png", 110)
    (WORK / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"prédios: {len(buildings)}, enfeites: {len(props)}")


if __name__ == "__main__":
    main()
