"""Desenha um mapa do Tiled (JSON) em PNG, como o jogo desenha: chão e objetos ordenados pela base (Y-sorting).

Uso (da raiz do projeto):
    tools/assets/.venv/Scripts/python.exe -I tools/assets/render_map.py assets/maps/city.json saida.png
        [--scale 0.5] [--region x0,y0,w,h (em tiles)] [--solid grade.json] [--points]

--solid recebe um JSON {width, height, solid: [bool...]} (a grade de colisão do servidor) e pinta as paredes.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

GID_MASK = 0x1FFFFFFF


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("map")
    parser.add_argument("out")
    parser.add_argument("--scale", type=float, default=0.5)
    parser.add_argument("--region")
    parser.add_argument("--solid")
    parser.add_argument("--points", action="store_true")
    args = parser.parse_args()

    map_path = Path(args.map).resolve()
    data = json.loads(map_path.read_text(encoding="utf-8"))
    t = data["tilewidth"]
    canvas = Image.new("RGBA", (data["width"] * t, data["height"] * t), (20, 20, 20, 255))

    tile_images: dict[int, Image.Image] = {}
    object_images: dict[int, Image.Image] = {}
    for ts in data["tilesets"]:
        if "image" in ts:
            sheet = Image.open((map_path.parent / ts["image"]).resolve()).convert("RGBA")
            for i in range(ts["tilecount"]):
                x, y = (i % ts["columns"]) * t, (i // ts["columns"]) * t
                tile_images[ts["firstgid"] + i] = sheet.crop((x, y, x + t, y + t))
        for tile in ts.get("tiles", []):
            if "image" in tile:
                object_images[ts["firstgid"] + tile["id"]] = Image.open((map_path.parent / tile["image"]).resolve()).convert("RGBA")

    for layer in data["layers"]:
        if layer["type"] != "tilelayer":
            continue
        for i, gid in enumerate(layer["data"]):
            gid &= GID_MASK
            if gid in tile_images:
                canvas.alpha_composite(tile_images[gid], ((i % data["width"]) * t, (i // data["width"]) * t))

    objects = [o for layer in data["layers"] if layer["type"] == "objectgroup" for o in layer["objects"] if "gid" in o]
    for obj in sorted(objects, key=lambda o: o["y"]):
        image = object_images[obj["gid"] & GID_MASK]
        if (image.width, image.height) != (obj["width"], obj["height"]):
            image = image.resize((round(obj["width"]), round(obj["height"])), Image.NEAREST)
        canvas.alpha_composite(image, (round(obj["x"]), round(obj["y"] - obj["height"])))

    draw = ImageDraw.Draw(canvas)
    if args.solid:
        grid = json.loads(Path(args.solid).read_text(encoding="utf-8"))
        overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        for i, solid in enumerate(grid["solid"]):
            if solid:
                x, y = (i % grid["width"]) * t, (i // grid["width"]) * t
                odraw.rectangle((x, y, x + t - 1, y + t - 1), fill=(255, 0, 0, 90))
        canvas.alpha_composite(overlay)
    if args.points:
        for layer in data["layers"]:
            if layer["type"] == "objectgroup":
                for o in layer["objects"]:
                    if o.get("point"):
                        color = (255, 0, 255, 255) if layer["name"] == "portal" else (0, 255, 255, 255)
                        draw.ellipse((o["x"] - 8, o["y"] - 8, o["x"] + 8, o["y"] + 8), outline=color, width=3)

    if args.region:
        x0, y0, w, h = (int(v) for v in args.region.split(","))
        canvas = canvas.crop((x0 * t, y0 * t, (x0 + w) * t, (y0 + h) * t))
    if args.scale != 1:
        canvas = canvas.resize((round(canvas.width * args.scale), round(canvas.height * args.scale)), Image.BOX)
    canvas.save(args.out)
    print(f"ok {args.out} {canvas.width}x{canvas.height}")


if __name__ == "__main__":
    main()
