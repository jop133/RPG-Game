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
    """Salão da Guilda, 44x28 tiles, em "L" (as coordenadas abaixo são as da planta de referência):
    - vazio preto em volta e no canto de cima à esquerda (x 0-10 até y 5);
    - Ala Esquerda (x 2-10): parede de painéis de madeira mais baixa (topo em y 6, face em y 7-9), piso de madeira nobre;
    - divisória (x 11-13): no alto, um bloco de parede (topo y 3-6, face y 7-9, a mesma linha da Ala) com janela e
      tocha na quina; no meio (y 10-18), a passagem com degraus de madeira; embaixo (y 19-26), uma mureta com 2 pilares;
    - Foyer (x 14-18): parede de painéis de madeira (topo y 2, face y 3-5) com a porta dupla;
    - Salão Principal (x 19-41): parede de pedra com viga (topo y 2, face y 3-5); laterais e parede do sul de madeira.
    Móveis: 3 pilares, estandartes, brasão, crânio com o quadro de contratos, estante; balcão duplo (y 8-11); mesa
    redonda; tapete grande (x 15-40, y 15-20) com 4 mesas longas em 2x2 e 2 braseiros; na Ala, quadro, mesa de estudos,
    púlpito do Bestiário, caixotes de pergaminhos e outra mesa de mapas."""
    w, h = 44, 28
    room = Room("guild", ox, oy, w, h, "madeira")
    k = room.kinds
    k[:, :] = "vazio"
    # Pisos.
    k[10:27, 2:11] = "madeira-nobre"
    k[6:27, 14:42] = "madeira"
    k[10:19, 11:14] = "degrau-madeira"
    k[19:27, 11] = "madeira-nobre"
    k[19:27, 13] = "madeira"
    # Paredes do fundo, em degraus: Ala (y 6-9), bloco da divisória (y 3-9), Foyer e Salão (y 2-5).
    k[6, 0:11] = "topo-madeira"
    k[3:7, 11:14] = "topo-madeira"
    k[2, 14:19] = "topo-madeira"
    k[2, 19:42] = "parede-topo"
    for r in range(WALL_FACE_ROWS):
        k[7 + r, 2:14] = f"face-madeira-{r}"
        k[3 + r, 14:19] = f"face-madeira-{r}"
        k[3 + r, 19:42] = f"face-pedra-{r}"
    # Laterais (2 tiles), parede do sul e a mureta da divisória com pilares nas pontas.
    k[6:28, 0:2] = "topo-madeira"
    k[2:28, 42:44] = "topo-madeira"
    k[27, :] = "topo-madeira"
    k[19:27, 12] = "mureta"
    k[19, 12] = k[26, 12] = "mureta-pilar"
    room.nine_slice("tapete-grande", CARPET_SLICES, 15, 15, 26, 6)

    # Foyer: porta dupla (saída).
    room.prop("porta-guilda", 16.5, 6.05)
    # Parede norte do Salão: pilares em x 19, 27 e 36; vão 1: estandarte do touro + brasão; vão 2: crânio no alto e o
    # quadro de contratos embaixo; vão 3: estandarte do dragão no alto e a estante encostada embaixo.
    room.prop("pilar-lanterna-a", 19.5, 6.9)
    room.prop("pilar-lanterna-a", 27.5, 6.9)
    room.prop("pilar-lanterna-b", 36.5, 6.9)
    room.prop("estandarte-a", 22.5, 6.0)
    room.prop("escudo-espadas", 25.0, 5.4)
    room.prop("cranio-chifres", 31.9, 4.4)
    room.prop("quadro-contratos", 31.9, 7.9)
    room.prop("estandarte-b", 39.6, 5.4)
    room.prop("guild_bookshelf", 39.7, 9.0)
    # Balcão duplo, colado: o da balança (mercador) e a metade direita, com o cristal.
    room.prop("balcao-recepcao", 22.9, 11.9)
    room.prop("guild_counter_right", 30.7, 11.9)
    room.prop("mesa-redonda", 37.5, 14.0)
    # Mesas longas 2x2: a de cima sobre o tapete, a de baixo logo abaixo dele; braseiros ao lado da mureta e entre as
    # mesas de baixo.
    for base in (19.1, 25.0):
        room.prop("mesa-longa-a", 24.4, base)
        room.prop("mesa-longa-b", 36.4, base)
    room.prop("braseiro-guilda", 16.5, 24.5)
    room.prop("braseiro-guilda", 30.3, 24.5)
    # Parede direita: janela, estandarte e tocha. Parede esquerda: janela. Bloco da divisória: janela e tocha na quina.
    room.prop("guild_wall_window", 42.9, 11.5)
    room.prop("estandarte-a", 42.9, 17.0)
    room.prop("guild_wall_torch", 42.9, 22.0)
    room.prop("guild_wall_window_b", 0.9, 13.0)
    room.prop("guild_wall_window_b", 12.0, 9.6)
    room.prop("guild_wall_torch_b", 13.7, 9.2)
    # Ala Esquerda: quadro na parede, mesa de estudos, púlpito do Bestiário no meio, caixotes no canto e outra mesa.
    room.prop("quadro-contratos", 7.0, 10.3)
    room.prop("mesa-bestiario", 7.0, 14.0)
    room.prop("guild_lectern_bestiary", 7.0, 20.0)
    room.prop("guild_scroll_crates", 3.8, 25.6)
    room.prop("mesa-bestiario", 8.0, 26.0)
    room.point("guild-counter", 22.9, 12.8)
    room.point("guild-bestiary", 7.0, 20.5)
    room.point("guild-exit", 16.5, 6.9)
    room.point("arrival", 16.5, 9.5)
    return room


