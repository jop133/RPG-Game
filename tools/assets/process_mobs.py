"""Sprites dos inimigos: parado, caminhada, ataque, pulo e morte, prontos para o Phaser; e os efeitos dos ataques.

Entrada: assets/tilesets/Inimigos/<Tipo>/Idle/rotations/<direção>.png   parado, 64x64
         assets/tilesets/Inimigos/<Tipo>/walk/<direção>.gif              caminhada, quadros 96x96 (opcional)
         assets/tilesets/Inimigos/<Tipo>/attack/<direção>.gif            ataque (opcional; goblin: o soco/facada,
                                                                         lobo: a mordida, slime: o pulo, gnomo: conjurar)
         assets/tilesets/Inimigos/<Tipo>/jump/<direção>.gif              pulo do lobo (o bote)
         assets/tilesets/Inimigos/<Tipo>/death.gif                       morte (slime: a explosão; uma direção só)
         assets/tilesets/novos tilesets/facagolbin.<direção>.png         adaga do goblin (68x68)
         assets/tilesets/novos tilesets/magiagnomo.<direção>.png         círculo mágico do gnomo (64x64)
         assets/tilesets/novos tilesets/cristalmagia_<direção>.png       estaca de cristal do gnomo (68x68)
Saída:   assets/mobs/<tipo>/<direção>.png        parado (cópia, nome do tipo em minúsculas: Lobo -> lobo)
         assets/mobs/<tipo>/walk-<direção>.png   caminhada: fita horizontal com os quadros do GIF, sem reamostrar
         assets/mobs/<tipo>/attack-<direção>.png, jump-<direção>.png, death.png   idem, cada uma no tamanho de quadro
                                                 do seu GIF (os GIFs não têm todos o mesmo tamanho)
         assets/mobs/anims.json                  por tipo e animação: lado do quadro, quantos quadros (por direção) e
                                                 a linha dos pés (o pivô no cliente; a mais baixa de todos os quadros)
         assets/mobs/efeitos/adaga-<direção>.png, cristal-<direção>.png, circulo.png   (já com fundo transparente)

Direção que falta NÃO é preenchida aqui (nem espelho, nem cópia): o cliente usa a mais próxima que existe.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_mobs.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageSequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_ui import DIRECTIONS, WALK_FRAME, walk_frames  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "tilesets" / "Inimigos"
NEW = ROOT / "assets" / "tilesets" / "novos tilesets"
OUT = ROOT / "assets" / "mobs"
# Animações extras de cada tipo: pasta (ou arquivo) de origem -> nome da fita.
EXTRA = {"attack": "attack", "jump": "jump"}


def strip(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        if frame.size != (w, h):
            raise SystemExit(f"quadro {frame.size}, esperava {w}x{h}")
        out.paste(frame, (i * w, 0))
    return out


def gif_frames(path: Path) -> list[Image.Image]:
    return [frame.convert("RGBA") for frame in ImageSequence.Iterator(Image.open(path))]


def feet_line(frames: list[Image.Image]) -> int:
    """A linha mais baixa com pixel visível em qualquer quadro (onde ficam os pés)."""
    return max((f.getbbox() or (0, 0, 0, 0))[3] for f in frames)


def extras(folder: Path, out: Path) -> dict[str, dict]:
    """Ataque, pulo e morte de um tipo: as fitas e o que o cliente precisa saber de cada uma."""
    info: dict[str, dict] = {}
    for source, name in EXTRA.items():
        found: dict[str, list[Image.Image]] = {}
        for direction in DIRECTIONS:
            gif = folder / source / f"{direction}.gif"
            if gif.exists():
                found[direction] = gif_frames(gif)
        if not found:
            continue
        sizes = {frames[0].size for frames in found.values()}
        side = max(w for w, _ in sizes)
        frames_by_dir: dict[str, int] = {}
        feet = 0
        for direction, frames in found.items():
            # Quadros menores (o pulo do lobo tem 84 e 88) vão para o meio de um quadro do maior tamanho, pela base:
            # os pés ficam na mesma linha em todas as direções.
            padded = []
            for f in frames:
                canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
                canvas.paste(f, ((side - f.width) // 2, side - f.height))
                padded.append(canvas)
            strip(padded).save(out / f"{name}-{direction}.png")
            frames_by_dir[direction] = len(padded)
            feet = max(feet, feet_line(padded))
        info[name] = {"frame": side, "frames": frames_by_dir, "feet": feet}
    death = folder / "death.gif"
    if death.exists():
        frames = gif_frames(death)
        strip(frames).save(out / "death.png")
        info["death"] = {"frame": frames[0].width, "frames": {"south": len(frames)}, "feet": feet_line(frames)}
    return info


def effects() -> None:
    out = OUT / "efeitos"
    out.mkdir(parents=True, exist_ok=True)
    for direction in DIRECTIONS:
        shutil.copyfile(NEW / f"facagolbin.{direction}.png", out / f"adaga-{direction}.png")
        shutil.copyfile(NEW / f"cristalmagia_{direction}.png", out / f"cristal-{direction}.png")
    # O círculo é desenhado no chão, achatado e girando: basta o de frente.
    shutil.copyfile(NEW / "magiagnomo.south.png", out / "circulo.png")
    print("efeitos: adaga e cristal em 8 direções, círculo")


def main() -> None:
    manifest: dict[str, dict] = {}
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
                if frames[0].size != (WALK_FRAME, WALK_FRAME):
                    raise SystemExit(f"{kind}/{direction}: quadro {frames[0].size}, esperava {WALK_FRAME}x{WALK_FRAME}")
                strip(frames).save(out / f"walk-{direction}.png")
                walking.append(direction)
        manifest[kind] = extras(folder, out)
        more = ", ".join(f"{name} ({len(v['frames'])} dir., quadro {v['frame']}, pés {v['feet']})" for name, v in manifest[kind].items())
        print(f"{kind}: caminhada em {len(walking)} direções; {more or 'sem animações extras'}")
    (OUT / "anims.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    effects()


if __name__ == "__main__":
    main()
