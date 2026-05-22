"""Generate yellow-background / black-text icon PNGs for Focus Group Filler."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent.parent / "filler" / "icons"
BG = (250, 204, 21, 255)   # amber-400 / yellow
FG = (15, 23, 42, 255)     # near-black
TEXT = "FG"


def make(size: int) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = size // 5
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size * 0.5))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), TEXT, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), TEXT, fill=FG, font=font)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img.save(OUT_DIR / f"icon{size}.png")


def main() -> None:
    for s in (16, 48, 128):
        make(s)
    print(f"Wrote 3 yellow icons to {OUT_DIR}")


if __name__ == "__main__":
    main()
