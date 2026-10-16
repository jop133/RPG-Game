"""Interiores dos 3 prédios da cidade (Salão da Guilda, Forja do Ferreiro, Estalagem), montados dentro do city.json.

Cada interior é uma sala fechada, ao leste da cidade, separada dela e das outras por mais de INTERIOR_GAP tiles de
vazio (sólido e preto): o servidor manda a cada jogador só quem está a até VIEW_RADIUS (520 px), então quem está num
prédio não vê a rua nem os outros prédios, e quem está no mesmo prédio se vê. A porta da rua leva à chegada de
dentro; a porta de dentro, de volta à rua (o servidor teletransporta; o cliente faz um fade e prende a câmera na
região, camada "regioes").

Usado por build_city.py, que monta o tileset de chão (pisos internos, paredes e vazio vêm daqui) e grava o mapa.
"""

from __future__ import annotations

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
    "madeira-rustica": ["madeira-rustica-0", "madeira-rustica-1"],
    "pedra-ocre": ["pedra-ocre-0"],
    "pedra-escura": ["pedra-escura-0", "pedra-escura-1"],
    "tijolo": ["tijolo-0", "tijolo-fuligem"],
    "tapete-faixa": ["tapete-faixa"],
    "tapete-nobre": ["tapete-liso"],
    "tapete-centro": ["tapete-centro"],
}
# Tapetes cortados da amostra inteira (interior-floor/grande/): o quadrado com moldura dourada da Ala Esquerda da
# Guilda (RUG x RUG tiles) e a passadeira horizontal do salão (RUNNER_ROWS de altura, RUNNER_COLS tiles que se repetem).
RUG = 5
RUNNER_ROWS = 4
RUNNER_COLS = 4
RUG_TILES = [f"tapete-quadrado-{c}-{r}" for r in range(RUG) for c in range(RUG)]
RUNNER_TILES = [f"tapete-passadeira-{c}-{r}" for r in range(RUNNER_ROWS) for c in range(RUNNER_COLS)]
WALLS = ["parede-topo", "parede-face-alta", "parede-face-baixa", "vazio", "topo-madeira", "face-pedra-alta",
         "face-pedra-baixa", "face-madeira-alta", "face-madeira-baixa"]


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


def two_tile_face(texture: np.ndarray, light: tuple[float, float], beam: np.ndarray | None) -> tuple[Image.Image, Image.Image]:
    """Face de parede de duas linhas (vista de frente): a textura repetida, clareando no alto e escurecendo até o pé,
    com rodapé de madeira escura e, se houver, uma viga de madeira no alto."""
    face = np.concatenate([texture, texture]) * np.linspace(light[0], light[1], 2 * T)[:, None, None]
    if beam is not None:
        face[:6] = beam[:6] * 0.75
        face[6:8] = beam[6:8] * 0.35  # sombra embaixo da viga
    face[-6:] = rgb("madeira-0")[:6] * 0.4  # rodapé
    face[-7] = face[-7] * 0.5
    return to_tile(face[:T]), to_tile(face[T:])


def guild_wall_images() -> dict[str, Image.Image]:
    """Paredes da Guilda: pedra cinza com viga e rodapé (Salão Principal), painéis de madeira na vertical (Ala
    Esquerda), madeira escura vista de cima (laterais, divisória, parede do sul) e o degrau da divisória."""
    stone_high, stone_low = two_tile_face(rgb("pedra-escura-0"), (1.1, 0.75), rgb("madeira-0"))
    wood_high, wood_low = two_tile_face(rgb("madeira-1"), (1.0, 0.6), None)
    top = rgb("madeira-1") * 0.3
    top[:, :2] = top[:, :2] * 1.8  # quinas que pegam luz
    top[:, -2:] = top[:, -2:] * 1.8
    step = rgb("madeira-2").copy()
    step[:, -4:] = step[:, -4:] * 0.45  # sombra do degrau, do lado do salão
    step[:, :2] = step[:, :2] * 1.25
    return {"face-pedra-alta": stone_high, "face-pedra-baixa": stone_low, "face-madeira-alta": wood_high,
            "face-madeira-baixa": wood_low, "topo-madeira": to_tile(top), "degrau-madeira": to_tile(step)}


def carpet_tiles(name: str, cols: int, rows: int, rotate: bool, prefix: str) -> dict[str, Image.Image]:
    """Corta o tapete inteiro (girado de 90 graus, se for o caso) em cols x rows tiles: `prefix-<coluna>-<linha>`."""
    big = Image.open(FLOORS / "grande" / f"{name}.png").convert("RGBA")
    if rotate:
        big = big.transpose(Image.Transpose.ROTATE_90)
    big = big.resize((cols * T, rows * T), Image.Resampling.LANCZOS)
    return {f"{prefix}-{c}-{r}": big.crop((c * T, r * T, (c + 1) * T, (r + 1) * T)) for r in range(rows) for c in range(cols)}


