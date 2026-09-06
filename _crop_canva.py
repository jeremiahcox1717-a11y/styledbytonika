"""Crop real photos from the Canva template screenshot."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "images"
ASSETS = Path(
    r"C:\Users\User\.cursor\projects\c-Users-User-Documents-GitHub-styledbytonika\assets"
)
LOCAL_SRC = ROOT / "_src"


def find_canva() -> Path:
    LOCAL_SRC.mkdir(exist_ok=True)
    preferred = LOCAL_SRC / "canva-latest.jpg"
    if preferred.exists():
        return preferred
    matches = sorted(ASSETS.glob("*218_www.canva.com*.jpg"))
    if not matches:
        matches = sorted(ASSETS.glob("*canva.com*.jpg"))
    if not matches:
        raise SystemExit("No Canva screenshot found")
    dest = preferred
    src = matches[-1]
    long_src = Path(f"\\\\?\\{src}")
    dest.write_bytes(long_src.read_bytes())
    return dest


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def page_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    """Find the dark website page inside a Canva editor screenshot."""
    w, h = im.size
    px = im.load()
    dark_rows = []
    for y in range(h):
        dark = 0
        for x in range(0, w, 4):
            if luminance(px[x, y]) < 40:
                dark += 1
        if dark > w / 4 / 8:
            dark_rows.append(y)
    if not dark_rows:
        return (0, 0, w, h)
    top, bottom = dark_rows[0], dark_rows[-1]
    dark_cols = []
    for x in range(w):
        dark = 0
        for y in range(top, bottom, 6):
            if luminance(px[x, y]) < 40:
                dark += 1
        if dark > (bottom - top) / 6 / 8:
            dark_cols.append(x)
    if not dark_cols:
        return (0, top, w, bottom + 1)
    return (dark_cols[0], top, dark_cols[-1] + 1, bottom + 1)


def save_photo(im: Image.Image, box: tuple[int, int, int, int], name: str, min_w: int = 900) -> None:
    crop = im.crop(box)
    if crop.width < min_w:
        scale = min_w / crop.width
        crop = crop.resize(
            (int(crop.width * scale), int(crop.height * scale)),
            Image.Resampling.LANCZOS,
        )
    crop = ImageEnhance.Sharpness(crop).enhance(1.15)
    crop = ImageEnhance.Contrast(crop).enhance(1.06)
    path = OUT / name
    crop.save(path, format="JPEG", quality=88, optimize=True)
    print(f"wrote {path.name} {crop.size}")


def main() -> None:
    src = find_canva()
    im = Image.open(src).convert("RGB")
    print("source", src, im.size)
    x0, y0, x1, y1 = page_bbox(im)
    page = im.crop((x0, y0, x1, y1))
    pw, ph = page.size
    print("page", pw, ph, "bbox", (x0, y0, x1, y1))
    debug = ROOT / "_src" / "page-debug.jpg"
    debug.parent.mkdir(exist_ok=True)
    page.save(debug, quality=85)
    print("saved page debug")

    # Typical Canva page: hero ~24%, stylist ~22%, hours ~28%, policies rest.
    hero = page.crop((0, 0, pw, int(ph * 0.235)))
    save_photo(hero, (0, 0, hero.width // 2, hero.height), "hero-locs-left.jpg")
    save_photo(hero, (hero.width // 2, 0, hero.width, hero.height), "hero-locs-right.jpg")

    stylist = page.crop((0, int(ph * 0.235), pw, int(ph * 0.455)))
    sw, sh = stylist.size
    # Portrait sits on the right half; keep a square around the circular photo.
    right = stylist.crop((int(sw * 0.52), 0, sw, sh))
    rw, rh = right.size
    side = min(rw, rh)
    cx, cy = rw // 2, int(rh * 0.48)
    left = max(0, cx - side // 2)
    top = max(0, cy - side // 2)
    portrait = right.crop((left, top, min(rw, left + side), min(rh, top + side)))
    portrait = ImageEnhance.Sharpness(portrait).enhance(1.12)
    if portrait.width < 700:
        s = 700 / portrait.width
        portrait = portrait.resize(
            (int(portrait.width * s), int(portrait.height * s)),
            Image.Resampling.LANCZOS,
        )
    portrait.save(OUT / "stylist-portrait.jpg", quality=88, optimize=True)
    print("wrote stylist-portrait.jpg", portrait.size)
    stylist.save(ROOT / "_src" / "stylist-debug.jpg", quality=85)

    hours = page.crop((0, int(ph * 0.455), pw, int(ph * 0.72)))
    hw, hh = hours.size
    col = hw // 3
    save_photo(hours, (0, 0, col, hh), "work-cornrows.jpg")
    save_photo(hours, (col, 0, col * 2, hh), "work-soft-locs.jpg")
    save_photo(hours, (col * 2, 0, hw, hh), "work-locs.jpg")
    hours.save(ROOT / "_src" / "hours-debug.jpg", quality=85)

    # Extra gallery tiles from the hero photos (same real shots, different crops).
    save_photo(hero, (int(pw * 0.08), int(hero.height * 0.12), int(pw * 0.42), int(hero.height * 0.92)), "work-twists.jpg")
    save_photo(hero, (int(pw * 0.58), int(hero.height * 0.08), int(pw * 0.95), int(hero.height * 0.9)), "work-box-braids.jpg")
    save_photo(hours, (int(hw * 0.18), int(hh * 0.1), int(hw * 0.82), int(hh * 0.95)), "work-updo.jpg")
    hours.save(OUT / "hours-braids-bg.jpg", quality=88, optimize=True)
    print("done")


if __name__ == "__main__":
    main()
