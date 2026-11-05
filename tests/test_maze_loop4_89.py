"""第4弾サイクル89：カテゴリ絵（cat-*.png 14種）を手描きドット絵に作り直す"""
import hashlib
import subprocess
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "nishio-go" / "art"
NAMES = ["art", "beach", "castle", "historic", "library", "museum", "park", "shrine", "sight",
         "station", "temple", "townhall", "view", "worship"]
K = (38, 38, 38)


def load(n):
    return Image.open(ART / f"cat-{n}.png").convert("RGBA")


def has(n, ok):
    return any(p[3] == 255 and ok(*p[:3]) for p in load(n).getdata())


class TestCatDots(unittest.TestCase):
    def test_size_and_colors(self):
        for n in NAMES:
            im = load(n)
            self.assertEqual(im.size, (32, 32), n)
            cols = {p for p in im.getdata() if p[3] > 0}
            self.assertLessEqual(len(cols), 24, n)

    def test_outline_and_coverage(self):
        for n in NAMES:
            px = list(load(n).getdata())
            self.assertTrue(any(p[:3] == K and p[3] == 255 for p in px), n)
            self.assertGreaterEqual(sum(1 for p in px if p[3] > 0) / len(px), 0.25, n)

    def test_all_different(self):
        hs = {hashlib.md5(load(n).tobytes()).hexdigest() for n in NAMES}
        self.assertEqual(len(hs), len(NAMES))

    def test_representative_colors(self):
        self.assertTrue(has("shrine", lambda r, g, b: r >= 200 and g <= 80 and b <= 80))
        self.assertTrue(has("station", lambda r, g, b: r >= 200 and g <= 80 and b <= 80))
        self.assertTrue(has("beach", lambda r, g, b: r <= 80 and g >= 140 and b >= 200))
        self.assertTrue(has("park", lambda r, g, b: r >= 90 and g >= 150 and b <= 90))

    def test_game_still_uses_cat_art(self):
        js = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
        self.assertIn("'cat-'", js)

    def test_no_banned_words(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):   # 禁止表現はエスケープ表記
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