def tile_images() -> list[tuple[str, Image.Image]]:
    """Os tiles que os interiores acrescentam ao tileset da cidade, com nome."""
    rug = carpet_tiles("tapete-centro", RUG, RUG, False, "tapete-quadrado")
    runner = carpet_tiles("tapete-faixa", RUNNER_COLS, RUNNER_ROWS, True, "tapete-passadeira")
    return ([(name, floor_image(name)) for name in INTERIOR_FLOORS] + list(wall_images().items())
            + list(guild_wall_images().items()) + list(rug.items()) + list(runner.items()))


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
    """Salão da Guilda em duas alas (30x19 tiles). Colunas: 0 e 29 paredes laterais de madeira escura, 1-8 a Ala
    Esquerda (estudos e Bestiário, piso de madeira nobre, parede do fundo de painéis de madeira, uma linha mais recuada),
    9 a divisória de madeira (aberta nas linhas 4-7, perto da porta dupla, com degrau) e 10-28 o Salão Principal
    (parede de pedra cinza com viga e rodapé, 3 pilares com lanterna, balcão do mercador, mesa redonda, passadeira e 4
    mesas longas em 2x2). Os móveis ficam em linhas alinhadas à grade: balcão nas linhas 6-7, mesas longas nas 10-11 e
    14-15, corredores de 2 linhas entre elas."""
    w, h, divider = 30, 19, 9
    room = Room("guild", ox, oy, w, h, "madeira")
    k = room.kinds
    k[:, :] = "madeira"
    k[:, 1:divider] = "madeira-nobre"
    # Parede do fundo: no Salão, 2 linhas de topo + face de pedra (linhas 2-3); na Ala, 1 de topo + face de madeira.
    k[0:2, divider:] = "parede-topo"
    k[2, divider:] = "face-pedra-alta"
    k[3, divider:] = "face-pedra-baixa"
    k[0, :divider] = "topo-madeira"
    k[1, 1:divider] = "face-madeira-alta"
    k[2, 1:divider] = "face-madeira-baixa"
    k[0:4, divider] = "parede-topo"
    # Laterais, parede do sul e divisória (aberta nas linhas 4-7, onde fica o degrau).
    k[:, 0] = k[:, -1] = "topo-madeira"
    k[-1, :] = "topo-madeira"
    k[8 : h - 1, divider] = "topo-madeira"
    k[4:8, divider] = "degrau-madeira"
    room.carpet("tapete-quadrado", RUG, RUG, 2, 9, RUG, RUG)
    room.carpet("tapete-passadeira", RUNNER_COLS, RUNNER_ROWS, divider + 1, 9, w - divider - 2, RUNNER_ROWS)

    # Parede norte do Salão: porta dupla à esquerda; pilar, estandarte do touro e brasão; pilar do meio; crânio com o
    # quadro de contratos embaixo; pilar; estandarte do dragão.
    room.prop("porta-guilda", 11.6, 4.05)
    room.prop("pilar-lanterna-a", 14.2, 4.9)
    room.prop("estandarte-a", 15.7, 3.8)
    room.prop("escudo-espadas", 17.3, 3.4)
    room.prop("pilar-lanterna-a", 18.8, 4.9)
    # O quadro acaba antes da coluna 23: por ela se dá a volta inteira na mesa redonda.
    room.prop("cranio-chifres", 21.3, 2.2)
    room.prop("quadro-contratos", 21.3, 5.3)
    room.prop("pilar-lanterna-b", 24.4, 4.9)
    room.prop("estandarte-b", 26.7, 3.8)
    # Balcão do mercador na frente dos pilares e do quadro; mesa redonda à direita, com o corredor da parede livre.
    room.prop("balcao-recepcao", 18.2, 7.6)
    room.prop("mesa-redonda", 25.8, 8.05)
    # Mesas longas em 2x2: a fileira do meio sobre a passadeira, a de baixo perto da parede do sul.
    for base in (12.1, 16.1):
        room.prop("mesa-longa-a", 14.0, base)
        room.prop("mesa-longa-b", 24.0, base)
    room.prop("braseiro-guilda", 10.9, 17.7)
    room.prop("braseiro-guilda", 19.0, 15.9)
    # Ala Esquerda: quadro de contratos na parede e a mesa de estudos embaixo (Bestiário); tapete no meio; outra mesa
    # de mapas embaixo.
    room.prop("quadro-contratos", 4.5, 4.4)
    room.prop("mesa-bestiario", 4.5, 7.4)
    room.prop("mesa-bestiario", 4.5, 16.9)
    room.point("guild-counter", 18.2, 8.5)
    room.point("guild-bestiary", 4.5, 8.5)
    room.point("guild-exit", 11.6, 4.7)
    room.point("arrival", 11.6, 7.2)
    return room


def smithy(ox: int, oy: int) -> Room:
    """Forja do Ferreiro: pedra escura, tijolo com fuligem em volta da fornalha, madeira rústica no atendimento.
    Balcão (catálogo) e bigorna (receitas)."""
    room = Room("blacksmith", ox, oy, 26, 18, "pedra-escura")
    room.paint("tijolo", 14, 3, 24, 8)
    room.paint("madeira-rustica", 1, 9, 11, 16)
    room.prop("rack-armas-1", 3.0, 5.0)
    room.prop("rack-armas-2", 6.5, 5.0)
    room.prop("rack-armas-3", 10.0, 5.0)
    room.prop("fornalha", 19.0, 6.5)
    room.prop("fole", 22.5, 6.6)
    room.prop("bigorna-tempera", 18.5, 10.5)
    room.prop("bancada-lingotes", 23.0, 10.5)
    room.prop("bancada-manoplas", 23.0, 14.0)
    room.prop("tanque-tempera", 15.5, 15.5)
    room.prop("pedra-amolar", 19.5, 15.0)
    room.prop("balcao-ferreiro", 6.5, 11.5)
    room.prop("armadura-a", 2.0, 15.5)
    room.prop("armadura-b", 4.0, 15.5)
    room.prop("armadura-c", 10.0, 15.5)
    room.prop("porta-ferreiro", 13.0, 18.0)
    room.point("blacksmith-counter", 6.5, 12.6)
    room.point("blacksmith-anvil", 18.5, 11.6)
    room.point("blacksmith-exit", 13.0, 16.4)
    room.point("arrival", 13.0, 14.0)
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
    "balcao-ferreiro": (0.02, 0.5, 0.98, 0.95),
    "rack-armas-1": (0.05, 0.75, 0.95, 1.0),
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
# a partir da base).
LIGHTS: dict[str, tuple[str, str | float]] = {
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
}
