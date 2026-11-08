"""第4弾サイクル167：差11 行き止まりの印が形で分かる"""
import json
import os
import re
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


class TestClassify(unittest.TestCase):
    def test_all_16(self):
        out = json.loads(node("console.log(JSON.stringify(Array.from({length:16},(_,m)=>roadShapeOf(m))))"))
        for m in (1, 2, 4, 8):
            self.assertEqual(out[m], "end")
        self.assertEqual(out[0], "none")
        self.assertEqual([out[m] for m in (5, 10)], ["straight"] * 2)
        self.assertEqual([out[m] for m in (3, 6, 9, 12)], ["curve"] * 4)
        self.assertEqual([out[m] for m in (7, 11, 13, 14)], ["tee"] * 4)
        self.assertEqual(out[15], "cross")

    def test_end_dir(self):
        out = json.loads(node("console.log(JSON.stringify([1,2,4,8].map(roadShapeEndDir)))"))
        self.assertEqual(out, [[0, -1], [1, 0], [0, 1], [-1, 0]])

    def test_end_dir_null(self):
        out = json.loads(node("console.log(JSON.stringify([0,3,5,7,15,-1,16,1.5,'x',null,undefined].map(roadShapeEndDir)))"))
        self.assertTrue(all(v is None for v in out))


class TestDraw(unittest.TestCase):
    def test_end_branch(self):
        b = draw_body()
        e = b[b.index("shape === 'end'"):b.index("shape === 'curve'")]
        self.assertIn("ctx.clip();", e)
        self.assertIn("ctx.stroke();", e)
        self.assertNotIn("ctx.fill", e)
        self.assertIn("rgba(255,244,200,.45)", e)
        self.assertIn("T * 0.07", e)
        self.assertIn("T * 0.16", e)
        self.assertNotIn("T * 0.05", e)

    def test_others_unchanged(self):
        b = draw_body()
        self.assertIn("T * 0.28", b)
        self.assertIn("T * 0.22", b)
        self.assertIn("rgba(120,90,40,.35)", b)
        self.assertIn("shape === 'tee' ? roadShapeMissing(mask)", b)

    def test_api_and_call(self):
        self.assertIn("roadShape: { of: roadShapeOf, corner: roadShapeCorner, missing: roadShapeMissing, end: roadShapeEndDir, straight: roadShapeStraightDir }", PIX)
        self.assertIn("if (code !== C.D) drawRoadShape(X, Y, T, ri >> 1);", PIX)

    def test_no_forbidden_words(self):
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertNotIn(w, draw_body())


class TestScope(unittest.TestCase):
    def test_files(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_167.py", "tests/test_maze_loop4_168.py", "tests/test_maze_loop4_169.py", "tests/test_maze_loop4_153.py", "tests/test_maze_loop4_160.py"}
        self.assertTrue(set(out) <= allowed, out)


if __name__ == "__main__":
    unittest.main()
