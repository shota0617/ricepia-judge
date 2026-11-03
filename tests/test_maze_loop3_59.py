"""第3弾サイクル59：3つの駅で囲んだ範囲がフィールド（地区色の薄い膜）になる。"""
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
ADDED = [l[1:] for l in git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l and "!G.demo" not in l]


class Area(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzFieldArea("), 1)

    def test_values(self):
        j = PIXEL.index("function mzFieldArea(")
        fn = PIXEL[j:PIXEL.index("\n}\n", j) + 3]
        js = fn + "\nconsole.log(JSON.stringify([[[0,0],[10,0],[0,10]],[[0,0],[5,0],[10,0]],[[0,10],[10,0],[0,0]],[null,[1,1],[2,2]],[['a',0],[10,0],[0,10]],[[NaN,0],[10,0],[0,10]],[[0,0],[10,0],[0,Infinity]]].map(a=>mzFieldArea(...a))));"
        r = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(r, [50, 0, 50, 0, 0, 0, 0])


class Draw(unittest.TestCase):
    def test_order(self):
        f = TRAIL.index("mzFieldArea(")
        self.assertLess(TRAIL.index("for (let i = 0; i + 1 < stationAll.length; i++)"), f)
        self.assertLess(f, TRAIL.index("for (const [X, Y, rgb] of hubAll)"))
        self.assertLess(f, TRAIL.index("for (const [X, Y, rgb] of stations)"))

    def test_pairs_threshold_color(self):
        self.assertIn("for (let i = 0; i + 2 < stationAll.length; i += 2)", TRAIL)
        self.assertIn("mzFieldArea(p, q, r) > T * T * 4", TRAIL)
        self.assertIn("'rgba(' + p[2] + ',.13)'", TRAIL)

    def test_closing_link(self):
        seg = TRAIL[TRAIL.index("for (let i = 0; i + 2 < stationAll.length"):TRAIL.index("for (const [X, Y, rgb] of hubAll)")]
        self.assertEqual(seg.count("ctx.moveTo(r[0], r[1]); ctx.lineTo(p[0], p[1])"), 2)

    def test_existing_kept(self):
        for k in ("stationAll", "hubAll", "entrances", "flowers", "mzRailTiePerp(", "rgba(70,70,78,.85)"):
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
        self.assertTrue(all(f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go.html") for f in files), files)


if __name__ == "__main__":
    unittest.main()
