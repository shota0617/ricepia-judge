"""第3弾サイクル48：浄化した数だけ 金の花びらが かおりちゃんの 周りの輪に 増える。"""
import re
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


BODY = func_body("function drawMzPurifyPetals(")


class Call(unittest.TestCase):
    def test_defined_and_order(self):
        self.assertIn("function drawMzPurifyPetals(ox, oy, T, now) {", PIXEL)
        line = next(l for l in PIXEL.splitlines() if "drawMzQuestCarry(ox, oy, T, now);" in l and "drawMzFogVeil" in l)
        v, q, p, r = (line.index(k) for k in ("drawMzFogVeil(", "drawMzQuestCarry(", "drawMzPurifyPetals(", "drawMzRescueMate("))
        self.assertTrue(v < q < p < r)
        self.assertEqual(PIXEL.count("drawMzPurifyPetals(ox, oy, T, now);"), 1)

    def test_guards(self):
        self.assertIn("mzPurify.count <= 0", BODY)
        self.assertIn("rp.x === null", BODY)
        self.assertIn("!total", BODY)
        self.assertIn("const total = mzPurify.cells.length", BODY)


class Draw(unittest.TestCase):
    def test_angle_and_count(self):
        self.assertIn("-Math.PI / 2 + i * (Math.PI * 2 / total)", BODY)
        self.assertIn("i < n", BODY)
        self.assertIn("Math.min(mzPurify.count, total)", BODY)
        self.assertIn("const on = mzOn(rp.x, rp.y)", BODY)
        self.assertIn("R = T * 0.8", BODY)

    def test_colors_and_size(self):
        self.assertIn("'#ffd24a'", BODY)
        self.assertIn("'#fff2a8'", BODY)
        self.assertIn("fillRect", BODY)
        self.assertIn("T * 0.32", BODY)

    def test_sway_whole_ring(self):
        self.assertIn("calmMotion ? 0", BODY)
        self.assertEqual(len(re.findall(r"Math\.sin\(now", BODY)), 1)
        self.assertNotIn("Math.sin(now / 380 + i", BODY)

    def test_outer_ring_only_when_done(self):
        i = BODY.index("mzPurify.count >= total")
        self.assertIn("arc(", BODY[i:])
        self.assertEqual(BODY.count("arc("), 1)
        self.assertGreater(BODY.index("arc("), i)


class Pure(unittest.TestCase):
    def test_no_state_or_text(self):
        for w in ("G.", "floatText", "riceSay", "fillText", "localStorage", "dirty", "grainSound", "mzFx.push", "pts"):
            self.assertNotIn(w, BODY)
        self.assertIsNone(re.search(r"\bmzPurify\.\w+\s*(\+\+|[-+]?=(?!=))", BODY))
        self.assertIsNone(re.search(r"\bmzPurify\.\w+\s*[-+]?=[^=]", BODY))


class Unchanged(unittest.TestCase):
    def test_purify_rules(self):
        self.assertIn("const MZ_PURIFY = { n: 8, pts: 5, bonus: 20, min: 6, reach: 40, tagMs: 6000 };", PIXEL)
        self.assertIn("const mzPurify = { cells: [], done: [], sx: -1, sy: -1, count: 0, next: 0, doneAt: 0 };", PIXEL)
        self.assertIn("r = G.mzPurify && G.mzPurify(fin);", PIXEL)
        self.assertIn("mzPurify", GAME)
        self.assertIn("purify: () => mzPurifyState()", PIXEL)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        out = git("diff", "--name-only", "origin/main").split()
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop3_48.py", "tests/test_maze_loop3_49.py", "tests/test_maze_loop3_50.py", "tests/test_maze_loop3_51.py", "tests/test_maze_loop3_52.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_46.py"}
        self.assertTrue(set(out) <= allowed, out)


if __name__ == "__main__":
    unittest.main()
