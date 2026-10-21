"""Drops dos monstros: os ícones (inventário, lojas) e as animações no chão.

Entrada: assets/tilesets/novos tilesets/Essencia.png          ícone da Essência (64x64)
         assets/tilesets/novos tilesets/cristaldropicone.png  ícone do Cristal Mágico (64x64)
         assets/tilesets/novos tilesets/essenciadrop.gif      a Essência caída no chão (quadros 84x84)
         assets/tilesets/novos tilesets/cristaldrop.gif       o Cristal caído no chão (quadros 64x64)
Saída:   assets/ui/hud/items/<item>.png   ícone de cada item: cristal_magico e as 4 essências (a mesma imagem)
         assets/loot/essencia.png, assets/loot/cristal.png   fitas horizontais com os quadros dos GIFs
         assets/loot/loot.json             por fita: lado do quadro, quantos quadros, ms por quadro e a linha da base

Os arquivos já vêm com fundo transparente; mesmo assim, pixel preto puro (#000000) vira transparente (o pedido): os
brilhos e as bordas, que não são pretos, ficam como estão.

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/process_loot.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
NEW = ROOT / "assets" / "tilesets" / "novos tilesets"
ICONS = ROOT / "assets" / "ui" / "hud" / "items"
OUT = ROOT / "assets" / "loot"
ESSENCES = ["essencia_goblin", "essencia_slime", "essencia_lobo", "essencia_gnomo"]


def clear_black(image: Image.Image) -> Image.Image:
    """Preto puro e opaco vira transparente; o resto fica igual."""
    rgba = image.convert("RGBA")
    pixels = [(0, 0, 0, 0) if p[:3] == (0, 0, 0) else p for p in rgba.get_flattened_data()]
    out = Image.new("RGBA", rgba.size)
    out.putdata(pixels)
    return out


def sheet(gif: Path) -> tuple[Image.Image, dict]:
    source = Image.open(gif)
    frames = [clear_black(frame) for frame in ImageSequence.Iterator(source)]
    w, h = frames[0].size
    strip = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * w, 0))
    base = max((f.getbbox() or (0, 0, 0, h))[3] for f in frames)
    return strip, {"frame": w, "frames": len(frames), "frameMs": source.info.get("duration", 150), "base": base}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    essence = clear_black(Image.open(NEW / "Essencia.png"))
    for item in ESSENCES:
        essence.save(ICONS / f"{item}.png")
    clear_black(Image.open(NEW / "cristaldropicone.png")).save(ICONS / "cristal_magico.png")
    manifest = {}
    for name, gif in (("essencia", "essenciadrop.gif"), ("cristal", "cristaldrop.gif")):
        strip, info = sheet(NEW / gif)
        strip.save(OUT / f"{name}.png")
        manifest[name] = info
    (OUT / "loot.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("ícones: cristal_magico e", ", ".join(ESSENCES), "| chão:", manifest)


if __name__ == "__main__":
    main()