def smithy(ox: int, oy: int) -> Room:
    """Forja do Ferreiro, 42x26 tiles (coordenadas da planta de referência): duas alas separadas por uma parede grossa
    (x 20-21) que desce do fundo até y 14, com a passagem aberta embaixo (y 15-21).
    - Loja/Armaria (x 3-19): piso de tábuas, parede de enxaimel, passadeira vermelha (x 10-13, y 8-21) por baixo do
      balcão da espada; rack de canto em "L", tochas, rack menor, caixote, barril, balcão duplo (espada + extensão das
      moedas), mesa de manoplas na parede oeste, armaduras e rack embaixo.
    - Oficina (x 22-39): pedra escura com manchas de fuligem, parede de pedra; fornalha no meio da parede com correntes à
      esquerda e ferramentas à direita; fole, barril sobre caixote, reservatório de carvão, barril; 1º tanque de
      têmpera na divisória, bigorna na frente da fornalha, 2º tanque com faíscas; pedra de amolar e a bancada de
      lingotes com o caixote de cristais ao longo da parede sul.
    - Parede sul com os cantos chanfrados e a porta em arco no meio (x 19-22), entre 2 tochas sobre pilares baixos, com
      degraus de pedra."""
    w, h = 42, 26
    room = Room("blacksmith", ox, oy, w, h, "madeira")
    k = room.kinds
    k[:, :] = "vazio"
    k[6:22, 3:20] = "madeira"
    k[6:22, 20:22] = "madeira"
    k[6:22, 22:40] = "pedra-escura"
    # Manchas de fuligem em volta da fornalha, da bigorna e dos tanques: o miolo todo, a borda só em parte (sorteio
    # fixo), para a mancha não ser um retângulo.
    pick = random.Random(17)
    for x0, y0, x1, y1 in ((26, 6, 34, 10), (28, 13, 33, 17), (22, 11, 26, 15), (33, 11, 39, 16)):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                edge = x in (x0, x1) or y in (y0, y1)
                if not edge or pick.random() < 0.5:
                    k[y, x] = "fuligem"
    room.carpet("tapete-vertical", RUNNER_SLICES, RUNNER_SLICES, 10, 8, 4, 14)
    # Paredes do fundo (topo em y 2, face em y 3-5): enxaimel com postes a cada 4 tiles na loja, pedra na oficina.
    k[2, 1:41] = "topo-madeira"
    for r in range(WALL_FACE_ROWS):
        for x in range(3, 20):
            k[3 + r, x] = f"face-enxaimel-poste-{r}" if (x - 3) % 4 == 0 else f"face-enxaimel-{r}"
        k[3 + r, 22:40] = f"face-pedra-{r}"
    # Divisória: topo de y 2 a 11 e a ponta vista de frente (face de pedra) em y 12-14.
    k[2:12, 20:22] = "topo-madeira"
    for r in range(WALL_FACE_ROWS):
        k[12 + r, 20:22] = f"face-pedra-{r}"
    # Laterais, parede sul e os cantos chanfrados (3 tiles na diagonal).
    k[2:23, 1:3] = "topo-madeira"
    k[2:23, 40:42] = "topo-madeira"
    k[22, 1:41] = "topo-madeira"
    for y in range(19, 22):
        for x in range(3, 40):
            if (x - 3) + (21 - y) < 3 or (39 - x) + (21 - y) < 3:
                k[y, x] = "topo-madeira"
    # Porta sul: pilares baixos dos lados e degraus de pedra.
    k[21, 18] = k[21, 23] = "mureta-pilar"
    k[21, 19:23] = "degrau-pedra"

    # Loja: rack de canto, tochas na parede, caixote, rack menor e barril encostado na divisória.
    room.prop("blacksmith_corner_rack", 8.75, 10.5)
    room.prop("guild_wall_torch", 8.0, 5.5)
    room.prop("guild_wall_torch_b", 14.8, 5.5)
    room.prop("blacksmith_crate", 15.6, 8.0)
    room.prop("rack-armas-1", 18.0, 8.6)
    room.prop("blacksmith_barrel", 19.0, 10.6)
    # Balcão duplo: o da espada (por cima da passadeira) e a extensão das moedas, colada, até a divisória. A extensão
    # traz o caixote da frente embaixo: a base da imagem fica 1,24 tile abaixo da do balcão.
    room.prop("balcao-ferreiro", 11.0, 14.6)
    room.prop("blacksmith_counter_ext", 17.45, 15.84)
    room.prop("blacksmith_gauntlet_table", 4.6, 16.8)
    room.prop("armadura-a", 4.3, 19.9)
    room.prop("rack-armas-2", 7.4, 20.9)
    room.prop("armadura-b", 15.5, 20.6)
    room.prop("armadura-c", 17.5, 20.6)
    # Oficina: fornalha no meio da parede, correntes à esquerda e ferramentas à direita (na parede); fole, barril sobre
    # caixote, carvão e barril no chão.
    room.prop("fornalha", 30.0, 9.0)
    room.prop("blacksmith_wall_chains", 24.5, 7.9)
    room.prop("blacksmith_wall_tools", 35.6, 7.0)
    room.prop("blacksmith_barrel_crates", 23.4, 10.8)
    room.prop("fole", 26.0, 9.6)
    room.prop("blacksmith_coal_bin", 35.0, 10.0)
    room.prop("blacksmith_barrel", 38.3, 9.5)
    room.prop("tanque-tempera", 24.0, 15.0)
    room.prop("bigorna", 30.5, 16.1)
    room.prop("blacksmith_quench_sparks", 36.6, 16.8)
    room.prop("pedra-amolar", 25.5, 21.6)
    room.prop("blacksmith_ore_bench", 33.3, 21.3)
    room.prop("blacksmith_coal_bin", 36.6, 18.0)
    # Porta sul entre as tochas dos pilares.
    room.prop("porta-ferreiro", 21.0, 22.6)
    room.prop("guild_wall_torch", 18.5, 21.6)
    room.prop("guild_wall_torch_b", 23.5, 21.6)
    room.point("blacksmith-counter", 11.0, 15.5)
    room.point("blacksmith-anvil", 30.5, 16.5)
    room.point("blacksmith-exit", 21.0, 21.0)
    room.point("arrival", 21.0, 18.0)
    return room


