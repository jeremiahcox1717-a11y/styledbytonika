from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
p1 = Image.open(ROOT / "canva-pink-1.jpg").convert("RGB")
p2 = Image.open(ROOT / "canva-pink-2.jpg").convert("RGB")
out = ROOT / "debug"
out.mkdir(exist_ok=True)

w, h = p1.size
print("p1", w, h)
for i in range(20):
    y0 = int(h * i / 20)
    y1 = int(h * (i + 1) / 20)
    p1.crop((0, y0, w, y1)).resize((744, 96), Image.Resampling.NEAREST).save(
        out / f"p1_{i:02d}_{y0}-{y1}.jpg", quality=90
    )

w2, h2 = p2.size
print("p2", w2, h2)
for i in range(12):
    y0 = int(h2 * i / 12)
    y1 = int(h2 * (i + 1) / 12)
    p2.crop((0, y0, w2, y1)).resize((762, 96), Image.Resampling.NEAREST).save(
        out / f"p2_{i:02d}_{y0}-{y1}.jpg", quality=90
    )
print("wrote", out)
