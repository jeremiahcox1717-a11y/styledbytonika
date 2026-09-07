"""Crop the actual photos from the Canva flyers. Photo pixels only — no stock."""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "_src"
OUT = ROOT / "images"
DBG = SRC / "canva-crops"
DBG.mkdir(exist_ok=True)


def save(im: Image.Image, name: str, size: tuple[int, int]) -> None:
    im = im.convert("RGB")
    im = im.resize(size, Image.Resampling.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.35, percent=145, threshold=2))
    im = ImageEnhance.Contrast(im).enhance(1.08)
    im = ImageEnhance.Color(im).enhance(1.04)
    dest = OUT / name
    im.save(dest, quality=92, optimize=True)
    print(f"{name} {im.size}")


p1 = Image.open(SRC / "canva-pink-1.jpg").convert("RGB")
p2 = Image.open(SRC / "canva-pink-2.jpg").convert("RGB")
w, h = p1.size
w2, h2 = p2.size
print("p1", w, h, "p2", w2, h2)

# --- Flyer 1: hero photos (outer sides only, skip baked title) ---
hero_bot = int(h * 0.208)
left = p1.crop((0, int(h * 0.012), int(w * 0.36), hero_bot))
right = p1.crop((int(w * 0.64), int(h * 0.012), w, hero_bot))
save(left, "hero-locs-left.jpg", (960, 1440))
save(right, "hero-locs-right.jpg", (960, 1440))
left.save(DBG / "hero-left-check.jpg", quality=90)
right.save(DBG / "hero-right-check.jpg", quality=90)

# --- Portrait: inside the Canva circle ---
face = p1.crop((int(w * 0.668), int(h * 0.218), int(w * 0.942), int(h * 0.372)))
save(face, "stylist-portrait.jpg", (800, 800))
face.save(DBG / "portrait-check.jpg", quality=90)

# --- Hours band: three hair photos ---
ht, hb = int(h * 0.448), int(h * 0.698)
hours_band = p1.crop((0, ht, w, hb))
hours_band.save(DBG / "hours-band-check.jpg", quality=90)
thirds = [
    ("work-cornrows.jpg", 0.00, 0.28),
    ("work-locs.jpg", 0.36, 0.64),
    ("work-box-braids.jpg", 0.72, 1.00),
]
for name, a, b in thirds:
    panel = hours_band.crop(
        (int(w * a), 0, int(w * b), int(hours_band.height * 0.48))
    )
    save(panel, name, (720, 1080))
    panel.save(DBG / f"{name}-check.jpg", quality=90)

# --- Before band: three hair photos ---
bt, bb = int(h * 0.795), int(h * 0.995)
before_band = p1.crop((0, bt, w, bb))
before_band.save(DBG / "before-band-check.jpg", quality=90)
before_thirds = [
    ("before-1.jpg", 0.00, 0.33),
    ("before-2.jpg", 0.33, 0.67),
    ("before-3.jpg", 0.67, 1.00),
]
for name, a, b in before_thirds:
    panel = before_band.crop((int(w * a), int(before_band.height * 0.28), int(w * b), before_band.height))
    save(panel, name, (720, 1080))
    panel.save(DBG / f"{name}-check.jpg", quality=90)

# --- Flyer 2: polaroids (inner photo, CSS adds the white frame) ---
pol1 = p2.crop((int(w2 * 0.58), int(h2 * 0.035), int(w2 * 0.88), int(h2 * 0.205)))
pol2 = p2.crop((int(w2 * 0.64), int(h2 * 0.175), int(w2 * 0.955), int(h2 * 0.355)))
save(pol1, "polaroid-1.jpg", (720, 900))
save(pol2, "polaroid-2.jpg", (720, 900))
pol1.save(DBG / "pol1-check.jpg", quality=90)
pol2.save(DBG / "pol2-check.jpg", quality=90)

# Thank-you polaroids
pol3 = p2.crop((int(w2 * 0.04), int(h2 * 0.705), int(w2 * 0.34), int(h2 * 0.875)))
pol4 = p2.crop((int(w2 * 0.18), int(h2 * 0.82), int(w2 * 0.48), int(h2 * 0.985)))
save(pol3, "polaroid-3.jpg", (720, 900))
save(pol4, "polaroid-4.jpg", (720, 900))
pol3.save(DBG / "pol3-check.jpg", quality=90)
pol4.save(DBG / "pol4-check.jpg", quality=90)

# Phone selfies (inner screen)
s1 = p2.crop((int(w2 * 0.045), int(h2 * 0.405), int(w2 * 0.265), int(h2 * 0.655)))
s2 = p2.crop((int(w2 * 0.205), int(h2 * 0.435), int(w2 * 0.445), int(h2 * 0.685)))
save(s1, "selfie-1.jpg", (640, 1100))
save(s2, "selfie-2.jpg", (640, 1100))
s1.save(DBG / "s1-check.jpg", quality=90)
s2.save(DBG / "s2-check.jpg", quality=90)

# Selfies section background: right-side hair panels only
bg = p2.crop((int(w2 * 0.52), int(h2 * 0.38), w2, int(h2 * 0.70)))
save(bg, "selfies-from-canva.jpg", (1400, 900))
bg.save(DBG / "selfies-bg-check.jpg", quality=90)

print("done")
