"""Download real photography for the Styled by Tonika site."""
from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path

import urllib.request

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "images"
OUT.mkdir(exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read()


def save_jpeg(im: Image.Image, name: str, size: tuple[int, int] | None = None) -> None:
    im = im.convert("RGB")
    if size:
        im = ImageOps.fit(im, size, Image.Resampling.LANCZOS, centering=(0.5, 0.45))
    im = ImageEnhance.Contrast(im).enhance(1.04)
    path = OUT / name
    im.save(path, format="JPEG", quality=90, optimize=True)
    print(f"saved {name} {im.size}")


def try_urls(urls: list[str]) -> Image.Image:
    last_err = None
    for url in urls:
        try:
            data = fetch(url)
            im = Image.open(BytesIO(data))
            im.load()
            print("  ok", url, im.size)
            return im
        except Exception as exc:
            print("  fail", url, type(exc).__name__, exc)
            last_err = exc
    raise RuntimeError(last_err)


def pexels(photo_id: int, w: int = 1600) -> str:
    return f"https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w={w}"


def unsplash(photo_id: str, w: int = 1600) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w={w}&q=80"


def nappy_images(query: str, limit: int = 8) -> list[str]:
    html = fetch(f"https://nappy.co/search/{query}").decode("utf-8", "ignore")
    urls = re.findall(r"https://[^\"']+\.(?:jpg|jpeg|png|webp)", html, flags=re.I)
    urls += re.findall(r"https://images\.nappy\.co/[^\"']+", html)
    urls += re.findall(r"https://nappy\.imgix\.net/[^\"']+", html)
    # also JSON blobs
    for m in re.finditer(r"https:[^\"']+cloudfront[^\"']+", html):
        urls.append(m.group(0).replace("\\u0026", "&").replace("\\/", "/"))
    cleaned = []
    for u in urls:
        u = u.replace("\\u0026", "&").replace("\\/", "/")
        if u not in cleaned:
            cleaned.append(u)
    print(f"nappy {query}: {len(cleaned)} urls")
    for u in cleaned[:limit]:
        print(" ", u[:140])
    return cleaned


def pexels_search(query: str) -> list[int]:
    html = fetch(f"https://www.pexels.com/search/{query.replace(' ', '%20')}/").decode("utf-8", "ignore")
    ids = [int(x) for x in re.findall(r"pexels-photo-(\d+)", html)]
    unique = []
    for i in ids:
        if i not in unique:
            unique.append(i)
    print(f"pexels {query}: {unique[:12]}")
    return unique


def main() -> None:
    # Discover live photo IDs from free stock sites.
    for q in ["locs", "braids", "cornrows", "twists"]:
        try:
            nappy_images(q)
        except Exception as exc:
            print("nappy fail", q, exc)
    for q in ["dreadlocks", "box braids", "cornrows", "hair twists", "pink hair woman"]:
        try:
            pexels_search(q)
        except Exception as exc:
            print("pexels fail", q, exc)

    # High-res real photos (Pexels/Unsplash IDs). We'll refine after inspecting.
    mapping = {
        "hero-locs-left.jpg": [
            pexels(2010812),
            pexels(1838554),
            unsplash("photo-1605497788044-5a32c7078486"),
        ],
        "hero-locs-right.jpg": [
            pexels(1319460),
            pexels(2787341),
            unsplash("photo-1580618672591-eb180b1a973f"),
        ],
        "stylist-portrait.jpg": [
            pexels(27781463),
            pexels(16783986),
            pexels(1239291),
        ],
        "work-locs.jpg": [
            pexels(2010812),
            pexels(1838554),
        ],
        "work-soft-locs.jpg": [
            pexels(3065209),
            pexels(1181686),
        ],
        "work-box-braids.jpg": [
            pexels(1838554),
            pexels(1689731),
        ],
        "work-cornrows.jpg": [
            pexels(1319460),
            pexels(3993449),
        ],
        "work-twists.jpg": [
            pexels(2787341),
            pexels(2709388),
        ],
        "work-updo.jpg": [
            pexels(3992656),
            pexels(3992874),
        ],
        "hours-braids-bg.jpg": [
            pexels(3993449),
            pexels(1838554),
        ],
    }

    sizes = {
        "hero-locs-left.jpg": (900, 1400),
        "hero-locs-right.jpg": (900, 1400),
        "stylist-portrait.jpg": (900, 900),
        "work-locs.jpg": (900, 1200),
        "work-soft-locs.jpg": (900, 1200),
        "work-box-braids.jpg": (900, 1200),
        "work-cornrows.jpg": (900, 1200),
        "work-twists.jpg": (900, 1200),
        "work-updo.jpg": (900, 1200),
        "hours-braids-bg.jpg": (1600, 1000),
    }

    for name, urls in mapping.items():
        print("==", name)
        im = try_urls(urls)
        save_jpeg(im, name, sizes[name])


if __name__ == "__main__":
    main()
