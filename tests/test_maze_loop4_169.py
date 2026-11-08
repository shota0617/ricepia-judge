"""第4弾サイクル169：差13 せかいちずでも道の形が読める"""
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
CALL = "if (code !== C.D) drawRoadShape(X, Y, T, ri >> 1);"


def linked_body():
    i = PIX.index("function drawLinked(")
    return PIX[i:PIX.index("\n}\n", i)]


class TestLinked(unittest.TestCase):
    def test_two_calls(self):
        self.assertEqual(PIX.count(CALL), 2)
        self.assertEqual(linked_body().count(CALL), 1)

    def test_order(self):
        b = linked_body()
        road = b.index("ctx.drawImage(MT.road[ROAD_ROW[code]][ri]")
        call = b.index(CALL)
        kado = b.index("MT.kado")
        xr = b.index("of xr")
        rk = b.index("MT.rankan")
        self.assertTrue(road < call < kado < xr < rk)

    def test_shape_markers_intact(self):
        i = PIX.index("function drawRoadShape(")
        body = PIX[i:PIX.index("\n}\n", i)]
        for m in ("shape === 'straight'", "shape === 'end'", "shape === 'curve'", "'tee'", "ctx.clip();"):
            self.assertIn(m, body)

    def test_no_forbidden_words(self):
        d = subprocess.run(["git", "diff", "origin/main", "-U0", "--", "nishio-go/pixel.js"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertNotIn(w, added)

    def test_syntax(self):
        subprocess.run(["node", "--check", os.path.join(ROOT, "nishio-go", "pixel.js")], check=True)


class TestScope(unittest.TestCase):
    def test_files(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_169.py", "tests/test_maze_loop4_167.py", "tests/test_maze_loop4_168.py", "tests/test_maze_loop4_153.py", "tests/test_maze_loop4_160.py"}
        self.assertTrue(set(out) <= allowed, out)


if __name__ == "__main__":
    unittest.main()
