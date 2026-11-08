"""第4弾サイクル65：翔米の可愛いドット絵を自店の目印に追加。"""
import json
import subprocess
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go/style.css").read_text(encoding="utf-8")
ART = ROOT / "nishio-go/art/shomai-cute.png"


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True, encoding="utf-8").stdout


def node_place(args):
    js = ("require('./nishio-go/shomai.js');const P=globalThis.nishioShomai;"
          "console.log(JSON.stringify([P.W,P.H].concat(%s.map(a=>P.place(...a)))));" % json.dumps(args))
    return json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)


class Asset(unittest.TestCase):
    def test_png(self):
        im = Image.open(ART)
        self.assertEqual(im.size, (84, 116))
        self.assertEqual(im.mode, "RGBA")
        for xy in ((0, 0), (83, 0), (0, 115), (83, 115)):
            self.assertEqual(im.getpixel(xy)[3], 0)
        px = [p for p in im.getdata() if p[3] > 0]
        self.assertTrue(any(r > 180 and g < 90 and b < 90 for r, g, b, a in px), "赤がない")
        self.assertTrue(any(g > 120 and g > r + 30 and g > b + 30 for r, g, b, a in px), "緑がない")


class Place(unittest.TestCase):
    def test_numbers(self):
        r = node_place([[100, 50, 800], [0, 0, 0], [float("nan") if False else None, 0, 10], [0, 0, -5], [0, 0, "x"]])
        self.assertEqual(r[:2], [84, 116])
        q = r[2]
        self.assertAlmostEqual(q["h"], 352)
        self.assertAlmostEqual(q["w"], 352 * 84 / 116)
        self.assertAlmostEqual(q["w"], 254.9, places=1)
        self.assertAlmostEqual(q["y"] + q["h"], 50 + 800 * 0.72)
        self.assertAlmostEqual(q["x"], 100 + 800 * 0.84)
        self.assertEqual(r[3:], [None, None, None, None])

    def test_nan_inf(self):
        js = ("require('./nishio-go/shomai.js');const P=globalThis.nishioShomai;"
              "console.log(JSON.stringify([P.place(NaN,0,10),P.place(0,Infinity,10),P.place(0,0,0),P.place(0,0,-1),P.place()]));")
        out = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out), [None] * 5)


class Wiring(unittest.TestCase):
    def test_pixel(self):
        self.assertIn("nishio-go/art/shomai-cute.png", PIXEL)
        self.assertIn("nishioShomai", PIXEL)
        self.assertIn("shopHits.push([q.x, q.y, q.x + q.w, q.y + q.h, s])", PIXEL)
        self.assertIn("imageSmoothingEnabled = false", PIXEL)

    def test_game(self):
        self.assertIn("const shopMascot = s => s.shop ?", GAME)
        self.assertIn('class="shomai-art"', GAME)
        self.assertEqual(GAME.count("${shopInside(s)}${shopMascot(s)}"), 2)
        self.assertIn(": '';", GAME.split("const shopMascot", 1)[1].split("\n", 1)[0])

    def test_html_css(self):
        self.assertIn('"shomai"', HTML)
        self.assertGreater(HTML.index('"shomai"'), HTML.index("nishio-go/pixel.js"))   # サイクル183：後読みへ
        self.assertIn(".shomai-art{display:block;margin:8px auto;height:132px;width:auto;image-rendering:pixelated}", CSS)


class Safety(unittest.TestCase):
    def test_no_banned_words(self):
        diff = git("diff", "origin/main", "--", "nishio-go", "nishio-go.html")
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + "20%"):
            self.assertNotIn(w, added)

    def test_changed_files(self):
        names = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for n in names:
            self.assertTrue(n.startswith(("nishio-go/", "tests/")) or n == "nishio-go.html", n)


if __name__ == "__main__":
    unittest.main()
