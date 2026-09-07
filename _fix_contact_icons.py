"""Restore canva-03 and paint clean phone, email, Instagram icons."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
BANNER = Path(r"C:\Users\User\Downloads\Copy of Hair Acuity Bookings Site Large Banner.png")
OUT = ROOT / "images" / "canva-03.jpg"
PREVIEW = ROOT / "_src" / "banner-preview"
PINK = (255, 78, 200)
WHITE = (255, 255, 255)


def draw_phone(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    draw.rounded_rectangle(
        [cx - s * 0.46, cy - s * 0.74, cx + s * 0.46, cy + s * 0.74],
        radius=int(s * 0.16),
        fill=PINK,
    )
    draw.rectangle([cx - s * 0.30, cy - s * 0.54, cx + s * 0.30, cy + s * 0.38], fill=WHITE)
    draw.ellipse([cx - s * 0.08, cy + s * 0.50, cx + s * 0.08, cy + s * 0.66], fill=WHITE)


def draw_mail(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    draw.rounded_rectangle(
        [cx - s * 0.72, cy - s * 0.48, cx + s * 0.72, cy + s * 0.50],
        radius=max(3, int(s * 0.10)),
        fill=PINK,
    )
    draw.polygon(
        [
            (cx - s * 0.72, cy - s * 0.48),
            (cx, cy + s * 0.08),
            (cx + s * 0.72, cy - s * 0.48),
        ],
        fill=WHITE,
    )
    draw.polygon(
        [
            (cx - s * 0.72, cy - s * 0.48),
            (cx, cy - s * 0.02),
            (cx + s * 0.72, cy - s * 0.48),
        ],
        fill=PINK,
    )


def draw_instagram(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    w = max(3, int(s * 0.16))
    draw.rounded_rectangle(
        [cx - s * 0.64, cy - s * 0.64, cx + s * 0.64, cy + s * 0.64],
        radius=int(s * 0.30),
        outline=PINK,
        width=w,
    )
    r = int(s * 0.28)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=PINK, width=w)
    d = max(3, int(s * 0.10))
    draw.ellipse(
        [cx + int(s * 0.32) - d, cy - int(s * 0.38) - d, cx + int(s * 0.32) + d, cy - int(s * 0.38) + d],
        fill=PINK,
    )


def main() -> None:
    im = Image.open(BANNER).convert("RGB").crop((0, 2000, 2000, 3000))
    draw = ImageDraw.Draw(im)
    circles = [(1204, 324, 32), (1203, 414, 32), (1203, 496, 32)]
    painters = [draw_phone, draw_mail, draw_instagram]
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for (cx, cy, rad), paint in zip(circles, painters):
        draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(*WHITE, 255))
        paint(draw, cx, cy, 20)
    im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")
    im.save(OUT, "JPEG", quality=92, optimize=True, progressive=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    im.crop((1175, 290, 1600, 540)).save(PREVIEW / "icons-fixed.jpg", quality=95)
    print("saved", OUT)


if __name__ == "__main__":
    main()
