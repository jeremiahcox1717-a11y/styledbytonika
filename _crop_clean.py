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

# Full hero band; CSS darkens the center so baked title stays hidden.
save(p1.crop((0, 0, w, 135)), "hero-from-canva.jpg", (1600, 980))
save(p1.crop((0, 102, int(w * 0.20), 126)), "hero-locs-left.jpg", (720, 1080))
save(p1.crop((int(w * 0.82), 102, w, 126)), "hero-locs-right.jpg", (720, 1080))

# Portrait: full face inside the Canva ring.
save(p1.crop((int(w * 0.738), 158, int(w * 0.882), 220)), "stylist-portrait.jpg", (720, 720))

# Hours hair only — far from card text/icons.
save(p1.crop((int(w * 0.01), 276, int(w * 0.15), 308)), "work-cornrows.jpg", (640, 960))
save(p1.crop((int(w * 0.42), 318, int(w * 0.58), 344)), "work-locs.jpg", (640, 960))
save(p1.crop((int(w * 0.50), 282, int(w * 0.62), 318)), "work-box-braids.jpg", (640, 960))

# Polaroids: inner photo only.
save(
    inset(p2.crop((int(w2 * 0.60), int(h2 * 0.048), int(w2 * 0.86), int(h2 * 0.20))), 0.22),
    "polaroid-1.jpg",
    (640, 800),
)
save(
    inset(p2.crop((int(w2 * 0.73), int(h2 * 0.19), int(w2 * 0.94), int(h2 * 0.335))), 0.16),
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
    inset(p2.crop((int(w2 * 0.05), int(h2 * 0.36), int(w2 * 0.22), int(h2 * 0.515))), 0.12),
    "selfie-1.jpg",
    (560, 980),
)
save(
    inset(p2.crop((int(w2 * 0.23), int(h2 * 0.375), int(w2 * 0.40), int(h2 * 0.54))), 0.14),
    "selfie-2.jpg",
    (560, 980),
)

print("done")
