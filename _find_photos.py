from pathlib import Path
import re
import subprocess

ROOT = Path(r"C:\Users\User\Documents\GitHub\styledbytonika\_src")
ROOT.mkdir(exist_ok=True)

pages = {
    "nappy-locs.html": "https://nappy.co/search/locs",
    "nappy-braids.html": "https://nappy.co/search/braids",
    "nappy-cornrows.html": "https://nappy.co/search/cornrows",
    "nappy-twists.html": "https://nappy.co/search/twists",
    "wiki.html": "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=cornrows%20OR%20dreadlocks%20OR%20box%20braids&srnamespace=6&format=json",
}

for name, url in pages.items():
    dest = ROOT / name
    subprocess.run(
        ["curl.exe", "-L", "-A", "Mozilla/5.0", "-o", str(dest), url],
        check=False,
    )
    print("wrote", dest, dest.stat().st_size if dest.exists() else 0)

for f in ["nappy-locs.html", "nappy-braids.html", "nappy-cornrows.html", "nappy-twists.html"]:
    t = (ROOT / f).read_text(encoding="utf-8", errors="ignore")
    photos = list(dict.fromkeys(re.findall(r"nappy\.co/photo/([A-Za-z0-9_-]+)", t)))
    imgs = list(dict.fromkeys(re.findall(r"https://images\.nappy\.co/photo/[^\"' ]+", t)))
    print(f, "pages", photos[:15])
    print(f, "imgs", imgs[:10])

wiki = ROOT / "wiki.html"
if wiki.exists():
    print("wiki", wiki.read_text(encoding="utf-8", errors="ignore")[:2000])
