"""第4弾サイクル153：類4 実在の道の形（曲がり角・交差点）をコースの個性として淡い印で読み取れる"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()


def block(name):
    a = PIX.index("function %s(" % name)
    return PIX[a:PIX.index("\n}\n", a) + 3]


def node(js):
    code = block("roadShapeOf") + "\n" + block("roadShapeCorner") + "\n" + js
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()


class TestRoadShape(unittest.TestCase):
    def test_of(self):
        out = node("console.log([0,1,5,10,3,6,12,9,7,11,13,14,15].map(roadShapeOf).join())")
        self.assertEqual(out, "none,end,straight,straight,curve,curve,curve,curve,tee,tee,tee,tee,cross")

    def test_corner(self):
        out = node("console.log(JSON.stringify([3,6,12,9,5,15].map(roadShapeCorner)))")
        self.assertEqual(out, "[[1,-1],[1,1],[-1,1],[-1,-1],null,null]")


class TestWiring(unittest.TestCase):
    def test_drawtile(self):
        i = PIX.index("else if (MT.road && ROAD_ROW[code] !== undefined)")
        body = PIX[i:PIX.index("\n  }\n", i)]
        call = "if (code !== C.D) drawRoadShape(X, Y, T, ri >> 1);"
        self.assertIn(call, body)
        self.assertGreater(body.index(call), body.index("ctx.drawImage(MT.road[ROAD_ROW[code]][ri]"))
        self.assertLess(body.index(call), body.index("for (const i of kado)"))

    def test_body(self):
        b = block("drawRoadShape")
        self.assertIn("rgba(255,244,200,.45)", b)
        self.assertIn("rgba(120,90,40,.35)", b)

    def test_only_three_uses(self):
        # サイクル160（差4）で roadShapeMissing が roadShapeOf を1回使うため 4 に更新（他の用途は不変）
        self.assertEqual(len(re.findall(r"roadShapeOf\b", PIX)), 6)
        self.assertEqual(len(re.findall(r"roadShapeCorner\b", PIX)), 3)
        self.assertIn("roadShape: { of: roadShapeOf, corner: roadShapeCorner, missing: roadShapeMissing, end: roadShapeEndDir, straight: roadShapeStraightDir },", PIX)


class TestUnchanged(unittest.TestCase):
    def test_consts(self):
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
        self.assertIn("const GROW_TH = [15, 40, 80, 140, 210, 300, 420, 570, 760, 1000, 1300, 1700, 2200, 2800, 3600, 4600, 5900, 7600, 9800, 12700, 16500, 21400, 27800, 36100, 46900, 60900, 79100, 102800, 133600, 173600, 225600];", PIX)  # サイクル158（差2）で拡張
        self.assertIn("const MZ_FIRST_SIMPLE = { turns: 5, branches: 4, ratio: 1.9 };", PIX)
        self.assertIn("const FIRST_MIN = 120, FIRST_MAX = 200;", GAME)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        pat = "|".join(["ぼ" + "く", "だ" + "に", "約" + "20%"])
        for l in d.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                self.assertIsNone(re.search(pat, l[1:]), l)


if __name__ == "__main__":
    unittest.main()
