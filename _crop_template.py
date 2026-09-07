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

# --- Flyer 1: hero photos (far outer sides, skip baked title) ---
hero_bot = int(h * 0.205)
left = p1.crop((0, int(h * 0.01), int(w * 0.24), hero_bot))
right = p1.crop((int(w * 0.78), int(h * 0.01), w, hero_bot))
save(left, "hero-locs-left.jpg", (960, 1440))
save(right, "hero-locs-right.jpg", (960, 1440))
left.save(DBG / "hero-left-check.jpg", quality=90)
right.save(DBG / "hero-right-check.jpg", quality=90)

# --- Portrait: face inside the Canva circle ---
face = p1.crop((int(w * 0.70), int(h * 0.226), int(w * 0.918), int(h * 0.364)))
save(face, "stylist-portrait.jpg", (800, 800))
face.save(DBG / "portrait-check.jpg", quality=90)

# --- Hours band only (the 3 braid photos) ---
ht, hb = int(h * 0.442), int(h * 0.572)
hours_band = p1.crop((2, ht, w - 2, hb))
save(hours_band, "hours-from-canva.jpg", (1600, 720))
hours_band.save(DBG / "hours-band-check.jpg", quality=90)
thirds = [
    ("work-cornrows.jpg", 0.00, 0.333),
    ("work-locs.jpg", 0.333, 0.666),
    ("work-box-braids.jpg", 0.666, 1.00),
]
bw, bh = hours_band.size
for name, a, b in thirds:
    panel = hours_band.crop((int(bw * a), 0, int(bw * b), int(bh * 0.42)))
    save(panel, name, (720, 1080))
    panel.save(DBG / f"{name}-check.jpg", quality=90)

# --- Before band: the 3 hair photos ---
bt, bb = int(h * 0.802), int(h * 0.995)
before_band = p1.crop((2, bt, w - 2, bb))
save(before_band, "before-from-canva.jpg", (1600, 720))
before_band.save(DBG / "before-band-check.jpg", quality=90)
before_thirds = [
    ("before-1.jpg", 0.00, 0.333),
    ("before-2.jpg", 0.333, 0.667),
    ("before-3.jpg", 0.667, 1.00),
]
bw, bh = before_band.size
for name, a, b in before_thirds:
    panel = before_band.crop((int(bw * a), int(bh * 0.55), int(bw * b), bh))
    save(panel, name, (720, 1080))
    panel.save(DBG / f"{name}-check.jpg", quality=90)

# --- Flyer 2: polaroids (inner photo, CSS adds the white frame) ---
pol1 = p2.crop((int(w2 * 0.605), int(h2 * 0.048), int(w2 * 0.855), int(h2 * 0.192)))
pol2 = p2.crop((int(w2 * 0.665), int(h2 * 0.188), int(w2 * 0.935), int(h2 * 0.342)))
save(pol1, "polaroid-1.jpg", (720, 900))
save(pol2, "polaroid-2.jpg", (720, 900))
pol1.save(DBG / "pol1-check.jpg", quality=90)
pol2.save(DBG / "pol2-check.jpg", quality=90)

# Thank-you polaroids
pol3 = p2.crop((int(w2 * 0.02), int(h2 * 0.698), int(w2 * 0.28), int(h2 * 0.838)))
pol4 = p2.crop((int(w2 * 0.14), int(h2 * 0.848), int(w2 * 0.40), int(h2 * 0.988)))
save(pol3, "polaroid-3.jpg", (720, 900))
save(pol4, "polaroid-4.jpg", (720, 900))
pol3.save(DBG / "pol3-check.jpg", quality=90)
pol4.save(DBG / "pol4-check.jpg", quality=90)

# Phone selfies (inner screen)
s1 = p2.crop((int(w2 * 0.055), int(h2 * 0.418), int(w2 * 0.245), int(h2 * 0.638)))
s2 = p2.crop((int(w2 * 0.228), int(h2 * 0.448), int(w2 * 0.418), int(h2 * 0.668)))
save(s1, "selfie-1.jpg", (640, 1100))
save(s2, "selfie-2.jpg", (640, 1100))
s1.save(DBG / "s1-check.jpg", quality=90)
s2.save(DBG / "s2-check.jpg", quality=90)

# Selfies section background: far-right hair panel only
bg = p2.crop((int(w2 * 0.74), int(h2 * 0.39), w2, int(h2 * 0.68)))
save(bg, "selfies-from-canva.jpg", (1400, 900))
bg.save(DBG / "selfies-bg-check.jpg", quality=90)

print("done")
