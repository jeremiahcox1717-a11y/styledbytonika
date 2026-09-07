"""Fill contact icons: solid pink circles, white glyphs, no white leftover."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "images" / "canva-03.jpg"
OUT = SRC
PINK = (255, 78, 200)
WHITE = (255, 255, 255)

# Cover the existing white disks completely.
CIRCLES = [(1204, 324, 35), (1203, 414, 35), (1203, 496, 35)]


def draw_phone(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: float) -> None:
    body = [cx - s * 0.52, cy - s * 0.78, cx + s * 0.52, cy + s * 0.78]
    draw.rounded_rectangle(body, radius=int(s * 0.18), fill=WHITE)
    screen = [cx - s * 0.36, cy - s * 0.54, cx + s * 0.36, cy + s * 0.42]
    draw.rectangle(screen, fill=PINK)
    draw.ellipse([cx - s * 0.10, cy + s * 0.52, cx + s * 0.10, cy + s * 0.70], fill=PINK)


def draw_mail(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: float) -> None:
    env = [cx - s * 0.78, cy - s * 0.50, cx + s * 0.78, cy + s * 0.52]
    draw.rounded_rectangle(env, radius=int(s * 0.10), fill=WHITE)
    inner = [cx - s * 0.62, cy - s * 0.34, cx + s * 0.62, cy + s * 0.36]
    draw.rectangle(inner, fill=PINK)
    draw.polygon(
        [
            (cx - s * 0.78, cy - s * 0.50),
            (cx, cy + s * 0.08),
            (cx + s * 0.78, cy - s * 0.50),
        ],
        fill=WHITE,
    )
    draw.polygon(
        [
            (cx - s * 0.58, cy - s * 0.34),
            (cx, cy + s * 0.12),
            (cx + s * 0.58, cy - s * 0.34),
        ],
        fill=PINK,
    )


def draw_instagram(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: float) -> None:
    pad = [
        cx - s * 0.72,
        cy - s * 0.72,
        cx + s * 0.72,
        cy + s * 0.72,
    ]
    draw.rounded_rectangle(pad, radius=int(s * 0.28), fill=WHITE)
    inner = [
        cx - s * 0.52,
        cy - s * 0.52,
        cx + s * 0.52,
        cy + s * 0.52,
    ]
    draw.rounded_rectangle(inner, radius=int(s * 0.18), fill=PINK)
    draw.ellipse([cx - s * 0.28, cy - s * 0.28, cx + s * 0.28, cy + s * 0.28], fill=WHITE)
    draw.ellipse([cx - s * 0.14, cy - s * 0.14, cx + s * 0.14, cy + s * 0.14], fill=PINK)
    draw.ellipse([cx + s * 0.22, cy - s * 0.50, cx + s * 0.40, cy - s * 0.32], fill=WHITE)


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    painters = [draw_phone, draw_mail, draw_instagram]
    for (cx, cy, rad), paint in zip(CIRCLES, painters):
        draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(*PINK, 255))
        paint(draw, cx, cy, rad * 0.78)
    out = Image.alpha_composite(im, overlay).convert("RGB")
    out.save(OUT, "JPEG", quality=92, optimize=True, progressive=True)
    crop = out.crop((1160, 280, 1260, 540))
    crop.save(ROOT / "_icons_now.jpg", quality=95)
    print("painted", CIRCLES)


if __name__ == "__main__":
    main()
