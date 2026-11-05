"""第3弾サイクル60：歩いた道に大きな足跡（6マスごと・進む向き・左右交互の濃い楕円）。"""
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


def run(calls):
    j = PIXEL.index("function mzFootprint(")
    fn = PIXEL[j:PIXEL.index("\n}\n", j) + 3]
    js = fn + "\nconsole.log(JSON.stringify([" + ",".join(calls) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


class Pure(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzFootprint("), 1)

    def test_four_directions(self):
        r = run(["mzFootprint(1,0,0)", "mzFootprint(0,1,0)", "mzFootprint(-1,0,0)", "mzFootprint(0,-1,0)"])
        self.assertEqual([round(x["angle"], 4) for x in r], [0, 1.5708, 3.1416, -1.5708])

    def test_defaults(self):
        r = run(["mzFootprint(0,0,3)", "mzFootprint('a',1,3)", "mzFootprint(NaN,1,3)", "mzFootprint(1,Infinity,3)", "mzFootprint(null,undefined,1)"])
        for x in r:
            self.assertEqual(x, {"angle": 0, "side": 0})

    def test_side_flips(self):
        r = run(["mzFootprint(1,0,0)", "mzFootprint(1,0,1)", "mzFootprint(1,0,2)", "mzFootprint(1,0,7)"])
        self.assertEqual([x["side"] for x in r], [-1, 1, -1, 1])

    def test_seq_not_finite_is_neutral(self):
        r = run(["mzFootprint(1,0,Infinity)", "mzFootprint(1,0,NaN)", "mzFootprint(1,0,undefined)"])
        for x in r:
            self.assertEqual(x, {"angle": 0, "side": 0})


class Draw(unittest.TestCase):
    def test_interval_and_next_cell(self):
        self.assertIn("seq % 6 === 0", TRAIL)
        self.assertIn("pend", TRAIL)  # つぎのマスで向きを決める。最後のマスは描かない

    def test_toe_and_adjacency_guard(self):
        self.assertIn("ctx.arc(fx + Math.cos(f.angle) * T * 0.3", TRAIL)  # つま先で前後が分かる
        self.assertIn("Math.hypot(dx, dy) > S * 0.9", TRAIL)  # 隣接しない次のマスへは描かない
        self.assertIn("mzOpen(pcx, pcy", TRAIL)  # 壁越しの向きは描かない

    def test_offset_rotate_ellipse(self):
        self.assertIn("T * 0.18", TRAIL)
        self.assertIn("Math.sin(f.angle)", TRAIL)
        self.assertIn("Math.cos(f.angle)", TRAIL)
        self.assertIn("ctx.ellipse(", TRAIL)
        self.assertIn("T * 0.25, T * 0.15, f.angle", TRAIL)

    def test_order_and_save_restore(self):
        f = TRAIL.index("mzFootprint(")
        self.assertGreater(f, TRAIL.index("mzFieldArea("))
        self.assertLess(f, TRAIL.index("for (const [X, Y, rgb] of stations)"))
        seg = TRAIL[TRAIL.index("ctx.save(); ctx.fillStyle = 'rgba(40,26,16"):TRAIL.index("const sr =")]
        self.assertEqual(seg.count("ctx.save()"), 1)
        self.assertEqual(seg.count("ctx.restore()"), 1)


class Safety(unittest.TestCase):
    def test_no_state_or_text(self):
        for l in ADDED:
            self.assertNotIn("G.", l)
            self.assertNotIn("fillText", l)
            for w in ("ぼく", "だに", "約20%"):
                self.assertNotIn(w, l)

    def test_files_allowed(self):
        files = set(git("diff", "--name-only", "origin/main").split())
        self.assertTrue(all(f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/art/cat-art.png", "nishio-go/art/cat-beach.png", "nishio-go/art/cat-castle.png", "nishio-go/art/cat-historic.png", "nishio-go/art/cat-library.png", "nishio-go/art/cat-museum.png", "nishio-go/art/cat-park.png", "nishio-go/art/cat-shrine.png", "nishio-go/art/cat-sight.png", "nishio-go/art/cat-station.png", "nishio-go/art/cat-temple.png", "nishio-go/art/cat-townhall.png", "nishio-go/art/cat-view.png", "nishio-go/art/cat-worship.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") for f in files), files)


if __name__ == "__main__":
    unittest.main()
