"""第4弾サイクル168：差12 一本道にも流れの印"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def node(js):
    a = PIX.index("function roadShapeOf(")
    b = PIX.index("function drawRoadShape(")
    return subprocess.run(["node", "-e", PIX[a:b] + "\n" + js], capture_output=True, text=True, check=True).stdout.strip()


def draw_body():
    i = PIX.index("function drawRoadShape(")
    return PIX[i:PIX.index("\n}\n", i)]


class TestDir(unittest.TestCase):
    def test_table(self):
        out = json.loads(node("console.log(JSON.stringify([10,5].map(roadShapeStraightDir)))"))
        self.assertEqual(out, [[1, 0], [0, 1]])

    def test_null(self):
        out = json.loads(node("console.log(JSON.stringify([0,1,2,3,4,6,7,8,9,11,12,13,14,15,-1,16,1.5,'x',null,undefined].map(roadShapeStraightDir)))"))
        self.assertTrue(all(v is None for v in out))


class TestDraw(unittest.TestCase):
    def test_straight_branch(self):
        b = draw_body()
        self.assertNotIn("shape === 'straight') return", b)
        s = b[b.index("shape === 'straight'"):b.index("shape === 'end'")]
        self.assertIn("ctx.clip();", s)
        self.assertEqual(s.count("ctx.fillRect"), 2)
        self.assertIn("T * 0.44", s)
        self.assertIn("T * 0.07", s)
        self.assertNotIn("ctx.arc", s)
        self.assertNotIn("ctx.stroke", s)
        self.assertIn("roadShapeStraightDir(mask)", s)
        self.assertIn("rgba(255,244,200,.45)", b)

    def test_others_unchanged(self):
        b = draw_body()
        for k in ("T * 0.28", "T * 0.22", "T * 0.16", "rgba(120,90,40,.35)", "shape === 'tee' ? roadShapeMissing(mask)"):
            self.assertIn(k, b)

    def test_api_and_call(self):
        self.assertIn("end: roadShapeEndDir, straight: roadShapeStraightDir }", PIX)
        for k in ("of: roadShapeOf", "corner: roadShapeCorner", "missing: roadShapeMissing"):
            self.assertIn(k, PIX)
        self.assertIn("if (code !== C.D) drawRoadShape(X, Y, T, ri >> 1);", PIX)

    def test_no_forbidden_words(self):
        added = subprocess.run(["git", "diff", "origin/main", "-U0", "--", "nishio-go/pixel.js"], cwd=ROOT, capture_output=True, text=True).stdout
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertNotIn(w, "\n".join(l for l in added.splitlines() if l.startswith("+")))


class TestScope(unittest.TestCase):
    def test_files(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_168.py", "tests/test_maze_loop4_167.py", "tests/test_maze_loop4_153.py", "tests/test_maze_loop4_160.py"}
        self.assertTrue(set(out) <= allowed, out)


if __name__ == "__main__":
    unittest.main()
