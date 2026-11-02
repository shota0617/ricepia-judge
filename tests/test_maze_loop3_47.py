"""第3弾サイクル47：おとも旅団が かおりちゃんの 通った 道を 行列で ついてくる。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


class Hist(unittest.TestCase):
    def test_hist_and_reset(self):
        self.assertIn("count: 0, doneAt: 0, hist: [] };", PIXEL)
        self.assertIn("function mzBrigadeReset() { Object.assign(mzBrigade, { cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, count: 0, doneAt: 0, hist: [] }); }", PIXEL)

    def test_update_before_early_returns(self):
        b = func_body("function mzBrigadeTick(")
        u = b.index("mzBrigade.hist.unshift")
        self.assertGreater(u, b.index("mzBrigade.sx = a"))
        self.assertLess(u, b.index("mzBrigade.count >= MZ_BRIGADE.n) return"))
        self.assertLess(u, b.index("if (now < mzBrigade.next) return"))

    def test_update_shape(self):
        b = func_body("function mzBrigadeTick(")
        self.assertIn("h0[0] !== a || h0[1] !== b", b)
        self.assertIn("mzBrigade.hist.unshift([a, b])", b)
        self.assertIn("mzBrigade.hist.length > 6", b)
        self.assertIn("mzBrigade.hist.length = 6", b)

    def test_separate_from_rescue(self):
        self.assertNotIn("mzRescue.hist", "\n".join(l for l in git("diff", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and "const h = mzRescue.hist[1]" not in l))   # サイクル49の 読むだけの 描画は 除く


class Draw(unittest.TestCase):
    def test_follow_and_fallback(self):
        b = func_body("function drawMzBrigadeMates(")
        self.assertIn("mzBrigade.hist[i + 1]", b)
        self.assertIn("mzOn((c[0] + 0.5) * MZ_K, (c[1] + 0.5) * MZ_K)", b)
        self.assertIn("slots[i][0] * u", b)
        self.assertIn("const slots = [[-1.35, 0.55], [0, 1.45], [1.0, 1.3]];", b)
        self.assertIn("Math.sin(now / 320 + i * 2.1) * q", b)

    def test_order_unchanged(self):
        self.assertIn("drawMzTorchFlame(ox, oy, T, now); drawMzBrigadeMates(ox, oy, T, now);", PIXEL)

    def test_state_trail(self):
        self.assertIn("trail: mzBrigade.hist.map(c => c.slice())", func_body("function mzBrigadeState("))


class Unchanged(unittest.TestCase):
    def test_points(self):
        self.assertIn("mzBrigade.count++; mzBrigade.last = [a, b];", PIXEL)
        self.assertIn("const fin = mzBrigade.count + 1 >= MZ_BRIGADE.n, r = G.mzBrigade && G.mzBrigade(fin);", PIXEL)
        self.assertIn("mzBrigade", GAME)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("fillText", "floatText", "riceSay", "localStorage", "G.", "ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        out = git("diff", "--name-only", "origin/main").split()
        self.assertTrue(set(out) <= {"nishio-go/pixel.js", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_48.py", "tests/test_maze_loop3_49.py", "tests/test_maze_loop3_50.py", "tests/test_maze_loop3_51.py", "tests/test_maze_loop3_52.py", "tests/test_maze_loop3_53.py", "tests/test_maze_loop3_54.py", "tests/test_maze_loop3_55.py", "tests/test_maze_loop3_56.py", "tests/test_maze_loop3_57.py", "tests/test_maze_loop3_58.py", "tests/test_maze_loop3_59.py", "tests/test_maze_loop3_60.py", "tests/test_maze_loop3_61.py", "tests/test_maze_loop3_62.py", "tests/test_maze_loop3_35.py", "tests/test_maze_fog.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_33.py", "tests/test_maze_loop3_34.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_46.py"}, out)


if __name__ == "__main__":
    unittest.main()