def inn(ox: int, oy: int) -> Room:
    """Estalagem / Casa de Comida: salão de madeira com tapete na entrada, cozinha de pedra ocre atrás do balcão
    longo (forno com caldeirão, açougue, despensa) e, no canto nordeste, a Sala-Forte da Linhagem: parede interna,
    entrada pelo arco de pedra, a grade de ferro ao lado, cofres e o Baú no pedestal no meio."""
    room = Room("inn", ox, oy, 32, 22, "madeira")
    room.paint("pedra-ocre", 1, 3, 19, 8)
    room.paint("tapete-faixa", 10, 15, 11, 20)
    # Sala-Forte: colunas 21-30, linhas 3-9; parede interna de topo na coluna 20 e na linha 10, face na linha 11,
    # com a passagem do arco nas colunas 25-27.
    room.paint("pedra-escura", 21, 3, 30, 9)
    room.wall(20, 3, 20, 11)
    room.wall(21, 10, 30, 11, face=True)
    room.paint("pedra-escura", 25, 10, 27, 11)
    room.paint("tapete-centro", 25, 7, 27, 8)
    room.prop("forno-caldeirao", 10.0, 5.2)
    room.prop("mesa-acougue", 3.5, 6.6)
    room.prop("despensa", 16.5, 6.6)
    room.prop("balcao-comida", 10.0, 9.0)
    room.prop("mesa-refeicao-a", 5.0, 15.0)
    room.prop("mesa-refeicao-b", 16.0, 15.0)
    room.prop("mesa-refeicao-a", 25.5, 17.5)
    room.prop("arco-pedra", 26.0, 12.0)
    room.prop("grade-ferro", 23.0, 12.0)
    room.prop("cofres", 22.0, 5.5)
    room.prop("cofres", 29.5, 5.5)
    room.prop("prop_lineage_chest", 26.0, 6.7)
    room.prop("porta-estalagem", 11.0, 22.0)
    room.point("inn-counter", 10.0, 10.2)
    room.point("inn-chest", 26.0, 8.6)
    room.point("inn-exit", 11.0, 20.4)
    room.point("arrival", 11.0, 18.0)
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
    # norte, mais ao fundo (a base dele fica a 63% da altura da imagem).
    "blacksmith_corner_rack": [(0.0, 0.5, 0.42, 1.0), (0.42, 0.5, 1.0, 0.64)],
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
