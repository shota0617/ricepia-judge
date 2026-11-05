"""第3弾サイクル58：歩いた道に枕木を描き、さんぽ道が線路に見える。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


i = PIXEL.index("function drawMzTrail(")
TRAIL = PIXEL[i:PIXEL.index("\n}\n", i)]
ADDED = [l[1:] for l in git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l and "!G.demo" not in l and "//c82" not in l]


class Perp(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzRailTiePerp("), 1)

    def test_values(self):
        j = PIXEL.index("function mzRailTiePerp(")
        fn = PIXEL[j:PIXEL.index("\n", j)]
        js = fn + "\nconsole.log(JSON.stringify([[1,0],[0,1],[-1,0],[0,-1],[0,0],['a',1],[null,undefined],[NaN,1],[3,4]].map(a=>mzRailTiePerp(...a))));"
        r = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
        want = [[0, 1], [-1, 0], [0, -1], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [-0.8, 0.6]]
        for got, w in zip(r, want):
            self.assertAlmostEqual(got[0], w[0])
            self.assertAlmostEqual(got[1], w[1])


class Draw(unittest.TestCase):
    def test_ties_before_cream_stroke(self):
        t = TRAIL.index("mzRailTiePerp(")
        self.assertLess(TRAIL.index("for (const [X, Y, dx, dy, rgb] of edges)"), t)
        self.assertLess(t, TRAIL.index("stroke('rgba(255,250,232,.55)', lw)"))
        seg = TRAIL[TRAIL.index("ctx.lineCap = 'butt'; ctx.strokeStyle"):TRAIL.index("const stroke = ")]
        self.assertIn("of links", seg)
        self.assertIn("rgba(101,67,33,.8)", seg)
        self.assertIn("Math.max(2, T * 0.14)", seg)
        self.assertIn("lw + T * 0.55", seg)
        self.assertIn("'butt'", seg)

    def test_rails_after_cream_dot(self):
        rail = TRAIL.index("rgba(70,70,78,.85)")
        self.assertGreater(rail, TRAIL.index("dot('rgba(255,250,232,.55)', rg)"))
        seg = TRAIL[rail:TRAIL.index("const pr0", rail)]
        self.assertIn("mzRailTiePerp(", seg)
        self.assertIn("T * 0.16", seg)
        self.assertIn("of links", seg)

    def test_existing_kept(self):
        for k in ("stationAll", "hubAll", "entrances", "flowers", "mzOpen(cx, cy, dx, dy)"):
            self.assertIn(k, TRAIL)


class Safety(unittest.TestCase):
    def test_no_state_or_text(self):
        for l in ADDED:
            self.assertNotIn("G.", l)
            self.assertNotIn("fillText", l)
            for w in ("ぼく", "だに", "約20%"):
                self.assertNotIn(w, l)

    def test_files_allowed(self):
        files = set(git("diff", "--name-only", "origin/main").split())
        self.assertTrue(all(f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") for f in files), files)


if __name__ == "__main__":
    unittest.main()
