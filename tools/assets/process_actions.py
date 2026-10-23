"""Animações e sprites novos de ação: soco desarmado, besta e flecha, teleporte.

Entrada (do dono do projeto, fora do git): assets/tilesets/novos tilesets/
    soco desarmado/barbaro_soco/   PNGs soltos "atack<direção>_frame_00K (N).png" (6 por direção)
    soco desarmado/elfo_soco/      GIFs "elfosoco_<direção>.gif" (6 quadros)
    soco desarmado/homemfera_soco/ PNGs soltos, como o do bárbaro
    besta e flecha/                besta_<direção>.png e flecha_<direção>.png (68x68, um por direção)
                                   elfo_tiro/ (opcional, ainda não existe): o Elfo atirando, GIFs ou PNGs por direção
    teleporte/                     Teleporteanimacao_0001..0005.png (84x84)
Saída:
    assets/characters/<classe>/punch-<direção>.png   soco: fita horizontal de quadros 96x96 (como a caminhada)
    assets/characters/elfo/shoot-<direção>.png       tiro de besta (só se existir elfo_tiro/)
    assets/weapons/besta-<direção>.png               a besta na mão, uma por direção (68x68)
    assets/weapons/flecha-<direção>.png              a flecha em voo, uma por direção (68x68)
    assets/ui/hud/items/besta.png                    ícone do slot, 48x48
    assets/effects/teleport.png + teleport.json      o tubo de teleporte: fita de quadros 84x84 e a linha do chão

Sequências de PNG soltos: o "(N)" não é a ordem do golpe. O exportador começou o laço no quadro K do nome
("_frame_00K"), então o quadro original de "(N)" é (K + N - 1) mod total. Reordenado assim, o soco acerta no último
quadro, como nos GIFs do elfo.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_actions.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
NEW_ART = ROOT / "assets" / "tilesets" / "novos tilesets"
CHAR_OUT = ROOT / "assets" / "characters"
WEAPONS = ROOT / "assets" / "weapons"
ICONS = ROOT / "assets" / "ui" / "hud" / "items"
EFFECTS = ROOT / "assets" / "effects"

DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
STRIP_FRAME = 96  # o mesmo quadro da caminhada: a mesma escala e a mesma linha dos pés (78)
ICON = 48
# Pasta do soco de cada classe (id de shared/src/classes.ts). O mago não tem soco desenhado.
PUNCH_FOLDERS = {"barbaro": "barbaro_soco", "elfo": "elfo_soco", "homem_fera": "homemfera_soco"}
SEQUENCE_RE = re.compile(r"atack(?P<dir>[a-z]+)_frame_(?P<start>\d+) \((?P<n>\d+)\)\.png$", re.IGNORECASE)


def gif_frames(path: Path) -> list[Image.Image]:
    return [frame.convert("RGBA") for frame in ImageSequence.Iterator(Image.open(path))]


def sequence_frames(folder: Path) -> dict[str, list[Image.Image]]:
    """PNGs soltos "atack<direção>_frame_00K (N).png" -> {direção: quadros na ordem original do laço}."""
    found: dict[str, list[tuple[int, int, Path]]] = {}
    for path in folder.glob("*.png"):
        m = SEQUENCE_RE.match(path.name)
        if m:
            found.setdefault(m["dir"].lower(), []).append((int(m["start"]), int(m["n"]), path))
    out: dict[str, list[Image.Image]] = {}
    for raw, items in found.items():
        total = len(items)
        ordered = sorted(items, key=lambda item: (item[0] + item[1] - 1) % total)
        out[hyphenate(raw)] = [Image.open(p).convert("RGBA") for _, _, p in ordered]
    return out


def hyphenate(raw: str) -> str:
    """"northeast" -> "north-east"; "south" fica igual."""
    for vertical in ("north", "south"):
        if raw.startswith(vertical) and raw != vertical:
            return f"{vertical}-{raw[len(vertical):]}"
    return raw


def gif_folder_frames(folder: Path) -> dict[str, list[Image.Image]]:
    """GIFs "<qualquer>_<direção>.gif" -> {direção: quadros}."""
    out: dict[str, list[Image.Image]] = {}
    for path in folder.glob("*.gif"):
        direction = path.stem.rsplit("_", 1)[-1].replace("_", "-")
        if direction in DIRECTIONS:
            out[direction] = gif_frames(path)
    return out


def action_frames(folder: Path) -> dict[str, list[Image.Image]]:
    """GIFs por direção ou PNGs soltos numerados: o que a pasta tiver."""
    return gif_folder_frames(folder) or sequence_frames(folder)


def strip(frames: list[Image.Image], size: int) -> Image.Image:
    sheet = Image.new("RGBA", (size * len(frames), size), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        if frame.size != (size, size):
            raise SystemExit(f"quadro {frame.size}, esperava {size}x{size}")
        sheet.paste(frame, (i * size, 0))
    return sheet


def write_strips(class_id: str, prefix: str, by_direction: dict[str, list[Image.Image]]) -> None:
    missing = [d for d in DIRECTIONS if d not in by_direction]
    if missing:
        raise SystemExit(f"{class_id} {prefix}: faltam as direções {missing}")
    out = CHAR_OUT / class_id
    for direction in DIRECTIONS:
        strip(by_direction[direction], STRIP_FRAME).save(out / f"{prefix}-{direction}.png")
    counts = {len(f) for f in by_direction.values()}
    print(f"{class_id}: {prefix} em 8 direções, {counts} quadros de {STRIP_FRAME}x{STRIP_FRAME}")


def punches() -> None:
    base = NEW_ART / "soco desarmado"
    for class_id, folder in PUNCH_FOLDERS.items():
        write_strips(class_id, "punch", action_frames(base / folder))


def crossbow() -> None:
    base = NEW_ART / "besta e flecha"
    WEAPONS.mkdir(parents=True, exist_ok=True)
    for name in ("besta", "flecha"):
        for direction in DIRECTIONS:
            Image.open(base / f"{name}_{direction}.png").convert("RGBA").save(WEAPONS / f"{name}-{direction}.png")
    # Ícone: a besta de lado (east), recortada no que tem tinta e encaixada em 48x48 sem esticar.
    art = Image.open(base / "besta_east.png").convert("RGBA")
    art = art.crop(art.getbbox())
    scale = min((ICON - 4) / art.width, (ICON - 4) / art.height)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.NEAREST)
    icon = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
    icon.alpha_composite(art, ((ICON - art.width) // 2, (ICON - art.height) // 2))
    icon.save(ICONS / "besta.png")
    print("besta e flecha: 8 direções cada, ícone 48x48")
    shoot = base / "elfo_tiro"
    if shoot.is_dir():
        write_strips("elfo", "shoot", action_frames(shoot))
    else:
        print("aviso: sem 'besta e flecha/elfo_tiro/': o Elfo atira com o corpo parado (só a besta aparece na mão)")


def teleport() -> None:
    folder = NEW_ART / "teleporte"
    frames = [Image.open(p).convert("RGBA") for p in sorted(folder.glob("Teleporteanimacao_*.png"))]
    size = frames[0].width
    EFFECTS.mkdir(parents=True, exist_ok=True)
    strip(frames, size).save(EFFECTS / "teleport.png")
    # A linha do chão: o meio do anel da base (a última linha com tinta do 1º quadro, menos metade da altura do anel).
    bottom = frames[0].getbbox()[3]
    info = {"frame": size, "frames": len(frames), "feet": bottom - 6}
    (EFFECTS / "teleport.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    print(f"teleporte: {len(frames)} quadros de {size}x{size}, chão na linha {info['feet']}")


def main() -> None:
    punches()
    crossbow()
    teleport()


if __name__ == "__main__":
    main()
