"""第3弾サイクル45：手描きマップの 印が ふえる（たいまつ・おとも・浄化・迷子のお米）。"""
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


class Marks(unittest.TestCase):
    def setUp(self):
        self.b = func_body("function mzMiniMarks(")

    def test_torch_brigade_rescue(self):
        self.assertIn("if (mzTorch.cx >= 0) out.push([mzTorch.cx, mzTorch.cy, '#ff7a2e'])", self.b)
        self.assertIn("if (mzBrigade.cx >= 0) out.push([mzBrigade.cx, mzBrigade.cy, '#f29ac0'])", self.b)
        self.assertIn("mzRescue.cx >= 0 && !mzRescue.joined) out.push([mzRescue.cx, mzRescue.cy, '#4a90e2'])", self.b)

    def test_purify_unpurified_purple_only(self):
        self.assertIn("mzPurify.cells.forEach", self.b)
        self.assertIn("if (!mzPurify.done[i]) out.push([c[0], c[1], '#c58ae8'])", self.b)
        self.assertNotIn("'#ffd24a'", self.b)

    def test_purify_done_mark_removed(self):
        t = func_body("function mzMiniTick(")
        self.assertIn("mzMini.seen.delete(mzPurify.cells[i][0] + ',' + mzPurify.cells[i][1])", t)
        self.assertIn("mzPurify.done[i]", t)

    def test_cache_three_steps_kept(self):
        self.assertIn("mzCache.dist >= 0 && mzCache.dist <= MZ_CACHE.show", self.b)

    def test_added_code_read_only(self):
        add = self.b[self.b.index("if (mzTorch.cx"):]
        self.assertNotRegex(add, r"mz\w+\.\w+\s*(=[^=>]|\+\+|--|\+=)")
        for w in ("G.", "floatText", "fillText", "localStorage"):
            self.assertNotIn(w, add)


class Reveal(unittest.TestCase):
    def test_uses_marks_only(self):
        r = func_body("function mzCubeReveal(")
        self.assertIn("mzMiniMarks()", r)
        self.assertNotIn(".concat(", r)
        self.assertNotIn("const ex", r)
        for k in ("mzTorch", "mzBrigade", "mzPurify", "mzRescue"):
            self.assertNotIn(k, r)


class Gate(unittest.TestCase):
    def test_sight_gate_unchanged(self):
        t = func_body("function mzMiniTick(")
        self.assertIn("f.sight + mzTorchBonus() : 9", t)
        self.assertIn("Math.hypot(cx + 0.5 - me[0], cy + 0.5 - me[1]) <= sight", t)
        self.assertIn("mzMiniMarks()", t)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotIn("fillText", txt)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        out = git("diff", "--name-only", "origin/main").split()
        self.assertTrue(set(f for f in out if not f.startswith("tests/")) <= {"nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go.html", "tests/test_maze_loop4_1.py", "tests/test_maze_loop4_3.py", "tests/test_maze_loop4_6.py", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_48.py", "tests/test_maze_loop3_49.py", "tests/test_maze_loop3_50.py", "tests/test_maze_loop3_51.py", "tests/test_maze_loop3_52.py", "tests/test_maze_loop3_53.py", "tests/test_maze_loop3_54.py", "tests/test_maze_loop3_55.py", "tests/test_maze_loop3_56.py", "tests/test_maze_loop3_57.py", "tests/test_maze_loop3_58.py", "tests/test_maze_loop3_59.py", "tests/test_maze_loop3_60.py", "tests/test_maze_loop3_61.py", "tests/test_maze_loop3_62.py", "tests/test_maze_loop3_63.py", "tests/test_maze_loop3_64.py", "tests/test_maze_loop3_65.py", "tests/test_maze_loop3_66.py", "tests/test_maze_loop3_67.py", "tests/test_maze_loop3_68.py", "tests/test_maze_loop3_35.py", "tests/test_maze_fog.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_33.py", "tests/test_maze_loop3_34.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_46.py", "tests/test_maze_loop3_12.py", "tests/test_maze_loop3_13.py", "tests/test_maze_loop3_14.py", "tests/test_maze_loop3_15.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_17.py"}, out)


if __name__ == "__main__":
    unittest.main()
