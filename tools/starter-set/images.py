"""The starter set's pictures, for generate.mjs: a portrait turned into the PNG a card is written into,
and small covers for the gallery. Reads a JSON list of jobs on stdin:

  {"op": "png",   "src": "a.webp", "out": "a.png"}                      the picture as a PNG, same size
  {"op": "cover", "src": "a.webp", "out": "a.webp", "width": 520, "height": 780, "quality": 82}
                                                                        cropped from the middle to the
                                                                        box's shape, then scaled to it

Needs Pillow (pip install pillow). Writes nothing it was not asked for.
"""
import json
import sys

from PIL import Image


def as_png(job):
    with Image.open(job["src"]) as im:
        im.load()
        mode = "RGBA" if im.mode in ("RGBA", "LA") or "transparency" in im.info else "RGB"
        im.convert(mode).save(job["out"], "PNG", optimize=True)


def as_cover(job):
    w, h = int(job["width"]), int(job["height"])
    with Image.open(job["src"]) as im:
        im = im.convert("RGB")
        # The middle of the picture at the box's shape: a 3:2 world becomes the town at its centre.
        scale = max(w / im.width, h / im.height)
        cw, ch = round(w / scale), round(h / scale)
        left, top = (im.width - cw) // 2, (im.height - ch) // 2
        im = im.crop((left, top, left + cw, top + ch)).resize((w, h), Image.LANCZOS)
        im.save(job["out"], "WEBP", quality=int(job.get("quality", 82)), method=6)


def main():
    jobs = json.load(sys.stdin)
    for job in jobs:
        {"png": as_png, "cover": as_cover}[job["op"]](job)
        with Image.open(job["out"]) as done:
            print(f'{job["out"]}: {done.width}x{done.height}')


if __name__ == "__main__":
    main()
