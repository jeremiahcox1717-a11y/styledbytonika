"""Crop flyer photos so baked Canva text/frames stay out of the site images."""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "_src"
OUT = ROOT / "images"


def save(im: Image.Image, name: str, size: tuple[int, int]) -> None:
    im = im.convert("RGB")
    im = im.resize(size, Image.Resampling.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=0.9, percent=110, threshold=2))
    im = ImageEnhance.Contrast(im).enhance(1.1)
    im = ImageEnhance.Color(im).enhance(1.05)
    im.save(OUT / name, quality=92, optimize=True)
    print(name, im.size)


def inset(im: Image.Image, frac: float = 0.2) -> Image.Image:
    w, h = im.size
    return im.crop(
        (
            int(w * frac),
            int(h * frac * 0.7),
            int(w * (1 - frac)),
            int(h * (1 - frac * 0.75)),
        )
    )


p1 = Image.open(SRC / "canva-pink-1.jpg").convert("RGB")
p2 = Image.open(SRC / "canva-pink-2.jpg").convert("RGB")
w, h = p1.size
w2, h2 = p2.size
print("p1", w, h, "p2", w2, h2)

# Hero: outer photo columns, below welcome / beside the pink banner (no title).
save(p1.crop((0, 10, int(w * 0.33), 128)), "hero-locs-left.jpg", (720, 1080))
save(p1.crop((int(w * 0.67), 10, w, 128)), "hero-locs-right.jpg", (720, 1080))

# Portrait: face inside the Canva ring.
save(p1.crop((int(w * 0.758), 168, int(w * 0.872), 218)), "stylist-portrait.jpg", (720, 720))

# Hours hair only — skip card text/icons.
save(p1.crop((int(w * 0.015), 278, int(w * 0.22), 318)), "work-cornrows.jpg", (640, 960))
save(p1.crop((int(w * 0.38), 312, int(w * 0.62), 348)), "work-locs.jpg", (640, 960))
save(p1.crop((int(w * 0.52), 280, int(w * 0.695), 328)), "work-box-braids.jpg", (640, 960))

# Before: loc photos at the sides of the title band (cards live lower).
save(p1.crop((0, 502, int(w * 0.28), 548)), "before-1.jpg", (640, 960))
save(p1.crop((int(w * 0.36), 500, int(w * 0.64), 536)), "before-2.jpg", (640, 960))
save(p1.crop((int(w * 0.72), 502, w, 548)), "before-3.jpg", (640, 960))

# Polaroids: inner photo only.
save(
    inset(p2.crop((int(w2 * 0.60), int(h2 * 0.048), int(w2 * 0.86), int(h2 * 0.20))), 0.22),
    "polaroid-1.jpg",
    (640, 800),
)
save(
    inset(p2.crop((int(w2 * 0.67), int(h2 * 0.185), int(w2 * 0.93), int(h2 * 0.345))), 0.22),
    "polaroid-2.jpg",
    (640, 800),
)
save(
    inset(p2.crop((int(w2 * 0.03), int(h2 * 0.70), int(w2 * 0.29), int(h2 * 0.84))), 0.2),
    "polaroid-3.jpg",
    (640, 800),
)
save(
    inset(p2.crop((int(w2 * 0.155), int(h2 * 0.85), int(w2 * 0.40), int(h2 * 0.985))), 0.2),
    "polaroid-4.jpg",
    (640, 800),
)

# Phone screens only.
save(
    inset(p2.crop((int(w2 * 0.035), int(h2 * 0.325), int(w2 * 0.235), int(h2 * 0.52))), 0.1),
    "selfie-1.jpg",
    (560, 980),
)
save(
    inset(p2.crop((int(w2 * 0.205), int(h2 * 0.355), int(w2 * 0.405), int(h2 * 0.55))), 0.1),
    "selfie-2.jpg",
    (560, 980),
)

print("done")
