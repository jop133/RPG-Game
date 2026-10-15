"""Sprites dos inimigos: parado (8 direções) e caminhada (as direções que existirem), prontos para o Phaser.

Entrada: assets/tilesets/Inimigos/<Tipo>/Idle/rotations/<direção>.png   parado, 64x64
         assets/tilesets/Inimigos/<Tipo>/walk/<direção>.gif              caminhada, quadros 96x96 (opcional)
Saída:   assets/mobs/<tipo>/<direção>.png        parado (cópia, nome do tipo em minúsculas: Lobo -> lobo)
         assets/mobs/<tipo>/walk-<direção>.png   caminhada: fita horizontal com os quadros do GIF, sem reamostrar

Igual às classes (process_ui.py), com uma diferença: direção de caminhada que falta NÃO é preenchida aqui (nem
espelho, nem cópia). Só existem as fitas que têm GIF; o cliente escolhe a direção mais próxima que existe
(gnomo: só as 4 cardeais) ou fica no sprite parado (slime, sem caminhada).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_mobs.py
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_ui import DIRECTIONS, WALK_FRAME, walk_frames  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "tilesets" / "Inimigos"
OUT = ROOT / "assets" / "mobs"


def walk_strip(frames: list[Image.Image]) -> Image.Image:
    strip = Image.new("RGBA", (WALK_FRAME * len(frames), WALK_FRAME), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        if frame.size != (WALK_FRAME, WALK_FRAME):
            raise SystemExit(f"quadro {frame.size}, esperava {WALK_FRAME}x{WALK_FRAME}")
        strip.paste(frame, (i * WALK_FRAME, 0))
    return strip


def main() -> None:
    for folder in sorted(p for p in SRC.iterdir() if p.is_dir()):
        kind = folder.name.lower()
        out = OUT / kind
        out.mkdir(parents=True, exist_ok=True)
        for direction in DIRECTIONS:
            shutil.copyfile(folder / "Idle" / "rotations" / f"{direction}.png", out / f"{direction}.png")
        walking = []
        for direction in DIRECTIONS:
            frames = walk_frames(folder, direction)
            if frames:
                walk_strip(frames).save(out / f"walk-{direction}.png")
                walking.append(f"{direction} ({len(frames)})")
        print(f"{kind}: parado em 8 direções; caminhada: {', '.join(walking) if walking else 'nenhuma'}")


if __name__ == "__main__":
    main()
