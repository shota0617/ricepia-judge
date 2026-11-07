"""第4弾サイクル151：類2 はじめての道のりを「まっすぐ転がれば着く」単純さに整える"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()


def node(js):
    a = PIX.index("const MZ_FIRST_SIMPLE")
    b = PIX.index("function mzRoute(now) {")
    code = "const MZ_K = 3, TILE_M = 8;\n" + PIX[a:b] + "\n" + js
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()


class TestShape(unittest.TestCase):
    def test_turns(self):
        out = node("const f=(p)=>mzPathShape(p,()=>false).turns;"
                   "console.log([f([[0,0],[1,0],[2,0],[3,0]]),f([[0,0],[1,0],[2,0],[2,1],[2,2]]),"
                   "f([[0,0],[1,0],[1,1],[2,1],[2,2],[3,2]])].join())")
        self.assertEqual(out, "0,1,4")

    def test_branches(self):
        out = node("const p=[[0,0],[1,0],[2,0],[3,0]];"
                   "const o=(x,y,dx,dy)=>(x===1&&dy===1)||(x===2&&dy===-1)||(x===2&&dy===1);"
                   "console.log(mzPathShape(p,o).branches+','+mzPathShape(p,()=>false).branches+','+mzPathShape(p,()=>false).cells)")
        self.assertEqual(out, "2,0,4")

    def test_simple_boundaries(self):
        out = node("const s=(t,b,c)=>mzFirstSimple({cells:c||10,turns:t,branches:b},0);"
                   "const r=(c,m)=>mzFirstSimple({cells:c,turns:0,branches:0},m);"
                   "console.log([s(5,4),s(6,4),s(5,5),r(19,24*18/1.9),r(19,24*18/1.91),r(19,0)].join())")
        self.assertEqual(out, "true,false,false,true,false,true")


class TestRoute(unittest.TestCase):
    def test_wiring(self):
        i = PIX.index("function mzRoute(now) {")
        body = PIX[i:PIX.index("\n}\n", i)]
        self.assertEqual(body.count("mzGoalsDone() < 1"), 1)
        self.assertIn("mzRt.simpleKey !== gkey", body)
        self.assertIn("mzRt.simpleKey = gkey;", body)
        self.assertIn("G.guideNoPath(g)", body)
        self.assertGreater(body.index("mzRt.simpleKey !== gkey"), body.index("if (key === mzRt.key"))

    def test_const_and_api(self):
        self.assertIn("const MZ_FIRST_SIMPLE = { turns: 5, branches: 4, ratio: 1.9 };", PIX)
        self.assertIn("firstRoute: { shape: mzPathShape, simple: mzFirstSimple, LIM: MZ_FIRST_SIMPLE }", PIX)

    def test_unchanged(self):
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
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
