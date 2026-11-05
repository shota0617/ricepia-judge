"""第4弾サイクル92：特大の名所絵（代表の名所9件＋自店2件）のドット絵化"""
import hashlib
import re
import subprocess
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GIANT = ROOT / "nishio-go" / "art" / "giant"
PIXEL = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")

# 禁止表現（Unicode エスケープ表記。ここには直書きしない）
BANNED = ["\u307c\u304f", "\u3060\u306b", "\u7d0420%"]

SIZES = {n: 96 for n in ["nishio-castle", "okazaki-castle", "iwase-bunko", "konrenji", "nishio-station",
                         "daibutsu", "ohirune", "kurokabe", "chaen"]}
SIZES.update({"ricepia": 128, "kondo": 128})
MAP = {"f-nishio-castle": "nishio-castle", "f-okazaki-castle": "okazaki-castle", "f-iwase-bunko": "iwase-bunko",
       "f-konrenji": "konrenji", "f-nishio-station": "nishio-station", "f-jofukuji": "daibutsu",
       "f-ohirune-house": "ohirune", "f-kurokabe": "kurokabe", "f-inariyama-chaen": "chaen",
       "f-ricepia": "ricepia", "f-kondo-beikoku": "kondo"}


class Loop92(unittest.TestCase):
    def img(self, n):
        return Image.open(GIANT / (n + ".png")).convert("RGBA")

    def test_files(self):
        self.assertEqual(len(SIZES), 11)
        for n, s in SIZES.items():
            im = self.img(n)
            self.assertEqual(im.size, (s, s), n)

    def test_colors_and_outline(self):
        for n in SIZES:
            im = self.img(n)
            px = [p[:3] for p in im.getdata() if p[3] == 255]
            cols = set(px)
            self.assertLessEqual(len(cols), 48, n)
            self.assertIn((38, 38, 38), cols, n)
            self.assertFalse(any(0 < p[3] < 255 for p in im.getdata()), n)

    def test_opaque_ratio(self):
        for n in SIZES:
            im = self.img(n)
            r = sum(1 for p in im.getdata() if p[3] > 0) / (im.width * im.height)
            self.assertTrue(0.15 <= r <= 0.95, (n, r))

    def test_hashes_differ(self):
        hs = {hashlib.md5((GIANT / (n + ".png")).read_bytes()).hexdigest() for n in SIZES}
        self.assertEqual(len(hs), 11)

    def test_giant_art_map(self):
        for k, v in MAP.items():
            self.assertTrue(re.search(r"'%s': '%s'|GIANT_ART\['%s'\] = '%s'" % (k, v, k, v), PIXEL), k)

    def test_no_banned_in_added_lines(self):
        out = subprocess.run(["git", "diff", "HEAD~1", "HEAD", "--", "nishio-go", "tests"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in out.split("\n") if l.startswith("+") and not l.startswith("+++"))
        for w in BANNED:
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
