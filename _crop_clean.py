"""Crop flyer photos for a cleaner site (photos only)."""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "_src"
OUT = ROOT / "images"


def save(im: Image.Image, name: str, size: tuple[int, int]) -> None:
    im = im.convert("RGB")
    im = im.resize(size, Image.Resampling.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.15, percent=125, threshold=3))
    im = ImageEnhance.Contrast(im).enhance(1.12)
    im = ImageEnhance.Color(im).enhance(1.06)
    im.save(OUT / name, quality=93, optimize=True)
    print(name, im.size)


def inset(im: Image.Image, frac: float = 0.13) -> Image.Image:
    w, h = im.size
    return im.crop((int(w * frac), int(h * frac * 0.75), int(w * (1 - frac)), int(h * (1 - frac * 0.8))))


p1 = Image.open(SRC / "canva-pink-1.jpg").convert("RGB")
p2 = Image.open(SRC / "canva-pink-2.jpg").convert("RGB")
w, h = p1.size
w2, h2 = p2.size
print("p1", w, h, "p2", w2, h2)

hero_b = int(h * 0.215)
save(p1.crop((0, 0, w // 2, hero_b)), "hero-locs-left.jpg", (1100, 1500))
save(p1.crop((w // 2, 0, w, hero_b)), "hero-locs-right.jpg", (1100, 1500))

face = p1.crop((int(w * 0.71), int(h * 0.232), int(w * 0.905), int(h * 0.356)))
save(face, "stylist-portrait.jpg", (900, 900))

ht, hb = int(h * 0.445), int(h * 0.572)
hours = p1.crop((0, ht, w, hb))
save(hours, "hours-from-canva.jpg", (1800, 720))
bw, bh = hours.size
names = ["work-cornrows.jpg", "work-locs.jpg", "work-box-braids.jpg"]
for i, name in enumerate(names):
    pad = 6
    panel = hours.crop((int(bw * i / 3) + pad, 2, int(bw * (i + 1) / 3) - pad, bh - 2))
    save(panel, name, (800, 1200))

bt, bb = int(h * 0.84), int(h * 0.995)
before = p1.crop((0, bt, w, bb))
save(before, "before-from-canva.jpg", (1800, 720))
bw, bh = before.size
for i, name in enumerate(["before-1.jpg", "before-2.jpg", "before-3.jpg"]):
    panel = before.crop((int(bw * i / 3) + 4, int(bh * 0.12), int(bw * (i + 1) / 3) - 4, bh))
    save(panel, name, (800, 1200))

pol1 = inset(p2.crop((int(w2 * 0.59), int(h2 * 0.042), int(w2 * 0.875), int(h2 * 0.205))))
pol2 = inset(p2.crop((int(w2 * 0.655), int(h2 * 0.18), int(w2 * 0.945), int(h2 * 0.35))))
pol3 = inset(p2.crop((int(w2 * 0.025), int(h2 * 0.698), int(w2 * 0.30), int(h2 * 0.845))))
pol4 = inset(p2.crop((int(w2 * 0.145), int(h2 * 0.845), int(w2 * 0.405), int(h2 * 0.99))))
save(pol1, "polaroid-1.jpg", (800, 1000))
save(pol2, "polaroid-2.jpg", (800, 1000))
save(pol3, "polaroid-3.jpg", (800, 1000))
save(pol4, "polaroid-4.jpg", (800, 1000))

s1 = inset(p2.crop((int(w2 * 0.048), int(h2 * 0.40), int(w2 * 0.255), int(h2 * 0.65))), 0.08)
s2 = inset(p2.crop((int(w2 * 0.22), int(h2 * 0.438), int(w2 * 0.43), int(h2 * 0.675))), 0.08)
save(s1, "selfie-1.jpg", (700, 1200))
save(s2, "selfie-2.jpg", (700, 1200))

print("done")
