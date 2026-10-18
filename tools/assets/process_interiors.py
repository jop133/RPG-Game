"""Processa a arte dos interiores dos 3 prédios da cidade: tira o fundo, recorta e reduz.

Entrada: assets/tilesets/novos tilesets/ (fora do git)
           Tiles_interiores.png      16 pisos internos, grade 4x4 (FLOORS)
           Interior_guilda.png       móveis do Salão da Guilda (GUILD)
           interior_ferreiro.png     móveis da Forja do Ferreiro (SMITHY; folha menor, escala maior)
           Interior_casacomida.png   móveis da Estalagem / Casa de Comida (INN)
           Bau_casadecomida.png      o Baú da Linhagem no pedestal
           decoracoes_guilda.png     púlpito, estante, caixotes, metade direita do balcão, tocha e janela (DECO)
           derocacao_taverna.png     taverna e Sala-Forte: pilar de velas, banquinho, mesa vertical, cozinha, barris,
                                     lareira, janela gradeada, pedestal e tesouros (TAVERN, por retângulo)
           enfeites_interiorferreiro.png  rack de canto, mesa de manoplas, balcão, barril e caixotes, correntes, ferramentas,
                                     carvão, tanque com faíscas, bancada de lingotes (SMITHY_DECO, por retângulo)
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
from process_city import TILE, components, contact_sheet, load_rgba, reading_order, remove_background, resize, scaled, trim  # noqa: E402
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
# Recortes por retângulo (x0, y0, x1, y1 na folha; e retângulos excluídos): peças coladas umas nas outras na folha,
# que a separação por ilhas não divide.
Rect = tuple[int, int, int, int]
# enfeites_interiorferreiro.png (fundo transparente, como a de decorações da Guilda). Célula 3: o segmento da direita
# do balcão (moedas) com o caixote da frente, que fica por cima dele; o barril e o caixote de trás, juntos e separados.
# Célula 4: a barra das correntes, a das ferramentas e o reservatório de carvão. Escala: o balcão com a altura do
# balcão da espada.
SMITHY_DECO_FILE = "enfeites_interiorferreiro.png"
SMITHY_DECO_SCALE = 0.377
SMITHY_DECO: dict[str, tuple[Rect, list[Rect]]] = {
    "blacksmith_corner_rack": ((110, 85, 1095, 790), []),
    "blacksmith_gauntlet_table": ((1250, 190, 1530, 776), []),
    "blacksmith_counter_ext": ((2012, 330, 2470, 748), [(2412, 200, 2620, 556)]),
    "blacksmith_barrel": ((2372, 222, 2560, 505), [(2360, 335, 2414, 520), (2460, 445, 2605, 668)]),
    "blacksmith_crate": ((2468, 445, 2605, 668), []),
    "blacksmith_barrel_crates": ((2372, 222, 2605, 668), [(2360, 335, 2414, 670), (2330, 552, 2468, 760)]),
    "blacksmith_wall_chains": ((184, 842, 556, 1342), [(498, 1228, 560, 1346)]),
    "blacksmith_wall_tools": ((556, 842, 922, 1242), []),
    "blacksmith_coal_bin": ((502, 1236, 706, 1456), []),
    "blacksmith_quench_sparks": ((1130, 900, 1690, 1460), []),
    "blacksmith_ore_bench": ((1836, 1044, 2612, 1380), []),
}
# O barril avulso fica, na folha, com a lateral esquerda atrás da ponta do balcão: é simétrico, então a metade esquerda
# vem da direita, espelhada.
MIRROR_LEFT = {"blacksmith_barrel"}
# derocacao_taverna.png (fundo transparente, como as outras folhas novas): a Estalagem refeita. Por retângulo, porque
# várias células trazem peças coladas (o pilar e os banquinhos, os 5 móveis da cozinha, as duas metades dos barris, a
# lareira e a janela, o pedestal e os tesouros em volta dele).
TAVERN_FILE = "derocacao_taverna.png"
TAVERN_SCALE = 0.17
PEDESTAL: Rect = (2100, 1165, 2480, 1490)
TAVERN: dict[str, tuple[Rect, list[Rect]]] = {
    "tavern_candle_pillar": ((222, 120, 450, 740), [(440, 380, 560, 620)]),
    "tavern_stool": ((598, 458, 716, 614), []),
    "tavern_table_vertical": ((870, 130, 1480, 715), []),
    "tavern_counter_vertical": ((1692, 265, 1858, 772), []),
    "tavern_chopping_stump": ((1898, 598, 2002, 742), []),
    "tavern_cauldron_oven": ((2032, 35, 2342, 568), []),
    "tavern_butcher_table_center": ((2058, 590, 2412, 772), []),
    "tavern_wall_meats_right": ((2368, 145, 2642, 772), [(2360, 560, 2416, 780)]),
    "tavern_barrel_rack_sacks": ((78, 915, 562, 1378), []),
    "tavern_kegs_cluster": ((598, 1055, 1038, 1438), []),
    "tavern_side_fireplace": ((1178, 815, 1368, 1448), []),
    "tavern_barred_window": ((1415, 960, 1608, 1138), []),
    "vault_stone_pedestal": (PEDESTAL, []),
    "vault_treasure_left": ((1788, 878, 2165, 1468), [PEDESTAL]),
    "vault_treasure_top": ((2165, 898, 2432, 1162), [PEDESTAL]),
    "vault_treasure_right": ((2432, 878, 2702, 1422), [PEDESTAL]),
}
# A bigorna sozinha (na folha antiga ela vem colada no barril de água e no tanque, a "bigorna-tempera").
SMITHY_CUTS: dict[str, tuple[Rect, list[Rect]]] = {"bigorna": ((712, 262, 862, 390), [(835, 225, 905, 330), (850, 225, 905, 345), (823, 225, 905, 300)])}
# A Forja é a sala grande (42x26): a folha dela sai 1,4x maior que na primeira versão.
SMITHY_SCALE = 1.4
SMITHY = {name: (spec[0], round(spec[1] * SMITHY_SCALE, 3), *spec[2:]) for name, spec in {
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
}.items()}
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


def mirror_left(rgba: np.ndarray) -> np.ndarray:
    """Peça simétrica com a metade esquerda faltando: a metade esquerda vira o espelho da direita."""
    out = rgba.copy()
    w = out.shape[1]
    out[:, : w // 2] = out[:, ::-1][:, : w // 2]
    return out


# Tamanho final de cada móvel dos interiores, na régua do jogador (corpo ~48 px; tile 32 px): ("h", px) = altura,
# ("w", px) = largura, ("max", px) = o lado maior. A escala sai do recorte (o aspecto é mantido); os números de escala
# das tabelas acima só valem para quem não está aqui. Colisão (FOOTPRINT) e luzes são frações da imagem: acompanham.
TARGETS: dict[str, tuple[str, int]] = {
    # Forja
    "armadura-a": ("h", 56), "armadura-b": ("h", 56), "armadura-c": ("h", 56),
    "bigorna": ("h", 40), "bigorna-tempera": ("h", 50),
    "balcao-ferreiro": ("h", 54),
    "blacksmith_counter_ext": ("h", 75),  # o balcão em si com 54 px; o caixote da frente desce mais
    "blacksmith_gauntlet_table": ("h", 85), "blacksmith_ore_bench": ("w", 94),
    "bancada-lingotes": ("w", 92), "bancada-manoplas": ("w", 92),
    "blacksmith_crate": ("max", 36), "blacksmith_coal_bin": ("max", 36),
    "blacksmith_barrel": ("h", 44), "blacksmith_barrel_crates": ("h", 64),
    "tanque-tempera": ("w", 82), "blacksmith_quench_sparks": ("w", 86),
    "fole": ("max", 46), "pedra-amolar": ("max", 46),
    "rack-armas-1": ("h", 62), "rack-armas-2": ("h", 62), "rack-armas-3": ("h", 62),
    "blacksmith_corner_rack": ("h", 100),  # o rack reto, mais ao fundo, fica com ~63 px
    "fornalha": ("h", 122), "porta-ferreiro": ("h", 76),
    "blacksmith_wall_chains": ("h", 80), "blacksmith_wall_tools": ("h", 63),
    # Guilda
    "balcao-recepcao": ("h", 54), "guild_counter_right": ("h", 57),
    "mesa-longa-a": ("h", 74), "mesa-longa-b": ("h", 74), "mesa-redonda": ("h", 70), "mesa-bestiario": ("h", 60),
    "quadro-contratos": ("h", 76), "estandarte-a": ("h", 84), "estandarte-b": ("h", 84),
    "cranio-chifres": ("w", 72), "escudo-espadas": ("h", 46), "braseiro-guilda": ("h", 44),
    "pilar-lanterna-a": ("h", 112), "pilar-lanterna-b": ("h", 112), "porta-guilda": ("h", 78),
    "guild_lectern_bestiary": ("h", 72), "guild_bookshelf": ("h", 84), "guild_scroll_crates": ("h", 46),
    "guild_wall_torch": ("h", 40), "guild_wall_torch_b": ("h", 40),
    "guild_wall_window": ("h", 52), "guild_wall_window_b": ("h", 52),
    # Estalagem
    "balcao-comida": ("h", 54), "mesa-refeicao-a": ("h", 58), "mesa-refeicao-b": ("h", 58),
    "mesa-acougue": ("h", 66), "despensa": ("h", 76), "forno-caldeirao": ("w", 110), "cofres": ("h", 52),
    "prop_lineage_chest": ("w", 68), "porta-estalagem": ("h", 76), "arco-pedra": ("h", 90), "grade-ferro": ("h", 70),
    "tavern_candle_pillar": ("h", 104), "tavern_stool": ("max", 24), "tavern_table_vertical": ("h", 92),
    "tavern_counter_vertical": ("h", 76), "tavern_chopping_stump": ("max", 26), "tavern_cauldron_oven": ("h", 120),
    "tavern_butcher_table_center": ("w", 76), "tavern_wall_meats_right": ("h", 100),
    "tavern_barrel_rack_sacks": ("h", 74), "tavern_kegs_cluster": ("h", 64), "tavern_side_fireplace": ("h", 128),
    "tavern_barred_window": ("h", 44), "vault_stone_pedestal": ("w", 110),
}


def fitted(name: str, crop: np.ndarray, scale: float) -> Image.Image:
    """O recorte no tamanho de TARGETS (ou na escala dada, se o móvel não estiver lá)."""
    if name in TARGETS:
        axis, px = TARGETS[name]
        h, w = crop.shape[:2]
        size = {"h": h, "w": w, "max": max(h, w)}[axis]
        scale = px / size
    return scaled(crop, scale)


def cut_rect(art: np.ndarray, rect: Rect, excluded: list[Rect]) -> np.ndarray:
    """O que há no retângulo, menos os excluídos, aparado."""
    x0, y0, x1, y1 = rect
    own = np.zeros_like(art)
    own[y0:y1, x0:x1] = art[y0:y1, x0:x1]
    for ex0, ey0, ex1, ey1 in excluded:
        own[ey0:ey1, ex0:ex1, 3] = 0
    return trim(own)


def process_props(sheet: list) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for file, names in SHEETS:
        art, holes = clean(load_rgba(SRC / file))
        art = soften_shadows(relaxed_background(art, RELAXED_BACKGROUND.get(file, [])))
        for name, crop in kit_objects(art, holes, names, file).items():
            image = fitted(name, crop, names[name][1])
            image.save(OUT / f"{name}.png")
            sheet.append((f"{name} {image.width}x{image.height}", image))
    smithy, _ = clean(load_rgba(SRC / "interior_ferreiro.png"))
    smithy = soften_shadows(smithy)
    for name, (rect, excluded) in SMITHY_CUTS.items():
        image = fitted(name, cut_rect(smithy, rect, excluded), 0.5 * SMITHY_SCALE)
        image.save(OUT / f"{name}.png")
        sheet.append((f"{name} {image.width}x{image.height}", image))
    deco = dark_sheet_art(load_rgba(SRC / SMITHY_DECO_FILE))
    for name, (rect, excluded) in SMITHY_DECO.items():
        crop = cut_rect(deco, rect, excluded)
        if name in MIRROR_LEFT:
            crop = mirror_left(crop)
        image = fitted(name, crop, SMITHY_DECO_SCALE)
        image.save(OUT / f"{name}.png")
        sheet.append((f"{name} {image.width}x{image.height}", image))
    tavern = dark_sheet_art(load_rgba(SRC / TAVERN_FILE))
    for name, (rect, excluded) in TAVERN.items():
        image = fitted(name, cut_rect(tavern, rect, excluded), TAVERN_SCALE)
        image.save(OUT / f"{name}.png")
        sheet.append((f"{name} {image.width}x{image.height}", image))
    art = dark_sheet_art(load_rgba(SRC / DECO_FILE))
    for name, crop in kit_objects(art, np.zeros(art.shape[:2], bool), DECO, DECO_FILE).items():
        image = fitted(name, crop, DECO[name][1])
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
