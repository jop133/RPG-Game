"""Processa a arte dos interiores dos 3 prédios da cidade: tira o fundo, recorta e reduz.

Entrada: assets/tilesets/novos tilesets/ (fora do git)
           Tiles_interiores.png      16 pisos internos, grade 4x4 (FLOORS)
           Interior_guilda.png       móveis do Salão da Guilda (GUILD)
           interior_ferreiro.png     móveis da Forja do Ferreiro (SMITHY; folha menor, escala maior)
           Interior_casacomida.png   móveis da Estalagem / Casa de Comida (INN)
           Bau_casadecomida.png      o Baú da Linhagem no pedestal
           decoracoes_guilda.png     púlpito, estante, caixotes, metade direita do balcão, tocha e janela (DECO)
Saída:   assets/tilesets/city/interior/<nome>.png        cada móvel, sem fundo, recortado e reduzido
         tools/assets/build/interior-floor/<piso>.png     cada piso, 32x32 (o build_city.py lê daqui)
         tools/assets/build/interior-floor/grande/        os tapetes inteiros (LARGE_FLOORS), para cortar em tiles
         tools/assets/build/contato-interiores-*.png      folhas de conferência

Mesma limpeza dos kits do labirinto (fundo, vãos presos pela borda, pedaços soltos presos ao objeto mais perto) e,
a mais, as sombras: estas folhas desenham embaixo de cada móvel uma sombra cinza-clara, que num chão escuro viraria
uma faixa clara. O cinza que encosta no fundo vira sombra de verdade (preto semitransparente).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_interiors.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_city import TILE, components, contact_sheet, load_rgba, reading_order, remove_background, resize, scaled  # noqa: E402
from process_labyrinth import clean, coarse_labels, kit_objects  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "tilesets" / "novos tilesets"
OUT = ROOT / "assets" / "tilesets" / "city" / "interior"
WORK = ROOT / "tools" / "assets" / "build"
FLOOR_INSET = 0.03

# Cada móvel: centro aproximado na folha original e escala para o jogo (personagem ~60 px; porta ~1,6x a altura dele).
# Centros extras (3º campo) juntam peças grandes do mesmo conjunto.
# A Guilda é a sala grande (44x28): a folha dela sai 12% maior que na primeira versão (mesa longa ~9 tiles).
GUILD_SCALE = 1.12
GUILD = {name: (spec[0], round(spec[1] * GUILD_SCALE, 3), *spec[2:]) for name, spec in {
    "balcao-recepcao": ((442, 298), 0.27),
    "mesa-bestiario": ((1198, 312), 0.27),
    "quadro-contratos": ((1840, 298), 0.25),
    "estandarte-a": ((2276, 318), 0.22),
    "estandarte-b": ((2554, 320), 0.22),
    "mesa-longa-a": ((570, 816), 0.25),
    "mesa-redonda": ((1404, 784), 0.24, [(1308, 922), (1596, 922)]),
    "cranio-chifres": ((2020, 742), 0.2),
    "escudo-espadas": ((2488, 752), 0.18),
    "mesa-longa-b": ((618, 1300), 0.25),
    "braseiro-guilda": ((1412, 1326), 0.2),
    "pilar-lanterna-a": ((1850, 1210), 0.22),
    "pilar-lanterna-b": ((2112, 1210), 0.22),
    "porta-guilda": ((2482, 1236), 0.21),
}.items()}
# decoracoes_guilda.png: as 6 peças que faltavam na Guilda (grade 3x2; tocha e janela vêm em 2 versões cada). A folha
# já vem com fundo transparente (RGB 0, alfa 0) e contorno quase preto e opaco: o fundo é o alfa (um flood-fill de
# "preto" a partir da borda comeria o contorno). A metade direita do balcão tem a mesma escala do balcão da Guilda.
DECO_FILE = "decoracoes_guilda.png"
DECO = {
    "guild_lectern_bestiary": ((452, 462), 0.24),
    "guild_bookshelf": ((1337, 442), 0.21),
    "guild_scroll_crates": ((2241, 470), 0.19),
    "guild_counter_right": ((560, 1238), GUILD["balcao-recepcao"][1]),
    "guild_wall_torch": ((1258, 1199), 0.19),
    "guild_wall_torch_b": ((1553, 1199), 0.19),
    "guild_wall_window": ((1966, 1209), 0.2),
    "guild_wall_window_b": ((2457, 1209), 0.2),
}
# Sombra desenhada nesta folha: cinza-arroxeado escuro (~70, 64, 76) colado no fundo.
DARK_SHADOW_LUM = (35, 115)
DARK_SHADOW_MAX_SAT = 22
DARK_SHADOW_ALPHA = 0.45
# Franja do antisserrilhado (pixels quase transparentes e claros na borda): sai.
FRINGE_MAX_ALPHA = 40
SMITHY = {
    "balcao-ferreiro": ((192, 104), 0.55),
    "rack-armas-1": ((450, 104), 0.5),
    "fornalha": ((648, 130), 0.62),
    "armadura-a": ((810, 124), 0.5),
    "armadura-b": ((940, 124), 0.5),
    "rack-armas-2": ((120, 294), 0.5),
    "rack-armas-3": ((302, 288), 0.5),
    "armadura-c": ((466, 294), 0.5),
    "fole": ((630, 324), 0.45),
    "bigorna-tempera": ((856, 310), 0.5),
    "porta-ferreiro": ((928, 464), 0.5),
    "bancada-lingotes": ((124, 484), 0.5),
    "bancada-manoplas": ((324, 486), 0.5),
    "tanque-tempera": ((626, 486), 0.5),
    "pedra-amolar": ((784, 488), 0.48),
}
INN = {
    "balcao-comida": ((728, 298), 0.22),
    "mesa-acougue": ((350, 746), 0.22),
    "despensa": ((926, 748), 0.22),
    "forno-caldeirao": ((1964, 246), 0.23),
    "mesa-refeicao-a": ((1746, 772), 0.22),
    "mesa-refeicao-b": ((2432, 774), 0.22),
    "porta-estalagem": ((2518, 1254), 0.2),
    "arco-pedra": ((378, 1262), 0.24),
    "grade-ferro": ((860, 1300), 0.24),
    "cofres": ((2198, 1328), 0.22),
}
CHEST = {"prop_lineage_chest": ((1534, 1238), 0.2)}
SHEETS = (("Interior_guilda.png", GUILD), ("interior_ferreiro.png", SMITHY), ("Interior_casacomida.png", INN),
          ("Bau_casadecomida.png", CHEST))
# Pisos, linha por linha da grade 4x4.
FLOORS = [
    ["madeira-0", "madeira-1", "madeira-2", "madeira-3"],
    ["madeira-rustica-0", "madeira-rustica-1", "pedra-ocre-0", "pedra-ocre-1"],
    ["pedra-escura-0", "pedra-escura-1", "tijolo-0", "tijolo-fuligem"],
    ["tapete-canto", "tapete-faixa", "tapete-centro", "tapete-liso"],
]
# Pisos guardados também inteiros (sem reduzir a 32 px), em interior-floor/grande/: o interiors.py corta deles os
# tapetes de verdade (o quadrado com moldura dourada, a passadeira), em vez de repetir uma amostra inteira por tile.
LARGE_FLOORS = {"tapete-centro", "tapete-faixa", "tapete-canto"}
# Janelas com o quadriculado mais contrastado que o resto da folha (em volta da mesa redonda da Guilda): ali,
# cinza claro sem cor ligado à borda da janela também é fundo.
RELAXED_BACKGROUND = {"Interior_guilda.png": [(1100, 570, 1700, 1020)]}
RELAXED_MIN_LUM = 140
RELAXED_MAX_SAT = 26
# Sombra desenhada: cinza sem cor, mais claro que isto e mais escuro que o fundo, ligado ao fundo.
SHADOW_MIN_LUM = 120
SHADOW_MAX_SAT = 16
SHADOW_MAX_ALPHA = 0.55


def soften_shadows(art: np.ndarray) -> np.ndarray:
    """O cinza claro que encosta no fundo (a sombra desenhada embaixo dos móveis) vira preto semitransparente,
    tanto mais forte quanto mais escuro era. O cinza de dentro do objeto (metal, pedra) fica: ele é separado do fundo
    pelo contorno escuro, e o crescimento a partir do fundo não atravessa o contorno."""
    rgb = art[:, :, :3].astype(float)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    gone = art[:, :, 3] == 0
    candidate = ~gone & (sat <= SHADOW_MAX_SAT) & (lum >= SHADOW_MIN_LUM)
    # Ilhas de cinza (rotuladas uma vez): é sombra a ilha que encosta no fundo, por mais comprida que seja (a faixa
    # entre a mesa longa e os bancos tem centenas de pixels).
    labels, _ = coarse_labels(candidate, 1)
    near_gone = np.zeros_like(gone)
    near_gone[1:] |= gone[:-1]
    near_gone[:-1] |= gone[1:]
    near_gone[:, 1:] |= gone[:, :-1]
    near_gone[:, :-1] |= gone[:, 1:]
    touching = np.unique(labels[near_gone & candidate])
    shadow = np.isin(labels, touching[touching > 0])
    out = art.copy()
    strength = np.clip((248 - lum) / 248 * 2.2, 0, SHADOW_MAX_ALPHA)
    out[shadow, :3] = 0
    out[shadow, 3] = (strength[shadow] * 255).astype(np.uint8)
    return out


def dark_sheet_art(art: np.ndarray) -> np.ndarray:
    """Folha de fundo transparente com sombra cinza-escura: a franja quase transparente sai e a sombra colada no fundo
    vira preto semitransparente. O cinza de dentro do objeto (metal, aros do barril) fica: o contorno o separa do fundo."""
    out = art.copy()
    out[out[:, :, 3] < FRINGE_MAX_ALPHA, 3] = 0
    rgb = out[:, :, :3].astype(float)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    gone = out[:, :, 3] == 0
    candidate = ~gone & (sat <= DARK_SHADOW_MAX_SAT) & (lum >= DARK_SHADOW_LUM[0]) & (lum <= DARK_SHADOW_LUM[1])
    labels, _ = coarse_labels(candidate, 1)
    near_gone = np.zeros_like(gone)
    near_gone[1:] |= gone[:-1]
    near_gone[:-1] |= gone[1:]
    near_gone[:, 1:] |= gone[:, :-1]
    near_gone[:, :-1] |= gone[:, 1:]
    touching = np.unique(labels[near_gone & candidate])
    shadow = np.isin(labels, touching[touching > 0])
    out[shadow, :3] = 0
    out[shadow, 3] = int(DARK_SHADOW_ALPHA * 255)
    return out


def grow_from(seed: np.ndarray, allowed: np.ndarray, steps: int = 400) -> np.ndarray:
    """O que se alcança de `seed` andando (4 direções) só por `allowed`."""
    reached = seed & allowed
    frontier = reached
    for _ in range(steps):
        grown = np.zeros_like(frontier)
        grown[1:] |= frontier[:-1]
        grown[:-1] |= frontier[1:]
        grown[:, 1:] |= frontier[:, :-1]
        grown[:, :-1] |= frontier[:, 1:]
        fresh = grown & allowed & ~reached
        if not fresh.any():
            break
        reached |= fresh
        frontier = fresh
    return reached


def relaxed_background(art: np.ndarray, boxes: list[tuple[int, int, int, int]]) -> np.ndarray:
    """Dentro de cada janela, cinza claro sem cor ligado à borda dela (ou ao fundo já limpo) também sai."""
    out = art.copy()
    for x0, y0, x1, y1 in boxes:
        part = out[y0:y1, x0:x1]
        rgb = part[:, :, :3].astype(float)
        lum = rgb @ np.array([0.299, 0.587, 0.114])
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        gone = part[:, :, 3] == 0
        allowed = gone | ((sat <= RELAXED_MAX_SAT) & (lum >= RELAXED_MIN_LUM))
        seed = np.zeros_like(gone)
        seed[0, :] = seed[-1, :] = True
        seed[:, 0] = seed[:, -1] = True
        seed |= gone
        part[grow_from(seed, allowed), 3] = 0
    return out


def process_props(sheet: list) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for file, names in SHEETS:
        art, holes = clean(load_rgba(SRC / file))
        art = soften_shadows(relaxed_background(art, RELAXED_BACKGROUND.get(file, [])))
        for name, crop in kit_objects(art, holes, names, file).items():
            image = scaled(crop, names[name][1])
            image.save(OUT / f"{name}.png")
            sheet.append((f"{name} {image.width}x{image.height}", image))
    art = dark_sheet_art(load_rgba(SRC / DECO_FILE))
    for name, crop in kit_objects(art, np.zeros(art.shape[:2], bool), DECO, DECO_FILE).items():
        image = scaled(crop, DECO[name][1])
        image.save(OUT / f"{name}.png")
        sheet.append((f"{name} {image.width}x{image.height}", image))


def process_floors(sheet: list) -> None:
    (WORK / "interior-floor" / "grande").mkdir(parents=True, exist_ok=True)
    floor = remove_background(load_rgba(SRC / "Tiles_interiores.png"))
    rows = reading_order(components(floor[:, :, 3] > 8, min_area=20000))
    if [len(r) for r in rows] != [4, 4, 4, 4]:
        raise SystemExit(f"pisos internos: esperava 4x4 blocos, achei {[len(r) for r in rows]}")
    for names, row in zip(FLOORS, rows):
        for name, (x0, y0, x1, y1) in zip(names, row):
            ix, iy = round((x1 - x0) * FLOOR_INSET), round((y1 - y0) * FLOOR_INSET)
            crop = floor[y0 + iy : y1 - iy, x0 + ix : x1 - ix]
            image = resize(crop, TILE, TILE)
            image.save(WORK / "interior-floor" / f"{name}.png")
            if name in LARGE_FLOORS:
                Image.fromarray(crop).save(WORK / "interior-floor" / "grande" / f"{name}.png")
            sheet.append((name, image.resize((96, 96), Image.NEAREST)))


def main() -> None:
    started = time.perf_counter()
    props: list = []
    process_props(props)
    contact_sheet(props, WORK / "contato-interiores-moveis.png", 200)
    floors: list = []
    process_floors(floors)
    contact_sheet(floors, WORK / "contato-interiores-pisos.png", 110)
    print(f"interiores: {len(props)} móveis e {len(floors)} pisos em {time.perf_counter() - started:.1f} s")


if __name__ == "__main__":
    main()
