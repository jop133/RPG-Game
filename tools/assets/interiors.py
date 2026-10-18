"""Interiores dos 3 prédios da cidade (Salão da Guilda, Forja do Ferreiro, Estalagem), montados dentro do city.json.

Cada interior é uma sala fechada, ao leste da cidade, separada dela e das outras por mais de INTERIOR_GAP tiles de
vazio (sólido e preto): o servidor manda a cada jogador só quem está a até VIEW_RADIUS (520 px), então quem está num
prédio não vê a rua nem os outros prédios, e quem está no mesmo prédio se vê. A porta da rua leva à chegada de
dentro; a porta de dentro, de volta à rua (o servidor teletransporta; o cliente faz um fade e prende a câmera na
região, camada "regioes").

Usado por build_city.py, que monta o tileset de chão (pisos internos, paredes e vazio vêm daqui) e grava o mapa.
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FLOORS = ROOT / "tools" / "assets" / "build" / "interior-floor"  # pisos recortados pelo process_interiors.py
T = 32
INTERIOR_GAP = 26  # tiles de vazio entre a cidade e cada interior (> (VIEW_RADIUS + folga) / 32 ≈ 17)
CITY_W = 80
TOP_WALL = 3  # linhas da parede do fundo: topo e duas de face de tijolo
FACE_LIGHT = (1.15, 0.6)  # brilho da face no alto e no pé

# ---------------------------------------------------------------- tiles

INTERIOR_FLOORS = [
    "madeira-0", "madeira-1", "madeira-2", "madeira-3", "madeira-rustica-0", "madeira-rustica-1", "pedra-ocre-0",
    "pedra-ocre-1", "pedra-escura-0", "pedra-escura-1", "tijolo-0", "tijolo-fuligem", "tapete-canto", "tapete-faixa",
    "tapete-centro", "tapete-liso",
]
# Variantes usadas por tipo de piso (a de cima é sorteada entre elas).
FLOOR_KINDS = {
    "madeira": ["madeira-0", "madeira-3"],
    "madeira-nobre": ["madeira-2"],
    "fuligem": ["pedra-fuligem-0", "pedra-fuligem-1"],
    "madeira-rustica": ["madeira-rustica-0", "madeira-rustica-1"],
    "pedra-ocre": ["pedra-ocre-0"],
    "pedra-escura": ["pedra-escura-0", "pedra-escura-1"],
    "tijolo": ["tijolo-0", "tijolo-fuligem"],
    "tapete-faixa": ["tapete-faixa"],
    "tapete-nobre": ["tapete-liso"],
    "tapete-centro": ["tapete-centro"],
}
# Tapetes cortados da amostra inteira (interior-floor/grande/). Guilda: o tapete grande do Salão Principal em 9 partes
# ("tapete-grande": cantos e bordas da amostra com cantoneiras douradas, miolo liso que se repete) e a passadeira.
CARPET_SLICES = 4  # a amostra vira 4x4 tiles: cantos = 1 tile; bordas e miolo = os 2 do meio, em ciclo
WALL_FACE_ROWS = 3  # faces de parede da Guilda: 3 linhas de altura (e 1 de topo)
WALLS = ["parede-topo", "parede-face-alta", "parede-face-baixa", "vazio", "topo-madeira", "mureta", "mureta-pilar"]
WALLS += [f"face-{kind}-{row}" for kind in ("pedra", "madeira", "enxaimel", "enxaimel-poste") for row in range(WALL_FACE_ROWS)]
RUNNER_SLICES = 4  # passadeira vertical da Forja: a amostra em 4x4 tiles (bordas douradas nas colunas 0 e 3)
# Peças de parede (e a porta da parede sul da Forja) desenhadas sempre atrás de quem passa perto: pivô no topo.
SORT_AT_TOP = ["porta-ferreiro", "guild_wall_torch", "guild_wall_torch_b", "blacksmith_wall_chains",
               "blacksmith_wall_tools"]


def floor_image(name: str) -> Image.Image:
    return Image.open(FLOORS / f"{name}.png").convert("RGBA")


def wall_images() -> dict[str, Image.Image]:
    """Paredes geradas a partir dos próprios pisos: topo de pedra escura quase preta com beirada, e a face de tijolo
    (duas linhas, clara em cima e escurecendo até o rodapé). Vazio: preto (fora das salas)."""
    stone = np.asarray(floor_image("pedra-escura-0").convert("RGB")).astype(float)
    brick = np.asarray(floor_image("tijolo-0").convert("RGB")).astype(float)
    top = stone * 0.28
    top[-3:] = stone[-3:] * 0.7  # beirada de baixo, onde o topo encontra a face ou o chão
    rows = np.linspace(FACE_LIGHT[0], FACE_LIGHT[1], 2 * T)[:, None, None]
    face = np.concatenate([brick, brick]) * rows
    face[:2] = face[:2] * 1.4  # quina de cima, que pega luz
    face[-4:] = face[-4:] * 0.5  # rodapé
    to_image = lambda a: Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")  # noqa: E731
    return {"parede-topo": to_image(top), "parede-face-alta": to_image(face[:T]), "parede-face-baixa": to_image(face[T:]),
            "vazio": Image.new("RGBA", (T, T), (0, 0, 0, 255))}


def to_tile(a: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")


def rgb(name: str) -> np.ndarray:
    return np.asarray(floor_image(name).convert("RGB")).astype(float)


def wall_face(texture: np.ndarray, light: tuple[float, float], beam: np.ndarray | None, rows: int) -> list[Image.Image]:
    """Face de parede de `rows` linhas (vista de frente): a textura repetida, clareando no alto e escurecendo até o pé,
    com rodapé de madeira escura e, se houver, uma viga de madeira no alto."""
    face = np.concatenate([texture] * rows) * np.linspace(light[0], light[1], rows * T)[:, None, None]
    if beam is not None:
        face[:7] = beam[:7] * 0.75
        face[7:9] = beam[7:9] * 0.35  # sombra embaixo da viga
    face[-6:] = rgb("madeira-0")[:6] * 0.4  # rodapé
    face[-7] = face[-7] * 0.5
    return [to_tile(face[r * T : (r + 1) * T]) for r in range(rows)]


def guild_wall_images() -> dict[str, Image.Image]:
    """Paredes da Guilda: pedra cinza com viga e rodapé (Salão Principal), painéis de madeira na vertical (Foyer, Ala
    Esquerda e o bloco da divisória), madeira escura vista de cima (topos, laterais, parede do sul), os degraus da
    passagem da divisória e a mureta baixa (madeira mais clara) com pilares de pedra."""
    tiles: dict[str, Image.Image] = {}
    stone = wall_face(rgb("pedra-escura-0"), (1.1, 0.7), rgb("madeira-0"), WALL_FACE_ROWS)
    wood = wall_face(rgb("madeira-1"), (1.0, 0.55), None, WALL_FACE_ROWS)
    for row in range(WALL_FACE_ROWS):
        tiles[f"face-pedra-{row}"] = stone[row]
        tiles[f"face-madeira-{row}"] = wood[row]
    top = rgb("madeira-1") * 0.3
    top[:, :2] = top[:, :2] * 1.8  # quinas que pegam luz
    top[:, -2:] = top[:, -2:] * 1.8
    tiles["topo-madeira"] = to_tile(top)
    step = rgb("madeira-2").copy()
    step[:, -5:] = step[:, -5:] * 0.45  # espelho do degrau, do lado do salão
    step[:, :2] = step[:, :2] * 1.3  # quina do piso do degrau
    tiles["degrau-madeira"] = to_tile(step)
    low = rgb("madeira-0") * 0.62
    low[:, :3] = low[:, :3] * 1.6
    low[:, -3:] = low[:, -3:] * 0.6
    tiles["mureta"] = to_tile(low)
    post = rgb("pedra-escura-1") * 0.8
    post[:3] = post[:3] * 1.4
    post[-4:] = post[-4:] * 0.5
    tiles["mureta-pilar"] = to_tile(post)
    return tiles


def smithy_wall_images() -> dict[str, Image.Image]:
    """Forja: enxaimel na loja (reboco bege com viga de madeira no alto e um poste de madeira a cada poucos tiles) e o
    degrau de pedra da porta sul."""
    tiles: dict[str, Image.Image] = {}
    stone = rgb("pedra-ocre-0")
    lum = stone @ np.array([0.299, 0.587, 0.114])
    plaster = np.array([214, 196, 158], float) * (0.86 + 0.18 * (lum / max(lum.max(), 1)))[:, :, None]
    wood = rgb("madeira-0") * 0.5
    plain = wall_face(plaster, (1.05, 0.8), wood / 0.75, WALL_FACE_ROWS)
    for row, tile in enumerate(plain):
        tiles[f"face-enxaimel-{row}"] = tile
        post = np.asarray(tile.convert("RGB")).astype(float).copy()
        post[:, :6] = wood[:, :6] * (1.1 - 0.15 * row)
        post[:, 6] = post[:, 6] * 0.6
        tiles[f"face-enxaimel-poste-{row}"] = to_tile(post)
    step = rgb("pedra-escura-0").copy() * 0.95
    step[:3] = step[:3] * 1.35  # quina do degrau
    step[-5:] = step[-5:] * 0.5  # espelho
    tiles["degrau-pedra"] = to_tile(step)
    # Pedra manchada de fuligem (em volta da fornalha, da bigorna e dos tanques): a pedra do chão, mais escura e com
    # um tom de carvão.
    for n, base in enumerate(("pedra-escura-0", "pedra-escura-1")):
        tiles[f"pedra-fuligem-{n}"] = to_tile(rgb(base) * np.array([0.66, 0.63, 0.62]))
    return tiles


def carpet_tiles(name: str, cols: int, rows: int, rotate: bool, prefix: str) -> dict[str, Image.Image]:
    """Corta o tapete inteiro (girado de 90 graus, se for o caso) em cols x rows tiles: `prefix-<coluna>-<linha>`."""
    big = Image.open(FLOORS / "grande" / f"{name}.png").convert("RGBA")
    if rotate:
        big = big.transpose(Image.Transpose.ROTATE_90)
    big = big.resize((cols * T, rows * T), Image.Resampling.LANCZOS)
    return {f"{prefix}-{c}-{r}": big.crop((c * T, r * T, (c + 1) * T, (r + 1) * T)) for r in range(rows) for c in range(cols)}


def tile_images() -> list[tuple[str, Image.Image]]:
    """Os tiles que os interiores acrescentam ao tileset da cidade, com nome."""
    carpet = carpet_tiles("tapete-canto", CARPET_SLICES, CARPET_SLICES, False, "tapete-grande")
    runner = carpet_tiles("tapete-faixa", RUNNER_SLICES, RUNNER_SLICES, False, "tapete-vertical")
    return ([(name, floor_image(name)) for name in INTERIOR_FLOORS] + list(wall_images().items())
            + list(guild_wall_images().items()) + list(smithy_wall_images().items()) + list(carpet.items())
            + list(runner.items()))


# ---------------------------------------------------------------- salas


class Room:
    """Uma sala retangular: (ox, oy) é o canto do mapa onde ela começa; w x h em tiles, paredes incluídas."""

    def __init__(self, building: str, ox: int, oy: int, w: int, h: int, floor: str):
        self.building = building
        self.ox, self.oy, self.w, self.h = ox, oy, w, h
        self.kinds = np.full((h, w), floor, dtype=object)
        self.kinds[:TOP_WALL, :] = "parede-face-baixa"
        self.kinds[0, :] = "parede-topo"
        self.kinds[1, :] = "parede-face-alta"
        self.kinds[:, 0] = self.kinds[:, -1] = "parede-topo"
        self.kinds[-1, :] = "parede-topo"
        self.props: list[tuple[str, float, float]] = []  # (nome, centro x, base y) em tiles locais
        self.points: dict[str, list[tuple[float, float]]] = {}  # nome do ponto -> posições (tiles locais)

    def paint(self, kind: str, x0: int, y0: int, x1: int, y1: int) -> None:
        """Pinta o chão no retângulo (inclusive)."""
        self.kinds[y0 : y1 + 1, x0 : x1 + 1] = kind

    def carpet(self, prefix: str, cols: int, rows: int, x0: int, y0: int, w: int, h: int) -> None:
        """Tapete cortado em cols x rows tiles (`prefix-<coluna>-<linha>`), repetido em ciclo no retângulo w x h."""
        for r in range(h):
            for c in range(w):
                self.kinds[y0 + r, x0 + c] = f"{prefix}-{c % cols}-{r % rows}"

    def nine_slice(self, prefix: str, n: int, x0: int, y0: int, w: int, h: int) -> None:
        """Tapete de w x h a partir de uma amostra cortada em n x n tiles (`prefix-<coluna>-<linha>`): cantos nos cantos,
        bordas e miolo com os tiles do meio da amostra, em ciclo (o tapete cresce sem esticar a moldura)."""
        def pick(i: int, size: int) -> int:
            return 0 if i == 0 else n - 1 if i == size - 1 else 1 + (i - 1) % (n - 2)

        for r in range(h):
            for c in range(w):
                self.kinds[y0 + r, x0 + c] = f"{prefix}-{pick(c, w)}-{pick(r, h)}"

    def wall(self, x0: int, y0: int, x1: int, y1: int, face: bool = False) -> None:
        """Parede interna. Com face: a linha de baixo mostra o tijolo (parede vista de frente, do sul)."""
        self.kinds[y0 : y1 + 1, x0 : x1 + 1] = "parede-topo"
        if face:
            self.kinds[y1, x0 : x1 + 1] = "parede-face-baixa"

    def prop(self, name: str, cx: float, bottom: float) -> None:
        self.props.append((name, cx, bottom))

    def point(self, name: str, x: float, y: float) -> None:
        self.points.setdefault(name, []).append((x, y))

    def region(self) -> tuple[int, int, int, int]:
        return self.ox, self.oy, self.w, self.h


def guild(ox: int, oy: int) -> Room:
    """Salão da Guilda, 32x20 tiles, em "L", na régua do jogador (corpo ~48 px):
    - vazio preto em volta e no canto de cima à esquerda (x 0-7 até y 3);
    - Ala Esquerda (x 2-7): parede de painéis de madeira mais baixa (topo em y 3, face em y 4-6), piso de madeira nobre;
    - divisória (x 8-9): no alto, um bloco de parede (topo y 2-3, face y 4-6) com janela e tocha; no meio (y 7-12), a
      passagem com degraus; embaixo (y 13-18), uma mureta com pilares nas pontas;
    - Foyer (x 10-13): parede de painéis de madeira (topo y 1, face y 2-4) com a porta dupla;
    - Salão Principal (x 14-29): parede de pedra com viga; laterais e parede do sul de madeira.
    Móveis: 3 pilares, estandartes, brasão, crânio com o quadro de contratos, estante; balcão duplo; mesa redonda; tapete
    grande com 4 mesas longas em 2x2 e 2 braseiros; na Ala, quadro, mesa de estudos, púlpito do Bestiário, caixotes e
    outra mesa de mapas. Fileiras alinhadas à grade: balcão nas linhas 6-7, mesas nas 11-12 e 15-17."""
    w, h = 32, 20
    room = Room("guild", ox, oy, w, h, "madeira")
    k = room.kinds
    k[:, :] = "vazio"
    k[7:19, 2:8] = "madeira-nobre"
    k[5:19, 10:30] = "madeira"
    k[7:13, 8:10] = "degrau-madeira"
    k[13:19, 9] = "madeira"
    # Paredes do fundo, em degraus: Ala (topo y 3), bloco da divisória (topo y 2-3), Foyer e Salão (topo y 1).
    k[3, 0:8] = "topo-madeira"
    k[2:4, 8:10] = "topo-madeira"
    k[1, 10:14] = "topo-madeira"
    k[1, 14:30] = "parede-topo"
    for r in range(WALL_FACE_ROWS):
        k[4 + r, 2:10] = f"face-madeira-{r}"
        k[2 + r, 10:14] = f"face-madeira-{r}"
        k[2 + r, 14:30] = f"face-pedra-{r}"
    # Laterais (2 tiles), parede do sul e a mureta da divisória com pilares nas pontas.
    k[3:20, 0:2] = "topo-madeira"
    k[1:20, 30:32] = "topo-madeira"
    k[19, :] = "topo-madeira"
    k[13:19, 8] = "mureta"
    k[13, 8] = k[18, 8] = "mureta-pilar"
    room.nine_slice("tapete-grande", CARPET_SLICES, 11, 10, 18, 5)

    room.prop("porta-guilda", 11.9, 5.05)
    # Parede norte do Salão: pilares; vão 1: estandarte do touro + brasão; vão 2: crânio e o quadro embaixo; vão 3:
    # estandarte do dragão e a estante.
    room.prop("pilar-lanterna-a", 14.8, 5.4)
    room.prop("pilar-lanterna-a", 20.5, 5.4)
    room.prop("pilar-lanterna-b", 26.3, 5.4)
    room.prop("estandarte-a", 16.6, 4.4)
    room.prop("escudo-espadas", 18.6, 4.0)
    room.prop("cranio-chifres", 23.4, 3.0)
    room.prop("quadro-contratos", 23.4, 5.6)
    room.prop("estandarte-b", 28.5, 4.0)
    room.prop("guild_bookshelf", 28.6, 6.6)
    room.prop("balcao-recepcao", 17.0, 7.8)
    room.prop("guild_counter_right", 20.3, 7.8)
    room.prop("mesa-redonda", 26.3, 8.95)
    for base in (12.9, 17.2):
        room.prop("mesa-longa-a", 15.3, base)
        room.prop("mesa-longa-b", 24.4, base)
    room.prop("braseiro-guilda", 10.7, 17.9)
    room.prop("braseiro-guilda", 19.7, 17.4)
    room.prop("guild_wall_window", 30.6, 8.5)
    room.prop("estandarte-a", 30.6, 12.6)
    room.prop("guild_wall_torch", 30.6, 16.0)
    room.prop("guild_wall_window_b", 0.9, 9.0)
    room.prop("guild_wall_window_b", 8.6, 6.6)
    room.prop("guild_wall_torch_b", 9.6, 6.2)
    # Ala Esquerda.
    room.prop("quadro-contratos", 4.9, 7.4)
    room.prop("mesa-bestiario", 4.9, 9.6)
    room.prop("guild_lectern_bestiary", 4.9, 13.6)
    room.prop("guild_scroll_crates", 3.0, 18.4)
    room.prop("mesa-bestiario", 5.8, 18.6)
    room.point("guild-counter", 17.0, 8.5)
    room.point("guild-bestiary", 4.9, 14.5)
    room.point("guild-exit", 11.9, 5.7)
    room.point("arrival", 11.9, 7.9)
    return room


def smithy(ox: int, oy: int) -> Room:
    """Forja do Ferreiro, 26x16 tiles, na régua do jogador: duas alas separadas por uma parede grossa (x 12-13) que desce
    do fundo até y 9, com a passagem aberta embaixo (y 10-14).
    - Loja/Armaria (x 2-11): tábuas, parede de enxaimel, passadeira vermelha (x 5-8) por baixo do balcão da espada; rack
      de canto em "L", tochas, caixote, rack menor, barril, balcão duplo, mesa de manoplas, armaduras e rack embaixo.
    - Oficina (x 14-23): pedra escura com manchas de fuligem; fornalha no meio da parede com correntes e ferramentas dos
      lados; fole, barril sobre caixote, carvão, barril; 1º tanque na divisória, bigorna, 2º tanque com faíscas; pedra
      de amolar e a bancada de lingotes ao longo da parede sul.
    - Parede sul com os cantos chanfrados e a porta em arco no meio, entre 2 tochas sobre pilares baixos, com degraus."""
    w, h = 26, 16
    room = Room("blacksmith", ox, oy, w, h, "madeira")
    k = room.kinds
    k[:, :] = "vazio"
    k[5:15, 2:14] = "madeira"
    k[5:15, 14:24] = "pedra-escura"
    pick = random.Random(17)
    for x0, y0, x1, y1 in ((17, 5, 21, 8), (17, 9, 21, 12), (14, 8, 17, 11), (20, 8, 23, 12)):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                edge = x in (x0, x1) or y in (y0, y1)
                if not edge or pick.random() < 0.5:
                    k[y, x] = "fuligem"
    room.carpet("tapete-vertical", RUNNER_SLICES, RUNNER_SLICES, 5, 6, 4, 9)
    k[1, 0:26] = "topo-madeira"
    for r in range(WALL_FACE_ROWS):
        for x in range(2, 12):
            k[2 + r, x] = f"face-enxaimel-poste-{r}" if (x - 2) % 4 == 0 else f"face-enxaimel-{r}"
        k[2 + r, 14:24] = f"face-pedra-{r}"
    k[1:7, 12:14] = "topo-madeira"
    for r in range(WALL_FACE_ROWS):
        k[7 + r, 12:14] = f"face-pedra-{r}"
    k[1:16, 0:2] = "topo-madeira"
    k[1:16, 24:26] = "topo-madeira"
    k[15, :] = "topo-madeira"
    for y in range(13, 15):
        for x in range(2, 24):
            if (x - 2) + (14 - y) < 2 or (23 - x) + (14 - y) < 2:
                k[y, x] = "topo-madeira"
    k[14, 11] = k[14, 14] = "mureta-pilar"
    k[14, 12:14] = "degrau-pedra"

    room.prop("blacksmith_corner_rack", 4.3, 7.6)
    room.prop("guild_wall_torch", 3.6, 4.3)
    room.prop("guild_wall_torch_b", 7.4, 4.3)
    room.prop("blacksmith_crate", 7.6, 6.1)
    room.prop("rack-armas-1", 10.3, 6.6)
    room.prop("blacksmith_barrel", 11.4, 7.6)
    # Balcão duplo: a base do balcão da extensão (o caixote da frente desce 21 px a mais) alinhada com o da espada.
    room.prop("balcao-ferreiro", 6.8, 10.0)
    room.prop("blacksmith_counter_ext", 9.9, 10.66)
    room.prop("blacksmith_gauntlet_table", 2.7, 11.4)
    room.prop("armadura-a", 2.7, 13.6)
    room.prop("rack-armas-2", 5.0, 14.6)
    room.prop("armadura-b", 9.0, 14.3)
    room.prop("armadura-c", 10.3, 14.3)
    room.prop("fornalha", 18.9, 7.6)
    room.prop("blacksmith_wall_chains", 15.6, 5.6)
    room.prop("blacksmith_wall_tools", 22.0, 5.0)
    room.prop("blacksmith_barrel_crates", 14.7, 7.8)
    room.prop("fole", 16.4, 7.3)
    room.prop("blacksmith_coal_bin", 21.2, 7.0)
    room.prop("blacksmith_barrel", 23.2, 7.0)
    room.prop("tanque-tempera", 15.4, 10.6)
    room.prop("bigorna", 19.0, 11.0)
    room.prop("blacksmith_quench_sparks", 22.4, 11.4)
    room.prop("pedra-amolar", 16.2, 14.4)
    room.prop("blacksmith_ore_bench", 20.5, 14.4)
    room.prop("blacksmith_coal_bin", 22.6, 13.9)
    room.prop("porta-ferreiro", 13.0, 15.4)
    room.prop("guild_wall_torch", 11.5, 14.6)
    room.prop("guild_wall_torch_b", 14.5, 14.6)
    room.point("blacksmith-counter", 6.8, 10.6)
    room.point("blacksmith-anvil", 19.0, 11.5)
    room.point("blacksmith-exit", 13.0, 14.0)
    room.point("arrival", 13.0, 11.6)
    return room


def inn(ox: int, oy: int) -> Room:
    """Estalagem / Casa de Comida, 24x16 tiles, na régua do jogador: salão de madeira com passadeira na entrada, cozinha
    de pedra ocre atrás do balcão longo (forno com caldeirão, açougue, despensa) e, no canto nordeste, a Sala-Forte da
    Linhagem: parede interna, entrada pelo arco de pedra, a grade ao lado, cofres e o Baú no meio."""
    room = Room("inn", ox, oy, 24, 16, "madeira")
    room.paint("pedra-ocre", 1, 3, 14, 6)
    room.paint("tapete-faixa", 7, 11, 8, 14)
    # Sala-Forte: colunas 16-22, linhas 3-6; parede interna de topo na coluna 15 e na linha 7, face na linha 8, com a
    # passagem do arco nas colunas 18-20.
    room.paint("pedra-escura", 16, 3, 22, 6)
    room.wall(15, 3, 15, 8)
    room.wall(16, 7, 22, 8, face=True)
    room.paint("pedra-escura", 18, 7, 20, 8)
    room.paint("tapete-centro", 18, 5, 20, 6)
    room.prop("forno-caldeirao", 7.0, 4.8)
    room.prop("mesa-acougue", 2.6, 5.2)
    room.prop("despensa", 11.8, 5.3)
    room.prop("balcao-comida", 7.2, 7.6)
    room.prop("mesa-refeicao-a", 3.8, 11.0)
    room.prop("mesa-refeicao-b", 11.8, 11.0)
    room.prop("mesa-refeicao-a", 19.2, 12.8)
    room.prop("arco-pedra", 19.0, 9.0)
    room.prop("grade-ferro", 16.9, 9.0)
    room.prop("cofres", 16.7, 4.6)
    room.prop("cofres", 21.9, 4.6)
    room.prop("prop_lineage_chest", 19.0, 5.0)
    room.prop("porta-estalagem", 8.0, 16.0)
    room.point("inn-counter", 7.2, 8.5)
    room.point("inn-chest", 19.0, 5.6)
    room.point("inn-exit", 8.0, 14.5)
    room.point("arrival", 8.0, 12.5)
    return room


def rooms() -> list[Room]:
    """As 3 salas, lado a lado ao leste da cidade, cada uma a INTERIOR_GAP tiles da anterior."""
    out = []
    x = CITY_W + INTERIOR_GAP
    for make in (guild, smithy, inn):
        room = make(x, 4)
        out.append(room)
        x += room.w + INTERIOR_GAP
    return out


def map_width(all_rooms: list[Room]) -> int:
    last = all_rooms[-1]
    return last.ox + last.w + 2


# Retângulo de colisão na base de cada móvel, em frações da imagem (x0, y0, x1, y1). None = não bloqueia (enfeite de
# parede, porta, arco por onde se passa).
FOOTPRINT: dict[str, tuple[float, float, float, float] | None] = {
    "balcao-recepcao": (0.03, 0.55, 0.97, 0.95),
    "mesa-bestiario": (0.03, 0.5, 0.97, 0.95),
    "quadro-contratos": (0.05, 0.85, 0.95, 1.0),
    "estandarte-a": None,
    "estandarte-b": None,
    "mesa-longa-a": (0.02, 0.3, 0.98, 0.95),
    "mesa-longa-b": (0.02, 0.3, 0.98, 0.95),
    "mesa-redonda": (0.05, 0.3, 0.95, 0.95),
    "cranio-chifres": None,
    "escudo-espadas": None,
    "braseiro-guilda": (0.15, 0.6, 0.85, 1.0),
    "pilar-lanterna-a": (0.2, 0.85, 0.8, 1.0),
    "pilar-lanterna-b": (0.2, 0.85, 0.8, 1.0),
    "porta-guilda": None,
    "guild_lectern_bestiary": (0.3, 0.6, 0.72, 0.88),  # só o pedestal: o tapete embaixo é chão
    "guild_bookshelf": (0.03, 0.55, 0.97, 0.98),  # alta e encostada: bloqueia até a parede (sem fresta atrás)
    "guild_scroll_crates": (0.05, 0.45, 0.95, 0.95),
    "guild_counter_right": (0.02, 0.55, 0.98, 0.95),
    "guild_wall_torch": None,
    "guild_wall_torch_b": None,
    "guild_wall_window": None,
    "guild_wall_window_b": None,
    "balcao-ferreiro": (0.02, 0.5, 0.98, 0.95),
    "rack-armas-1": (0.05, 0.45, 0.95, 1.0),  # encostado na parede e na divisória: bloqueia até a parede
    "rack-armas-2": (0.05, 0.75, 0.95, 1.0),
    "rack-armas-3": (0.05, 0.75, 0.95, 1.0),
    "fornalha": (0.05, 0.62, 0.95, 0.98),
    "armadura-a": (0.25, 0.8, 0.75, 1.0),
    "armadura-b": (0.25, 0.8, 0.75, 1.0),
    "armadura-c": (0.25, 0.8, 0.75, 1.0),
    "fole": None,
    "bigorna-tempera": (0.03, 0.5, 0.97, 0.95),
    "porta-ferreiro": None,
    "bancada-lingotes": (0.03, 0.45, 0.97, 0.95),
    "bancada-manoplas": (0.03, 0.45, 0.97, 0.95),
    "tanque-tempera": (0.03, 0.4, 0.97, 0.95),
    "pedra-amolar": (0.1, 0.6, 0.9, 0.98),
    # Rack de canto em "L": a parte inclinada na parede oeste (desce até a base da imagem) e o rack reto da parede
    # norte, mais ao fundo (a base dele fica a 63% da altura da imagem); os dois bloqueiam até a parede.
    "blacksmith_corner_rack": [(0.0, 0.2, 0.42, 1.0), (0.42, 0.2, 1.0, 0.64)],
    "blacksmith_gauntlet_table": (0.05, 0.3, 0.95, 0.95),
    "blacksmith_counter_ext": (0.02, 0.4, 0.98, 0.97),
    "blacksmith_barrel": (0.05, 0.5, 0.95, 0.97),
    "blacksmith_crate": (0.05, 0.45, 0.95, 0.97),
    "blacksmith_barrel_crates": (0.05, 0.45, 0.95, 0.97),
    "blacksmith_wall_chains": None,
    "blacksmith_wall_tools": None,
    "blacksmith_coal_bin": (0.05, 0.5, 0.95, 0.95),
    "blacksmith_quench_sparks": (0.02, 0.38, 0.98, 0.8),
    "blacksmith_ore_bench": (0.02, 0.45, 0.98, 0.95),
    "bigorna": (0.03, 0.5, 0.97, 0.95),
    "balcao-comida": (0.01, 0.45, 0.99, 0.95),
    "mesa-acougue": (0.03, 0.6, 0.97, 0.95),
    "despensa": (0.03, 0.6, 0.97, 0.95),
    "forno-caldeirao": (0.03, 0.6, 0.97, 0.95),
    "mesa-refeicao-a": (0.03, 0.4, 0.97, 0.95),
    "mesa-refeicao-b": (0.03, 0.4, 0.97, 0.95),
    "porta-estalagem": None,
    "arco-pedra": None,
    "grade-ferro": None,
    "cofres": (0.1, 0.7, 0.9, 0.98),
    "prop_lineage_chest": (0.05, 0.55, 0.95, 0.95),
}

# Luzes dos móveis: (tipo, regra). "spots" = cada mancha quente da arte (velas, lanternas); "biggest" = a maior
# mancha vira o tipo e as outras viram vela (fornalha, forno); um número = uma luz só, nessa altura (fração da imagem
# a partir da base), no meio; um par (x, altura) = uma luz só, nesse ponto (frações da imagem; x a partir da esquerda).
LIGHTS: dict[str, tuple[str, str | float | tuple[float, float]]] = {
    "mesa-longa-a": ("vela", "spots"),
    "mesa-longa-b": ("vela", "spots"),
    "mesa-refeicao-a": ("vela", "spots"),
    "mesa-refeicao-b": ("vela", "spots"),
    "pilar-lanterna-a": ("poste", "spots"),
    "pilar-lanterna-b": ("poste", "spots"),
    "braseiro-guilda": ("braseiro", 0.45),
    "fornalha": ("forja", "biggest"),
    "forno-caldeirao": ("forja", "biggest"),
    "bigorna-tempera": ("vela", "spots"),
    "prop_lineage_chest": ("runa", 0.55),
    "mesa-bestiario": ("cristal-pequeno", 0.8),
    "guild_counter_right": ("cristal-pequeno", (0.09, 0.82)),
    "guild_wall_window": ("janela", 0.5),
    "guild_wall_window_b": ("janela", 0.5),
    "guild_wall_torch": ("braseiro", 0.85),
    "guild_wall_torch_b": ("braseiro", 0.85),
    "blacksmith_quench_sparks": ("braseiro", (0.4, 0.4)),
    "blacksmith_ore_bench": ("cristal-medio", (0.9, 0.6)),
}
