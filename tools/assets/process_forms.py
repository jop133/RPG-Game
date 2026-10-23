"""Espíritos Elementais do Elfo e a Forma de Urso do Homem-Fera.

Entrada (do dono do projeto, fora do git): assets/tilesets/novos tilesets/
    espiritos/{agua,fogo,terra,vento}/   espirito<x>_<direção>.png (68x68) e espirito<x>animacao_<direção>.gif
                                         (9 quadros; nomes com "northeast" ou "__northwest": normalizados)
    homemferaurso/                       homemurso_<direção>.png (64x64) e walk<direção>[_]frame_000 (1..6).png (96x96)
    transformação_fera/                  form_South_0001..0009.png (88x88, a pose, só de frente) e
                                         animacaoprimal_frame_000 (1..9).png (64x64, a explosão primal)
Saída:
    assets/spirits/<elemento>-<direção>.png        parado (68x68)
    assets/spirits/<elemento>-float-<direção>.png  flutuando: fita de 9 quadros de 68x68
    assets/characters/urso/<direção>.png           o Homem-Urso parado (64x64, pés na linha 61, como as classes)
    assets/characters/urso/walk-<direção>.png      andando: fita de 6 quadros de 96x96 (como as classes)
    assets/effects/bear_pose.png                   a pose da transformação: fita de 9 quadros de 88x88
    assets/effects/primal.png                      a explosão primal: fita de 9 quadros de 64x64
    assets/effects/forms.json                      quadros e linha dos pés da pose e da explosão
    assets/ui/skill_spirit_{water,fire,earth,wind}.png e skill_bear_transform.png   ícones 64x64 na moldura vazia

PNGs soltos "..._frame_00K (N).png": a ordem é (K + N - 1) mod total (ver process_actions.py).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_forms.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets" / "tilesets" / "novos tilesets"
SPIRITS_OUT = ROOT / "assets" / "spirits"
BEAR_OUT = ROOT / "assets" / "characters" / "urso"
EFFECTS = ROOT / "assets" / "effects"
UI = ROOT / "assets" / "ui"
DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
# Pasta -> id do elemento no jogo (skills spirit_<id>).
SPIRITS = {"agua": "water", "fogo": "fire", "terra": "earth", "vento": "wind"}
ICON = 64
WALK_RE = re.compile(r"walk(?P<dir>[a-z]+?)_?frame_(?P<start>\d+) \((?P<n>\d+)\)\.png$", re.IGNORECASE)
FRAME_RE = re.compile(r"_frame_(?P<start>\d+) \((?P<n>\d+)\)\.png$")


def hyphenate(raw: str) -> str:
    raw = raw.lower().strip("_").replace("_", "-")
    for vertical in ("north", "south"):
        if raw.startswith(vertical) and raw != vertical and "-" not in raw:
            return f"{vertical}-{raw[len(vertical):]}"
    return raw


def loop_order(items: list[tuple[int, int, Path]]) -> list[Image.Image]:
    total = len(items)
    items.sort(key=lambda item: (item[0] + item[1] - 1) % total)
    return [Image.open(p).convert("RGBA") for _, _, p in items]


def strip(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        if frame.size != (w, h):
            raise SystemExit(f"quadro {frame.size}, esperava {w}x{h}")
        sheet.paste(frame, (i * w, 0))
    return sheet


def icon(art: Image.Image) -> Image.Image:
    """A arte (recortada no que tem tinta) centrada na moldura vazia, cabendo em 44x44."""
    base = Image.open(UI / "skill_slot_empty.png").convert("RGBA").resize((ICON, ICON), Image.NEAREST)
    art = art.crop(art.getbbox())
    scale = min(44 / art.width, 44 / art.height)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.NEAREST)
    base.alpha_composite(art, ((ICON - art.width) // 2, (ICON - art.height) // 2))
    return base


def spirits() -> None:
    SPIRITS_OUT.mkdir(parents=True, exist_ok=True)
    for folder, element in SPIRITS.items():
        base = ART / "espiritos" / folder
        floats: dict[str, list[Image.Image]] = {}
        for gif in base.glob("*.gif"):
            direction = hyphenate(gif.stem.split("animacao", 1)[1])
            floats[direction] = [f.convert("RGBA") for f in ImageSequence.Iterator(Image.open(gif))]
        for direction in DIRECTIONS:
            still = next(base.glob(f"*_{direction}.png"))
            Image.open(still).convert("RGBA").save(SPIRITS_OUT / f"{element}-{direction}.png")
            if direction not in floats:
                raise SystemExit(f"{folder}: sem animação para {direction} (tem {sorted(floats)})")
            strip(floats[direction]).save(SPIRITS_OUT / f"{element}-float-{direction}.png")
        icon(Image.open(base / f"espirito{folder}_south.png").convert("RGBA")).save(UI / f"skill_spirit_{element}.png")
        print(f"espírito {element}: 8 direções, {len(floats['south'])} quadros flutuando")


def bear() -> None:
    base = ART / "homemferaurso"
    BEAR_OUT.mkdir(parents=True, exist_ok=True)
    walks: dict[str, list[tuple[int, int, Path]]] = {}
    for path in base.glob("walk*.png"):
        m = WALK_RE.match(path.name)
        if m:
            walks.setdefault(hyphenate(m["dir"]), []).append((int(m["start"]), int(m["n"]), path))
    for direction in DIRECTIONS:
        Image.open(base / f"homemurso_{direction}.png").convert("RGBA").save(BEAR_OUT / f"{direction}.png")
        strip(loop_order(walks[direction])).save(BEAR_OUT / f"walk-{direction}.png")
    icon(Image.open(base / "homemurso_south.png").convert("RGBA")).save(UI / "skill_bear_transform.png")
    print(f"urso: 8 direções, {len(walks['south'])} quadros andando")


def effects() -> None:
    base = ART / "transformação_fera"
    EFFECTS.mkdir(parents=True, exist_ok=True)
    pose = [Image.open(p).convert("RGBA") for p in sorted(base.glob("form_South_*.png"))]
    primal_items = []
    for path in base.glob("animacaoprimal_frame_*.png"):
        m = FRAME_RE.search(path.name)
        if m:
            primal_items.append((int(m["start"]), int(m["n"]), path))
    primal = loop_order(primal_items)
    strip(pose).save(EFFECTS / "bear_pose.png")
    strip(primal).save(EFFECTS / "primal.png")
    feet = sorted(f.getbbox()[3] for f in pose)[len(pose) // 2] - 1
    info = {
        "pose": {"frame": pose[0].width, "frames": len(pose), "feet": feet},
        "primal": {"frame": primal[0].width, "frames": len(primal), "feet": primal[0].getbbox()[3] - 4},
    }
    (EFFECTS / "forms.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    print(f"efeitos: {info}")


def main() -> None:
    spirits()
    bear()
    effects()


if __name__ == "__main__":
    main()
