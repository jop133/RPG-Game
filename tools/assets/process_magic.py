"""Arte nova das magias do mago: Raio Celestial, Pântano de Lama e Barreira de Gelo.

Entrada (do dono do projeto, fora do git): assets/tilesets/novos tilesets/magias/
    raio/   circuloraio_<direção>.png (64x64) e raioanimacao_frame_000 (1..8).png (88x88)
    terra/  circuloterra_<direção>.png (64x64) e lamaanimacao_frame_000 (1..9).png (84x84)
    gelo/   paredegelo_<direção>.png (64x64) e animacaoquebra_<direção>.gif (9 quadros, 80 a 88 px)
Saída em assets/spells/:
    circle_lightning.png, circle_earth.png   os círculos do chão (a arte de "south": de frente, o cliente achata e gira)
    circle_ice.png                           o círculo de gelo: a pasta gelo/ não tem círculo, então é o do raio
                                             recolorido para azul-gelo (trocar quando houver arte)
    lightning_bolt_sheet.png                 o raio caindo: fita de 8 quadros de 88x88
    mud_pit_sheet.png                        a poça borbulhando: fita de 9 quadros de 84x84 (em laço)
    ice_wall-<direção>.png                   a barreira de pé, uma por direção (64x64)
    ice_break-<direção>.png                  a barreira quebrando: fita de 9 quadros, todos num quadro de 88x88 (as
                                             direções vêm em 80, 84 e 88; cada quadro fica centrado no de 88)
    magic.json                               tamanhos dos quadros e a linha do chão do raio e da poça
e assets/ui/skill_ice_barrier.png: o ícone 64x64 (a barreira sobre o círculo de gelo, na moldura de skill_slot_empty).

PNGs soltos "..._frame_00K (N).png": a ordem é (K + N - 1) mod total (ver process_actions.py; aqui K = 0).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_magic.py
"""

from __future__ import annotations

import colorsys
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets" / "tilesets" / "novos tilesets" / "magias"
OUT = ROOT / "assets" / "spells"
UI = ROOT / "assets" / "ui"
DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
BREAK_FRAME = 88
ICON = 64
# Azul-gelo do círculo de gelo: o matiz (0-1) que substitui o dourado do círculo do raio.
ICE_HUE = 0.53
SEQUENCE_RE = re.compile(r"_frame_(?P<start>\d+) \((?P<n>\d+)\)\.png$")


def sequence(folder: Path, prefix: str) -> list[Image.Image]:
    found = []
    for path in folder.glob(f"{prefix}_frame_*.png"):
        m = SEQUENCE_RE.search(path.name)
        if m:
            found.append((int(m["start"]), int(m["n"]), path))
    total = len(found)
    found.sort(key=lambda item: (item[0] + item[1] - 1) % total)
    return [Image.open(p).convert("RGBA") for _, _, p in found]


def strip(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0))
    return sheet


def centered(frame: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(frame, ((size - frame.width) // 2, (size - frame.height) // 2))
    return canvas


def ground_line(frames: list[Image.Image]) -> int:
    """A linha do chão de uma animação: a mediana da última linha com tinta de cada quadro, menos o meio do anel."""
    bottoms = sorted(f.getbbox()[3] for f in frames if f.getbbox())
    return bottoms[len(bottoms) // 2] - 6


def recolor_ice(image: Image.Image) -> Image.Image:
    """Troca o matiz de tudo o que tem cor por ICE_HUE, mantendo brilho e saturação (o dourado vira azul-gelo)."""
    px = np.asarray(image.convert("RGBA")).astype(float) / 255
    out = px.copy()
    for y in range(px.shape[0]):
        for x in range(px.shape[1]):
            r, g, b, a = px[y, x]
            if a == 0:
                continue
            _, s, v = colorsys.rgb_to_hsv(r, g, b)
            out[y, x, :3] = colorsys.hsv_to_rgb(ICE_HUE, s * 0.85, min(1.0, v * 1.05))
    return Image.fromarray((out * 255).round().astype(np.uint8), "RGBA")


def icon(wall: Image.Image, circle: Image.Image) -> Image.Image:
    """O ícone: a moldura vazia, o círculo de gelo achatado no chão e a barreira por cima, no meio."""
    base = Image.open(UI / "skill_slot_empty.png").convert("RGBA").resize((ICON, ICON), Image.NEAREST)
    ring = circle.crop(circle.getbbox()).resize((40, 20), Image.NEAREST)
    base.alpha_composite(ring, ((ICON - ring.width) // 2, 36))
    art = wall.crop(wall.getbbox())
    scale = min(40 / art.width, 34 / art.height)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.NEAREST)
    base.alpha_composite(art, ((ICON - art.width) // 2, 46 - art.height))
    return base


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raio, terra, gelo = ART / "raio", ART / "terra", ART / "gelo"
    circle_lightning = Image.open(raio / "circuloraio_south.png").convert("RGBA")
    circle_lightning.save(OUT / "circle_lightning.png")
    Image.open(terra / "circuloterra_south.png").convert("RGBA").save(OUT / "circle_earth.png")
    circle_ice = recolor_ice(circle_lightning)
    circle_ice.save(OUT / "circle_ice.png")

    bolt = sequence(raio, "raioanimacao")
    strip(bolt).save(OUT / "lightning_bolt_sheet.png")
    mud = sequence(terra, "lamaanimacao")
    strip(mud).save(OUT / "mud_pit_sheet.png")

    for direction in DIRECTIONS:
        Image.open(gelo / f"paredegelo_{direction}.png").convert("RGBA").save(OUT / f"ice_wall-{direction}.png")
        frames = [f.convert("RGBA") for f in ImageSequence.Iterator(Image.open(gelo / f"animacaoquebra_{direction}.gif"))]
        strip([centered(f, BREAK_FRAME) for f in frames]).save(OUT / f"ice_break-{direction}.png")

    info = {
        "bolt": {"frame": bolt[0].width, "frames": len(bolt), "feet": ground_line(bolt)},
        "mud": {"frame": mud[0].width, "frames": len(mud), "center": mud[0].width / 2},
        "iceBreak": {"frame": BREAK_FRAME, "frames": len(frames)},
        "iceWall": {"frame": 64},
    }
    (OUT / "magic.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    icon(Image.open(gelo / "paredegelo_south.png").convert("RGBA"), circle_ice).save(UI / "skill_ice_barrier.png")
    print(f"raio: {len(bolt)} quadros; lama: {len(mud)} quadros; gelo: 8 direções, quebra em {len(frames)} quadros")
    print(f"{OUT.relative_to(ROOT)}/magic.json: {info}")


if __name__ == "__main__":
    main()
