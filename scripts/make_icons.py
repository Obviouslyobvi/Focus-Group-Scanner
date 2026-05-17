"""Generate placeholder icon PNGs for the extension."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent.parent / "extension" / "icons"


def make(size: int) -> None:
    img = Image.new("RGBA", (size, size), (15, 23, 42, 255))  # slate-900
    draw = ImageDraw.Draw(img)
    radius = size // 5
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=(15, 23, 42, 255))
    text = "FG"
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size * 0.5))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, fill=(255, 255, 255), font=font)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img.save(OUT_DIR / f"icon{size}.png")


def main() -> None:
    for s in (16, 48, 128):
        make(s)
    print(f"Wrote 3 icons to {OUT_DIR}")


if __name__ == "__main__":
    main()
