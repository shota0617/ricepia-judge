"""第4弾サイクル87：目印の絵（poi.png・spots.png）を手描きドット絵に作り直す"""
import subprocess
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def cells(name, n):
    im = Image.open(ROOT / "nishio-go" / "art" / name).convert("RGBA")
    return im, [im.crop((i * n, 0, i * n + n, n)) for i in range(im.width // n)]


class Loop87(unittest.TestCase):
    def test_sheet_sizes_and_colors(self):
        for name, size, n in (("poi.png", (544, 32), 17), ("spots.png", (336, 24), 14)):
            im, cs = cells(name, size[1])
            self.assertEqual(im.size, size)
            self.assertEqual(len(cs), n)
            self.assertLessEqual(len({p[:3] for p in im.getdata() if p[3]}), 80)

    def test_cells_have_outline_fill_and_differ(self):
        for name, n in (("poi.png", 32), ("spots.png", 24)):
            _, cs = cells(name, n)
            seen = set()
            for c in cs:
                px = list(c.getdata())
                op = [p for p in px if p[3] == 255]
                self.assertGreaterEqual(len(op), len(px) * 0.25)
                self.assertTrue(any(p[:3] == (38, 38, 38) for p in op))
                self.assertLessEqual(len({p[:3] for p in op}), 12)
                seen.add(c.tobytes())
            self.assertEqual(len(seen), len(cs))

    def test_pixel_js(self):
        self.assertIn("nishio-go/art/poi.png", PX)
        self.assertIn("nishio-go/art/spots.png", PX)
        self.assertIn("const POI_ORDER = ['townhall', 'hospital', 'school', 'library', 'police', 'fire', 'post', 'shop', 'konbini', 'super', 'home', 'drug', 'fuel', 'bank', 'food', 'cafe', 'station'];", PX)
        self.assertIn("const SPOT_ORDER = ['park0', 'park1', 'park2', 'park3', 'historic', 'view', 'sight', 'art', 'beach', 'museum', 'torii', 'temple', 'castle', 'town'];", PX)

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
