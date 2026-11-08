"""第4弾サイクル165：差9 道のりの真ん中に中間の門（mzHalf）"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def fn_src(name):
    i = PIX.index("function %s(" % name)
    return PIX[i:PIX.index("\n}\n", i) + 3]


def half(vals):
    src = fn_src("mzHalfCell")
    script = ("const MZ_HALF_MIN=12;" + src +
              "console.log(JSON.stringify(%s.map(v=>mzHalfCell(v))));" % json.dumps(vals))
    return json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)


def path(n):  # n 歩（n+1 マス）
    return [[i, 100 + i] for i in range(n + 1)]


class TestHalfCell(unittest.TestCase):
    def test_min(self):
        self.assertIn("const MZ_HALF_MIN = 12;", PIX)

    def test_boundaries(self):
        r = half([path(11), path(12), path(13), path(20)])
        self.assertIsNone(r[0])
        self.assertEqual(r[1], [6, 106])
        self.assertEqual(r[2], [6, 106])
        self.assertEqual(r[3], [10, 110])

    def test_invalid(self):
        r = half([None, "abc", 5, {}, [["a", 1]] * 13, [[1]] * 13, [None] * 13])
        self.assertEqual(r, [None] * 7)


class TestState(unittest.TestCase):
    def test_reset_on_goal_change(self):
        i = PIX.index("if (gkey !== mzRt.gkey) {")
        blk = PIX[i:PIX.index("mzNext.name = g.name", i)]
        self.assertIn("mzHalfReset();", blk)
        self.assertIn("mzHalf.gkey = ''", fn_src("mzHalfReset"))

    def test_fixed_once(self):
        self.assertIn("if (mzHalf.gkey !== gkey) {", PIX)
        self.assertIn("mzHalf.cell = mzHalfCell(mzRt.path)", PIX)
        self.assertEqual(PIX.count("mzHalf.cell = mzHalfCell("), 1)

    def test_pass_condition(self):
        s = fn_src("mzHalfCheck")
        self.assertIn("mzHalfPassed(mzHalf.cell, cur, mzHalf.prev)", s)
        self.assertIn("mzHalf.at = now", s)
        self.assertNotIn("mzRt.path.length", s)

    def test_passed_cases(self):
        src = fn_src("mzHalfPassed")
        script = (src + "const f=mzHalfPassed;"
                  "const cell=[6,6];"
                  "console.log(JSON.stringify(["
                  "f(cell,[6,6],[5,6]),"
                  "f(cell,[5,6],[4,6]),"
                  "f(cell,[6,5],[5,6]),"
                  "f(cell,[6,7],[5,6]),"
                  "f(cell,[7,6],[5,5]),"
                  "f(cell,[10,6],[0,6]),"
                  "f(null,[6,6],null),"
                  "f(cell,null,null)"
                  "]));")
        r = json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(r, [True, False, True, True, False, False, False, False])

    def test_dir_incoming_only(self):
        i = PIX.index("mzHalf.cell = mzHalfCell(mzRt.path)")
        blk = PIX[i:i + 600]
        self.assertIn("mzRt.path[i - 1]", blk)
        self.assertNotIn("mzRt.path[i + 1]", blk)

    def test_gate_try_refixes_half(self):
        self.assertIn("if (mzHalf.gkey === gkey && !mzHalf.passed) { mzHalf.gkey = ''; mzHalf.cell = null;", PIX)

    def test_check_called_before_early_return(self):
        a = PIX.index("  mzHalfCheck(now);\n  if (key === mzRt.key")
        self.assertGreater(a, 0)


class TestDraw(unittest.TestCase):
    def test_called_before_fog(self):
        line = [l for l in PIX.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzGates(" in l][0]
        self.assertIn("drawMzHalf(ox, oy, T, now)", line)
        self.assertLess(line.index("drawMzHalf("), line.index("drawMzFogVeil("))

    def test_colors(self):
        s = fn_src("drawMzHalf")
        self.assertIn("used ? '#ffd24a' : '#fff8e6'", s)
        self.assertIn("used ? '#ffe066' : '#fff8e6'", s)
        self.assertIn("800", s)
        self.assertNotIn("Math.sin", s)

    def test_api(self):
        self.assertIn("half: () => ({ cell: mzHalf.cell ? [...mzHalf.cell] : null, passed: !!mzHalf.passed })", PIX)
        self.assertIn("halfCell: mzHalfCell, halfPassed: mzHalfPassed, HALF_MIN: MZ_HALF_MIN", PIX)
        self.assertIn("goalFxSpec:", PIX)


class TestScope(unittest.TestCase):
    def test_diff(self):
        base = subprocess.run(["git", "diff", "--name-only", "HEAD~1", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        if base and set(base) <= {"nishio-go/pixel.js", "tests/test_maze_loop4_165.py"}:
            return
        st = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        files = {l[3:] for l in st.splitlines()}
        self.assertTrue(files <= {"nishio-go/pixel.js", "tests/test_maze_loop4_165.py"}, files)

    def test_forbidden_words(self):
        added = subprocess.run(["git", "diff", "HEAD", "--", "nishio-go/pixel.js"], cwd=ROOT, capture_output=True, text=True).stdout
        for l in added.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
                    self.assertNotIn(w, l)


if __name__ == "__main__":
    unittest.main()
