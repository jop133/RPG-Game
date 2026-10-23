"""Minibosses: Krag, o Carrasco Hobgoblin (zona goblin) e o Rei Slime Abissal (zona dos slimes).

Entrada (do dono do projeto, fora do git): assets/tilesets/novos tilesets/
    Krag, o Carrasco Hobgoblin/
        sprite/krag_<direção>.png                 parado (80x80)
        walk/walk_<direção>.gif (e "walks_north", "walksouth-west")   andando (112x112, 8 quadros)
        attack/punch_<direção>.gif                golpe (112x112, 6 quadros)
        spinningatack/openarm_<direção>.png       a pose de braços abertos antes do tornado (80x80)
        spinningatack/spinningtornadoatack.gif    o tornado (64x64, 9 quadros, uma direção só)
        atackrachadura/kick_<direção>.gif         o chute (112x112, 7 quadros)
        atackrachadura/rachadura_<direção>.gif    a rachadura no chão (68x68, 9 quadros; "northeast" sem hífen)
    Rei Slime Abissal/
        walk/walk_<cardeal>.gif                   andando, só as 4 cardeais (96, 108 e 112 px, 8 quadros)
        jump/jumpatack.gif                        o pulo (108x108, 9 quadros, uma direção)
        explosion/explosionatack.gif              a explosão (108x108, 9 quadros, uma direção)
Saída em assets/mobs/<tipo>/ (krag, rei_slime), no formato de process_mobs.py, mas TODAS as animações de um chefe
num quadro só (CANVAS) com os pés na mesma linha (FEET): o cliente usa a mesma origem para tudo.
    <direção>.png                 parado (Rei Slime: o 1º quadro da caminhada; diagonal = a cardeal do lado)
    walk-<direção>.png            caminhada (Rei Slime: só as cardeais; o cliente usa a do lado nas diagonais)
    attack-<direção>.png, kick-<direção>.png, openarm-<direção>.png (1 quadro), tornado.png (Krag)
    jump.png, explosion.png       (Rei Slime)
    crack-<direção>.png           a rachadura (Krag; 68x68, sem mudar o tamanho: é efeito no chão)
    assets/mobs/bosses.json       por tipo: canvas, linha dos pés, e por animação o lado do quadro e os quadros
Cada quadro é ampliado por SCALE (vizinho mais próximo) e posto com o meio do quadro original no meio do canvas e a
linha mais baixa com tinta da animação (naquela direção) na linha FEET.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_bosses.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets" / "tilesets" / "novos tilesets"
OUT = ROOT / "assets" / "mobs"
DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
CARDINALS = ["south", "east", "north", "west"]
# Diagonal sem arte: a cardeal do lado (como WALK_FALLBACK no cliente).
SIDE = {"south-east": "east", "north-east": "east", "south-west": "west", "north-west": "west"}
BOSSES = {
    "krag": {"folder": "Krag, o Carrasco Hobgoblin", "canvas": 112, "feet": 100, "scale": 1.0},
    "rei_slime": {"folder": "Rei Slime Abissal", "canvas": 144, "feet": 128, "scale": 1.3},
}
TORNADO_SCALE = 1.5  # o tornado vem pequeno (64 px): do porte do Krag


def gif(path: Path) -> list[Image.Image]:
    return [f.convert("RGBA") for f in ImageSequence.Iterator(Image.open(path))]


def find(folder: Path, stem: str, direction: str, suffix: str) -> Path:
    """O arquivo da direção, aceitando os nomes irregulares da arte ("walks_north", "walksouth-west", "northeast")."""
    flat = direction.replace("-", "")
    for path in sorted(folder.glob(f"*{suffix}")):
        name = path.stem.lower()
        if not name.startswith(stem):
            continue
        tail = name[len(stem):].lstrip("_")
        # "walks_north": o "s" a mais antes do "_".
        tails = {tail, tail[2:] if tail.startswith("s_") else tail}
        if tails & {direction, flat}:
            return path
    raise SystemExit(f"{folder.name}: sem {stem} para {direction}")


def normalize(frames: list[Image.Image], canvas: int, feet: int, scale: float) -> list[Image.Image]:
    """Amplia, centra o meio do quadro original e assenta a linha mais baixa com tinta (de todos) em `feet`."""
    big = [f.resize((round(f.width * scale), round(f.height * scale)), Image.NEAREST) if scale != 1 else f for f in frames]
    bottom = max(b[3] for b in (f.getbbox() for f in big) if b)
    out = []
    for f in big:
        c = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        c.alpha_composite(f, ((canvas - f.width) // 2, feet - bottom)) if feet - bottom >= 0 else c.paste(f.crop((0, bottom - feet, f.width, f.height)), ((canvas - f.width) // 2, 0))
        out.append(c)
    return out


def strip(frames: list[Image.Image]) -> Image.Image:
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0))
    return sheet


class Writer:
    def __init__(self, kind: str):
        cfg = BOSSES[kind]
        self.kind, self.canvas, self.feet, self.scale = kind, cfg["canvas"], cfg["feet"], cfg["scale"]
        self.out = OUT / kind
        self.out.mkdir(parents=True, exist_ok=True)
        self.info: dict = {"canvas": self.canvas, "feet": self.feet, "anims": {}}

    def anim(self, name: str, frames: list[Image.Image], file: str, scale: float | None = None, raw: bool = False) -> None:
        frames = frames if raw else normalize(frames, self.canvas, self.feet, scale or self.scale)
        strip(frames).save(self.out / f"{file}.png")
        entry = self.info["anims"].setdefault(name, {"frame": frames[0].width, "frames": {}, "feet": self.feet if not raw else frames[0].height // 2})
        entry["frames"][file.split("-", 1)[1] if "-" in file else "all"] = len(frames)

    def still(self, frame: Image.Image, direction: str) -> None:
        normalize([frame], self.canvas, self.feet, self.scale)[0].save(self.out / f"{direction}.png")


def krag() -> dict:
    base = ART / BOSSES["krag"]["folder"]
    w = Writer("krag")
    for d in DIRECTIONS:
        w.still(Image.open(find(base / "sprite", "krag", d, ".png")).convert("RGBA"), d)
        w.anim("walk", gif(find(base / "walk", "walk", d, ".gif")), f"walk-{d}")
        w.anim("attack", gif(find(base / "attack", "punch", d, ".gif")), f"attack-{d}")
        w.anim("kick", gif(find(base / "atackrachadura", "kick", d, ".gif")), f"kick-{d}")
        w.anim("openarm", [Image.open(find(base / "spinningatack", "openarm", d, ".png")).convert("RGBA")], f"openarm-{d}")
        w.anim("crack", gif(find(base / "atackrachadura", "rachadura", d, ".gif")), f"crack-{d}", raw=True)
    w.anim("tornado", gif(base / "spinningatack" / "spinningtornadoatack.gif"), "tornado", scale=TORNADO_SCALE)
    return w.info


def rei_slime() -> dict:
    base = ART / BOSSES["rei_slime"]["folder"]
    w = Writer("rei_slime")
    walks = {d: gif(find(base / "walk", "walk", d, ".gif")) for d in CARDINALS}
    for d in CARDINALS:
        w.anim("walk", walks[d], f"walk-{d}")
    for d in DIRECTIONS:
        w.still(walks[SIDE.get(d, d)][0], d)
    w.anim("jump", gif(base / "jump" / "jumpatack.gif"), "jump")
    w.anim("explosion", gif(base / "explosion" / "explosionatack.gif"), "explosion")
    return w.info


def main() -> None:
    info = {"krag": krag(), "rei_slime": rei_slime()}
    (OUT / "bosses.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    for kind, data in info.items():
        print(f"{kind}: canvas {data['canvas']}, pés {data['feet']}, animações {sorted(data['anims'])}")


if __name__ == "__main__":
    main()
