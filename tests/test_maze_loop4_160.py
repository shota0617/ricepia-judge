"""第4弾サイクル160：差4 T字路の印が、つながっていない向きを伝える"""
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


class TestRoadShapeMissing(unittest.TestCase):
    def test_tee_four(self):
        out = json.loads(node("console.log(JSON.stringify([14,13,11,7].map(roadShapeMissing)))"))
        self.assertEqual(out, [[0, -1], [1, 0], [0, 1], [-1, 0]])

    def test_others_null(self):
        out = json.loads(node("console.log(JSON.stringify([15,5,10,3,6,12,9,1,2,4,8,0,-1,16,1.5,'x',null,undefined].map(roadShapeMissing)))"))
        self.assertTrue(all(v is None for v in out))

    def test_table_all_16(self):
        out = json.loads(node("console.log(JSON.stringify(Array.from({length:16},(_,m)=>[m,roadShapeOf(m),roadShapeMissing(m)])))"))
        self.assertEqual(len(out), 16)
        for m, shape, miss in out:
            self.assertEqual(miss is not None, shape == "tee")
        print("\n".join(map(str, out)))

    def test_of_corner_unchanged(self):
        self.assertIn("roadShape: { of: roadShapeOf, corner: roadShapeCorner, missing: roadShapeMissing }", PIX)
        out = json.loads(node("console.log(JSON.stringify([15,7,5,3,0].map(roadShapeOf)))"))
        self.assertEqual(out, ["cross", "tee", "straight", "curve", "none"])


class TestDraw(unittest.TestCase):
    def test_tee_uses_missing_with_clip(self):
        b = draw_body()
        self.assertIn("shape === 'tee' ? roadShapeMissing(mask)", b)
        self.assertIn("ctx.rect(X, Y, T, T); ctx.clip();", b[b.index("const miss"):])

    def test_cross_has_no_closing_line(self):
        b = draw_body()
        self.assertNotIn("'cross' ? roadShapeMissing", b)
        self.assertIsNone(__import__("re").search(r"shape === 'cross'.*roadShapeMissing", b))

    def test_no_forbidden_words(self):
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertNotIn(w, draw_body())


if __name__ == "__main__":
    unittest.main()
