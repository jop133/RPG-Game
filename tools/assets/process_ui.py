"""Prepara a interface de registro (telas de nome e de classe) e os sprites das classes.

Entrada: assets/tilesets/interface/Humble Gift - Paper UI System v1.1/Sprites/ (pacote Paper UI, Humble Pixel)
         assets/tilesets/perssonagens/ (as 4 classes, 64x64, 8 direções)
Saída:   assets/ui/          peças da interface recoloridas para dark fantasy (papel envelhecido, verde -> carmesim)
                             e tiras de animação (carimbo, revelação do conteúdo)
         assets/characters/<classe>/<direção>.png        sprite parado (idle) de cada direção, 64x64
         assets/characters/<classe>/walk-<direção>.png   caminhada: fita horizontal de quadros 96x96 (dos GIFs de walk/)
         assets/characters/hand_sockets.json             a mão que segura a arma, em cada quadro (ver hand_sockets)

Licença do pacote Paper UI: pode usar e modificar em jogos; NÃO pode redistribuir o pacote (nem modificado).
Por isso o repositório com estes arquivos não deve ser público.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_ui.py
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_ui.py --sockets   (só o hand_sockets.json)
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "assets" / "tilesets" / "interface" / "Humble Gift - Paper UI System v1.1" / "Sprites"
CHARS = ROOT / "assets" / "tilesets" / "perssonagens"
UI_OUT = ROOT / "assets" / "ui"
CHAR_OUT = ROOT / "assets" / "characters"

# Peças usadas: nome de saída -> caminho no pacote.
PIECES = {
    "desk": "Book Desk/1.png",
    "title-header": "Paper UI Pack/Folding & Cutout/2 Headers/1.png",
    "name-header": "Paper UI Pack/Folding & Cutout/2 Headers/4.png",
    "dialogue": "Paper UI Pack/Folding & Cutout/7 Dialogue Box/1.png",
    "sheet": "Paper UI Pack/Folding & Cutout/8 Shop/1.png",
    "banner-left": "Content/10 Banners & Headers/Cutout/6.png",
    "banner-mid": "Content/10 Banners & Headers/Cutout/7.png",
    "banner-right": "Content/10 Banners & Headers/Cutout/8.png",
    "holder-big": "Content/5 Holders/1.png",
    "holder-card": "Content/5 Holders/2.png",
    "field-left": "Content/5 Holders/12.png",
    "field-mid": "Content/5 Holders/13.png",
    "field-right": "Content/5 Holders/14.png",
    "button-left": "Content/4 Buttons/Sliced/16.png",
    "button-mid": "Content/4 Buttons/Sliced/17.png",
    "button-right": "Content/4 Buttons/Sliced/18.png",
    "button-hover-left": "Content/4 Buttons/Sliced/19.png",
    "button-hover-mid": "Content/4 Buttons/Sliced/20.png",
    "button-hover-right": "Content/4 Buttons/Sliced/21.png",
    "highlight-tl": "Content/6 Highlighter/1.png",
    "highlight-tr": "Content/6 Highlighter/2.png",
    "highlight-br": "Content/6 Highlighter/3.png",
    "highlight-bl": "Content/6 Highlighter/4.png",
    "bar-red-left": "Content/3 Progress Bars/1.png",
    "bar-red-mid": "Content/3 Progress Bars/2.png",
    "bar-red-right": "Content/3 Progress Bars/3.png",
    "bar-gold-left": "Content/3 Progress Bars/4.png",
    "bar-gold-mid": "Content/3 Progress Bars/5.png",
    "bar-gold-right": "Content/3 Progress Bars/6.png",
    "bar-empty-left": "Content/3 Progress Bars/7.png",
    "bar-empty-mid": "Content/3 Progress Bars/8.png",
    "bar-empty-right": "Content/3 Progress Bars/9.png",
    "stamp-mark": "Content/9 Stamp/Stamp Mark/1.png",
}
# Animações quadro a quadro -> tira vertical (um quadro embaixo do outro), para CSS com steps().
STRIPS = {
    "stamp-strip": ("Content/9 Stamp/Stamp/Stamped", 20),
    "reveal-dialogue-strip": ("Content Appear Animation/Folding & Cutout/7 Dialogue Box", 44),
    "reveal-sheet-strip": ("Content Appear Animation/Folding & Cutout/8 Shop", 36),
}
# Pastas das classes no pacote do usuário -> id usado no jogo (o mesmo de shared/src/classes.ts).
CLASS_FOLDERS = {"mago": "Mago", "elfo": "Elfo", "barbaro": "Barbaro", "homem_fera": "Homem fera/Homem Fera"}
DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
# Se faltar o GIF de uma direção: lado oeste sai espelhando o leste; diagonal sem par usa a cardinal mais próxima.
MIRROR = {"west": "east", "south-west": "south-east", "north-west": "north-east"}
NEAREST = {"south-east": "south", "south-west": "south", "north-east": "north", "north-west": "north"}
WALK_FRAME = 96  # tamanho de cada quadro dos GIFs de caminhada (o personagem tem a mesma escala do idle, com margem)


def walk_frames(folder: Path, direction: str) -> list[Image.Image] | None:
    gif = folder / "walk" / f"{direction.replace('-', '_')}.gif"
    if not gif.exists():
        return None
    return [frame.convert("RGBA") for frame in ImageSequence.Iterator(Image.open(gif))]


def walk_sheet(folder: Path, direction: str) -> tuple[Image.Image, str]:
    """Fita horizontal com os quadros do GIF da direção (1x, sem reamostrar). Devolve também de onde veio."""
    frames = walk_frames(folder, direction)
    origin = "gif"
    if frames is None and direction in MIRROR and (east := walk_frames(folder, MIRROR[direction])):
        frames, origin = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in east], f"espelho de {MIRROR[direction]}"
    if frames is None and direction in NEAREST:
        frames, origin = walk_frames(folder, NEAREST[direction]), f"cópia de {NEAREST[direction]}"
    if not frames:
        raise SystemExit(f"{folder.name}: sem caminhada para {direction} (nem espelho nem cardinal)")
    sheet = Image.new("RGBA", (WALK_FRAME * len(frames), WALK_FRAME), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        if frame.size != (WALK_FRAME, WALK_FRAME):
            raise SystemExit(f"{folder.name}/{direction}: quadro {frame.size}, esperava {WALK_FRAME}x{WALK_FRAME}")
        sheet.paste(frame, (i * WALK_FRAME, 0))
    return sheet, origin

# Recoloração dark fantasy (por faixa de matiz, mantendo o desenho):
# - verde-azulado dos detalhes -> carmesim escuro
# - azul-ardósia dos contornos e sombras -> sépia escuro
# - creme do papel -> pergaminho envelhecido
PARCHMENT = np.array([0.90, 0.80, 0.62])


def recolor(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).astype(float) / 255
    rgb, alpha = rgba[:, :, :3], rgba[:, :, 3:]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    delta = np.where(mx - mn == 0, 1, mx - mn)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue = np.where(mx == r, ((g - b) / delta) % 6, np.where(mx == g, (b - r) / delta + 2, (r - g) / delta + 4)) * 60
    hue = np.where(mx - mn == 0, 0, hue)
    saturation = np.where(mx == 0, 0, (mx - mn) / np.where(mx == 0, 1, mx))
    out = rgb.copy()

    teal = (hue >= 140) & (hue <= 200) & (saturation > 0.25)
    out[teal] = np.stack([mx[teal] * 0.62, mx[teal] * 0.12, mx[teal] * 0.12], axis=1)

    slate = (hue >= 200) & (hue <= 260) & (saturation > 0.08) & (mx < 0.7)
    out[slate] = np.stack([mx[slate] * 0.62, mx[slate] * 0.45, mx[slate] * 0.33], axis=1)

    paper = (hue >= 20) & (hue <= 60) & (saturation < 0.4) & (mx > 0.6)
    out[paper] = rgb[paper] * PARCHMENT

    return Image.fromarray((np.concatenate([np.clip(out, 0, 1), alpha], axis=2) * 255).astype(np.uint8), "RGBA")


def wax(image: Image.Image) -> Image.Image:
    """Marca do carimbo em cera carmesim: mesma forma e transparência, cor por cima."""
    rgba = np.asarray(image.convert("RGBA")).astype(float)
    light = rgba[:, :, :3].mean(axis=2, keepdims=True) / 255
    crimson = np.array([150, 28, 22]) * (0.75 + 0.5 * light)
    return Image.fromarray(np.concatenate([np.clip(crimson, 0, 255), rgba[:, :, 3:]], axis=2).astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- mão da arma (hand sockets)

# Onde fica a mão DIREITA do personagem (a que segura a arma) no sprite parado de cada direção, em px a partir dos pés
# (centro x 32, pés y 61 no sprite de 64x64), marcada no punho da arte. Olhando para south, south-west e south-east, ela
# fica à esquerda da tela; para north, north-east e north-west, à direita; para east, é a mão de perto; para west, a
# de longe. Em north, north-west e west ela fica atrás do corpo (behindBody). Onde a arte esconde a mão (mago e homem-fera
# em north-west e west), o ponto fica na borda do corpo, do lado dela: o cabo some atrás do tronco e a lâmina aparece.
HAND_IDLE: dict[str, dict[str, tuple[int, int]]] = {
    "barbaro": {"south": (-19, -19), "south-west": (-19, -21), "west": (-8, -21), "north-west": (15, -20),
                "north": (18, -18), "north-east": (15, -16), "east": (-5, -16), "south-east": (-14, -16)},
    "elfo": {"south": (-15, -19), "south-west": (-13, -18), "west": (-9, -19), "north-west": (12, -18),
             "north": (14, -18), "north-east": (13, -17), "east": (1, -15), "south-east": (-9, -16)},
    "homem_fera": {"south": (-17, -19), "south-west": (-16, -23), "west": (-8, -19), "north-west": (7, -19),
                   "north": (14, -19), "north-east": (12, -18), "east": (-4, -16), "south-east": (-12, -15)},
    "mago": {"south": (-18, -21), "south-west": (-16, -23), "west": (-7, -19), "north-west": (8, -19),
             "north": (18, -22), "north-east": (13, -20), "east": (1, -18), "south-east": (-12, -19)},
}
HAND_BEHIND = {"north", "north-west", "west"}
IDLE_FRAME = (64, 32, 61)  # tamanho, centro x e pés y do sprite parado
STRIP_FRAME = (96, 48, 78)  # o mesmo para cada quadro das fitas (caminhada; ataque, quando houver)
HAND_PATCH = 4  # meia largura do molde do punho (9x9 px)
HAND_SEARCH = 8  # quanto a mão pode andar em cada quadro em relação ao parado, em px


def patch_score(frame: np.ndarray, template: np.ndarray, x: int, y: int) -> float:
    """Diferença entre o molde do punho e o pedaço do quadro em (x, y): cor onde os dois têm pixel, mais forma."""
    r = HAND_PATCH
    p = frame[y - r : y + r + 1, x - r : x + r + 1]
    if p.shape != template.shape:
        return float("inf")
    wa = (p[:, :, 3:] > 128).astype(float)
    wt = (template[:, :, 3:] > 128).astype(float)
    return float((((p[:, :, :3] - template[:, :, :3]) ** 2) * wa * wt).sum() + ((wa - wt) ** 2).sum() * 255**2 * 0.6)


def track_hand(template: np.ndarray, frame: np.ndarray, start: tuple[int, int]) -> tuple[int, int]:
    """O punho do molde no quadro: o lugar mais parecido a até HAND_SEARCH px da posição do parado."""
    _, cx, feet = STRIP_FRAME
    ex, ey = cx + start[0], feet + start[1]
    best = min(((patch_score(frame, template, x, y), x, y) for y in range(ey - HAND_SEARCH, ey + HAND_SEARCH + 1)
                for x in range(ex - HAND_SEARCH, ex + HAND_SEARCH + 1)))
    return best[1] - cx, best[2] - feet


def hand_sockets() -> dict:
    """A mão da arma em cada quadro de cada classe, animação e direção: {dx, dy, behindBody}, a partir dos pés.
    Parado: a tabela HAND_IDLE. Caminhada (e ataque, se a classe tiver attack-<direção>.png): o punho do parado como
    molde, procurado em cada quadro da fita perto do mesmo lugar."""
    out: dict = {}
    r = HAND_PATCH
    _, icx, ifeet = IDLE_FRAME
    size = STRIP_FRAME[0]
    for class_id, hands in HAND_IDLE.items():
        folder = CHAR_OUT / class_id
        sockets: dict = {"idle": {}, "walk": {}}
        for direction in DIRECTIONS:
            dx, dy = hands[direction]
            behind = direction in HAND_BEHIND
            sockets["idle"][direction] = [{"dx": dx, "dy": dy, "behindBody": behind}]
            idle = np.asarray(Image.open(folder / f"{direction}.png").convert("RGBA")).astype(float)
            template = idle[ifeet + dy - r : ifeet + dy + r + 1, icx + dx - r : icx + dx + r + 1]
            for animation in ("walk", "attack"):
                strip_path = folder / f"{animation}-{direction}.png"
                if not strip_path.exists():
                    continue
                strip = np.asarray(Image.open(strip_path).convert("RGBA")).astype(float)
                frames_ = [strip[:, i * size : (i + 1) * size] for i in range(strip.shape[1] // size)]
                tracked = [track_hand(template, f, (dx, dy)) for f in frames_]
                sockets.setdefault(animation, {})[direction] = [{"dx": x, "dy": y, "behindBody": behind} for x, y in tracked]
        out[class_id] = sockets
    path = CHAR_OUT / "hand_sockets.json"
    path.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    counts = {c: {a: sum(len(v) for v in d.values()) for a, d in s_.items()} for c, s_ in out.items()}
    print(f"{path.relative_to(ROOT)}: {counts}")
    return out


def frames(folder: Path, count: int) -> list[Image.Image]:
    return [Image.open(folder / f"{i}.png").convert("RGBA") for i in range(1, count + 1)]


def main() -> None:
    UI_OUT.mkdir(parents=True, exist_ok=True)
    for name, rel in PIECES.items():
        recolor(Image.open(PACK / rel)).save(UI_OUT / f"{name}.png")
    wax(Image.open(PACK / PIECES["stamp-mark"])).save(UI_OUT / "stamp-mark.png")
    for name, (rel, count) in STRIPS.items():
        images = [recolor(f) for f in frames(PACK / rel, count)]
        w, h = images[0].size
        strip = Image.new("RGBA", (w, h * count), (0, 0, 0, 0))
        for i, image in enumerate(images):
            strip.paste(image, (0, i * h))
        strip.save(UI_OUT / f"{name}.png")
        print(f"{name}: {count} quadros de {w}x{h}")
    for class_id, folder in CLASS_FOLDERS.items():
        out = CHAR_OUT / class_id
        out.mkdir(parents=True, exist_ok=True)
        for direction in DIRECTIONS:
            shutil.copyfile(CHARS / folder / "Idle" / "rotations" / f"{direction}.png", out / f"{direction}.png")
            sheet, origin = walk_sheet(CHARS / folder, direction)
            sheet.save(out / f"walk-{direction}.png")
            if origin != "gif":
                print(f"aviso: {class_id} {direction}: {origin}")
        print(f"{class_id}: caminhada em 8 direções, {sheet.width // WALK_FRAME} quadros de {WALK_FRAME}x{WALK_FRAME}")
    print(f"{len(PIECES)} peças em {UI_OUT.relative_to(ROOT)}, {len(CLASS_FOLDERS)} classes em {CHAR_OUT.relative_to(ROOT)}")
    hand_sockets()


if __name__ == "__main__":
    if "--sockets" in sys.argv:
        hand_sockets()
    else:
        main()
