"""第3弾サイクル61：みかんが通路をゆっくり転がって移動する（mzFruitDir・mzFruitTick・滑り描画）。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


ADDED = [l[1:] for l in git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and not l.startswith("+++")]
a = PIXEL.index("function mzFruitDir(")
DIR = PIXEL[a:PIXEL.index("\n}\n", a) + 3]
d = PIXEL.index("function drawMzFruit(")
DRAW = PIXEL[d:PIXEL.index("\n}\n", d)]

PRE = """
const MZ_R = 12, MZ_K = 3, MZ_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let dirty = false, pts = 0;
const rp = { x: 1.5 * MZ_K, y: 1.5 * MZ_K }, roll = { happyT: 0 };
const t = new Uint8Array(MZ_R * MZ_R);
for (let y = 1; y < MZ_R - 1; y++) for (let x = 1; x < MZ_R - 1; x++) t[y * MZ_R + x] = 1;
const ar = { x0: 0, y0: 0, t };
const mzArea = (x, y) => (x >= 0 && x < MZ_R && y >= 0 && y < MZ_R ? ar : null);
const mzType = (x, y) => { const q = mzArea(x, y); return q ? q.t[y * MZ_R + x] : -1; };
const mzOpen = () => true, mzSpotCell = () => false, mzGrainAt = () => false, mzPadAt = () => -1, mzLineSet = () => [], mzCritDrawn = [];
const mzGate = new Map(), mzRt = { path: [[1, 1], [10, 10]] }, mzFx = [];
const grainSound = () => {}, floatText = () => {};
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; } };
"""


def block():
    a = PIXEL.index("const MZ_FRUIT = ")
    return PIXEL[a:PIXEL.index("function drawMzFruit(")]


def run(body):
    js = "const f = () => {" + PRE + block() + body + "}; console.log(JSON.stringify(f()));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


def dirs(calls):
    js = DIR + "\nconsole.log(JSON.stringify([" + ",".join(calls) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


class Dir(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzFruitDir("), 1)

    def test_straight_first(self):
        self.assertEqual(dirs(["mzFruitDir(1,0,[[0,1],[1,0],[-1,0]])"]), [[1, 0]])

    def test_clockwise_then_counter(self):
        r = dirs(["mzFruitDir(1,0,[[0,1],[0,-1],[-1,0]])", "mzFruitDir(1,0,[[0,-1],[-1,0]])"])
        self.assertEqual(r, [[0, 1], [0, -1]])

    def test_reverse_at_dead_end(self):
        self.assertEqual(dirs(["mzFruitDir(1,0,[[-1,0]])"]), [[-1, 0]])

    def test_invalid_dir_takes_first(self):
        r = dirs(["mzFruitDir(0,0,[[0,-1],[1,0]])", "mzFruitDir('a',1,[[0,-1]])", "mzFruitDir(NaN,1,[[1,0]])", "mzFruitDir(1,1,[[-1,0]])", "mzFruitDir(Infinity,0,[[0,1]])"])
        self.assertEqual(r, [[0, -1], [0, -1], [1, 0], [-1, 0], [0, 1]])

    def test_no_candidates(self):
        r = dirs(["mzFruitDir(1,0,[])", "mzFruitDir(1,0,null)", "mzFruitDir(1,0,[[1,1],[2,0],[0,0]])", "mzFruitDir(1,0,'x')"])
        self.assertEqual(r, [[0, 0]] * 4)


class Tick(unittest.TestCase):
    def test_moves_one_cell_after_moveMs(self):
        r = run("""
          mzFruitReset(); mzFruit.sx = 1; mzFruit.sy = 1; mzFruit.left = 3;
          Object.assign(mzFruit, { cx: 6, cy: 6, px: 6, py: 6, mv: 1000 });
          mzFruitTick(500); const before = [mzFruit.cx, mzFruit.cy];
          mzFruitTick(1000000); const after = [mzFruit.cx, mzFruit.cy];
          return { before, after, mv: mzFruit.mv, mt: mzFruit.mt, p: [mzFruit.px, mzFruit.py], left: mzFruit.left };""")
        self.assertEqual(r["before"], [6, 6])
        self.assertEqual(abs(r["after"][0] - 6) + abs(r["after"][1] - 6), 1)  # 大きく時間が進んでも1マス
        self.assertEqual(r["mv"], 1000000 + 1800)
        self.assertEqual((r["mt"], r["p"], r["left"]), (1000000, [6, 6], 3))

    def test_not_into_player_cell(self):
        r = run("""
          mzFruitReset(); mzFruit.sx = 1; mzFruit.sy = 1;
          rp.x = 6.5 * MZ_K; rp.y = 6.5 * MZ_K;
          Object.assign(mzFruit, { cx: 7, cy: 6, mv: 0, dx: -1, dy: 0 });
          mzFruitTick(10); return [mzFruit.cx, mzFruit.cy];""")
        self.assertNotEqual(r, [6, 6])
        self.assertEqual(abs(r[0] - 7) + abs(r[1] - 6), 1)

    def test_pickup_beats_move(self):
        r = run("""
          mzFruitReset(); mzFruit.sx = 1; mzFruit.sy = 1;
          rp.x = 6.5 * MZ_K; rp.y = 6.5 * MZ_K;
          Object.assign(mzFruit, { cx: 6, cy: 6, mv: 0 });
          mzFruitTick(10); return { pts, left: mzFruit.left, cx: mzFruit.cx, px: mzFruit.px, mt: mzFruit.mt };""")
        self.assertEqual((r["pts"], r["left"], r["cx"], r["px"], r["mt"]), (10, 2, -1, -1, 0))

    def test_spawn_does_not_move_at_once(self):
        r = run("""
          mzFruitReset(); mzFruitTick(100);
          const s = [mzFruit.cx, mzFruit.cy, mzFruit.px, mzFruit.py, mzFruit.mt, mzFruit.mv, mzFruit.dx, mzFruit.dy];
          return s;""")
        self.assertGreaterEqual(r[0], 0)
        self.assertEqual(r[0:2], r[2:4])
        self.assertEqual((r[4], r[5], r[6], r[7]), (0, 1900, 0, 0))

    def test_reset_clears_move_fields(self):
        r = run("Object.assign(mzFruit, { dx: 1, mv: 5, px: 3, py: 3, mt: 9 }); mzFruitReset(); return [mzFruit.dx, mzFruit.dy, mzFruit.mv, mzFruit.px, mzFruit.py, mzFruit.mt];")
        self.assertEqual(r, [0, 0, 0, -1, -1, 0])


class Draw(unittest.TestCase):
    def test_slide(self):
        self.assertIn("mzFruit.px", DRAW)
        self.assertIn("mzFruit.mt", DRAW)
        self.assertIn("/ 350", DRAW)
        self.assertIn("Math.max(0, Math.min(1", DRAW)
        self.assertIn("mzOn((fx + 0.5) * MZ_K, (fy + 0.5) * MZ_K)", DRAW)

    def test_colors_kept(self):
        self.assertIn("#ff8c1a", DRAW)
        self.assertIn("#2f7d32", DRAW)
        self.assertNotIn("255,230,80", DRAW)


class Safety(unittest.TestCase):
    def test_no_forbidden_words(self):
        for l in ADDED:
            for w in ("ぼく", "だに", "約20%"):
                self.assertNotIn(w, l)

    def test_files_allowed(self):
        files = set(git("diff", "--name-only", "origin/main").split())
        self.assertTrue(all(f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/bingo.js", "nishio-go.html") for f in files), files)


if __name__ == "__main__":
    unittest.main()
