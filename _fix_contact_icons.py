"""Restore canva-03 from the Canva banner and paint clean contact icons."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
BANNER = Path(r"C:\Users\User\Downloads\Copy of Hair Acuity Bookings Site Large Banner.png")
OUT = ROOT / "images" / "canva-03.jpg"
PREVIEW = ROOT / "_src" / "banner-preview"
PINK = (255, 78, 200)
WHITE = (255, 255, 255)


def restore() -> Image.Image:
    banner = Image.open(BANNER).convert("RGB")
    strip = banner.crop((0, 2000, 2000, 3000))
    return strip


def draw_phone(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    # Classic handset
    draw.rounded_rectangle(
        [cx - s * 0.22, cy - s * 0.72, cx + s * 0.22, cy - s * 0.18],
        radius=s * 0.22,
        fill=PINK,
    )
    draw.rounded_rectangle(
        [cx - s * 0.22, cy + s * 0.18, cx + s * 0.22, cy + s * 0.72],
        radius=s * 0.22,
        fill=PINK,
    )
    draw.pieslice(
        [cx - s * 0.78, cy - s * 0.55, cx + s * 0.78, cy + s * 0.55],
        55,
        125,
        fill=PINK,
    )
    draw.pieslice(
        [cx - s * 0.42, cy - s * 0.38, cx + s * 0.42, cy + s * 0.38],
        50,
        130,
        fill=WHITE,
    )


def draw_mail(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    draw.rounded_rectangle(
        [cx - s * 0.72, cy - s * 0.48, cx + s * 0.72, cy + s * 0.50],
        radius=max(3, int(s * 0.10)),
        fill=PINK,
    )
    draw.polygon(
        [
            (cx - s * 0.72, cy - s * 0.30),
            (cx, cy + s * 0.16),
            (cx + s * 0.72, cy - s * 0.30),
        ],
        fill=WHITE,
    )
    draw.polygon(
        [
            (cx - s * 0.72, cy - s * 0.48),
            (cx, cy + s * 0.06),
            (cx + s * 0.72, cy - s * 0.48),
        ],
        fill=PINK,
    )


def draw_instagram(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    w = max(3, int(s * 0.14))
    draw.rounded_rectangle(
        [cx - s * 0.62, cy - s * 0.62, cx + s * 0.62, cy + s * 0.62],
        radius=int(s * 0.28),
        outline=PINK,
        width=w,
    )
    r = int(s * 0.28)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=PINK, width=w)
    d = max(3, int(s * 0.10))
    draw.ellipse([cx + int(s * 0.30) - d, cy - int(s * 0.38) - d, cx + int(s * 0.30) + d, cy - int(s * 0.38) + d], fill=PINK)


def locate_icons(im: Image.Image) -> list[tuple[int, int, int]]:
    """Find three white icon circles in the contact column."""
    pix = im.load()
    w, h = im.size
    found: list[tuple[int, int, int]] = []
    y = 360
    while y < 820 and len(found) < 3:
        best = None
        best_count = 0
        for x in range(1185, 1320):
            r, g, b = pix[x, y]
            if r < 200 or g < 200 or b < 200:
                continue
            # count white pixels in a small neighborhood
            count = 0
            for dy in range(-18, 19, 2):
                for dx in range(-18, 19, 2):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h:
                        rr, gg, bb = pix[xx, yy]
                        if rr > 200 and gg > 200 and bb > 200:
                            count += 1
            if count > best_count:
                best_count = count
                best = (x, y)
        if best and best_count > 80:
            cx, cy = best
            # refine radius
            rad = 18
            for dx in range(16, 42):
                xx = cx + dx
                if xx >= w:
                    break
                rr, gg, bb = pix[xx, cy]
                if rr < 160 or gg < 160:
                    rad = dx + 1
                    break
            found.append((cx, cy, rad))
            y += max(70, rad * 2 + 18)
        else:
            y += 6
    return found


def main() -> None:
    im = restore()
    PREVIEW.mkdir(parents=True, exist_ok=True)
    im.crop((1160, 340, 1380, 820)).save(PREVIEW / "icon-col.jpg", quality=95)
    circles = locate_icons(im)
    print("circles", circles)
    if len(circles) != 3:
        # fallback measured from the original flyer
        circles = [(1248, 430, 28), (1248, 545, 28), (1248, 660, 28)]
        print("using fallback", circles)
    draw = ImageDraw.Draw(im)
    painters = [draw_phone, draw_mail, draw_instagram]
    for (cx, cy, rad), paint in zip(circles, painters):
        draw.ellipse([cx - rad - 2, cy - rad - 2, cx + rad + 2, cy + rad + 2], fill=WHITE)
        paint(draw, cx, cy, int(rad * 0.78))
    im.save(OUT, "JPEG", quality=90, optimize=True, progressive=True)
    im.crop((1160, 340, 1680, 820)).save(PREVIEW / "icons-fixed.jpg", quality=95)
    print("saved", OUT)


if __name__ == "__main__":
    main()
