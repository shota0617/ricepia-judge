"""第3弾サイクル53：歩いて塗った範囲に地区色のふちどり（塗った場所とまだの場所の境目）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


BODY = func_body("function drawMzTrail(")
ADDED = [l[1:] for l in git("diff", "origin/main", "--", "nishio-go/pixel.js").splitlines()
         if l.startswith("+") and not l.startswith("+++") and "//c17" not in l and "!G.demo" not in l and "//c82" not in l and "r.pts}pt（" not in l]


class Edge(unittest.TestCase):
    def test_grid(self):
        self.assertIn("const S = MZ_K * T, edges = [], entrances = [];", BODY)
        self.assertIn("ox + cx * S, oy + cy * S", BODY)

    def test_four_neighbours(self):
        self.assertIn("[[1, 0], [-1, 0], [0, 1], [0, -1]]", BODY)
        self.assertIn("if (!mzTrail.has((cx + dx) + ',' + (cy + dy))) edges.push(", BODY)

    def test_color_fallback(self):
        self.assertIn("ar ? mzZoneTint(ar).rgb : '255,214,102'", BODY)
        self.assertIn("'rgba(' + rgb + ',.9)'", BODY)

    def test_width(self):
        self.assertIn("ctx.lineWidth = Math.max(2, T * 0.12);", BODY)

    def test_sides(self):
        for t in ("ctx.moveTo(X + S, Y); ctx.lineTo(X + S, Y + S)", "ctx.moveTo(X, Y); ctx.lineTo(X, Y + S)",
                  "ctx.moveTo(X, Y + S); ctx.lineTo(X + S, Y + S)", "ctx.moveTo(X, Y); ctx.lineTo(X + S, Y)"):
            self.assertIn(t, BODY)

    def test_before_stroke(self):
        self.assertLess(BODY.index("for (const [X, Y, dx, dy, rgb] of edges)"), BODY.index("stroke('rgba(26,26,26,.35)'"))


class Unchanged(unittest.TestCase):
    def test_other_funcs_untouched(self):
        d = git("diff", "origin/main", "-U0", "--", "nishio-go/pixel.js")
        for f in ("mzTrailTick", "mzFogAlpha", "mzFogCells", "veil"):   # サイクル64：ミニマップ描画（tint を含む）を廃止したため "tint" は除外
            self.assertFalse([l for l in d.splitlines() if l[:1] in "+-" and f in l], f)

    def test_no_state_or_text(self):
        for l in ADDED:
            self.assertNotIn("G.", l)
            self.assertNotIn("floatText", l)
            self.assertFalse(re.search(r"\b(mzTrail|rp|mzScale)\s*=[^=]", l))
        for w in ("ぼく", "約20%"):
            self.assertFalse([l for l in ADDED if w in l])

    def test_files_allowed(self):
        files = set(git("diff", "--name-only", "origin/main").split())
        self.assertTrue(files <= {"nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go.html", "tests/test_maze_loop4_1.py", "tests/test_maze_loop4_3.py", "tests/test_maze_loop4_6.py", "tests/test_maze_loop3_53.py"} or all(
            f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") for f in files), files)
