"""第4弾サイクル152：類3 寄り道の「集まった」が迷路・歩く地図の本体画面でも絵と形で分かる"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()


def node(js):
    a = PIX.index("function collectedOf(")
    b = PIX.index("\n", a)
    code = PIX[a:b] + "\n" + js
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()


class TestCollectedOf(unittest.TestCase):
    def test_behavior(self):
        out = node("const v={a:1};console.log([collectedOf({id:'a'},v),collectedOf({id:'b'},v),"
                   "collectedOf({id:'a'},null),collectedOf({id:'a'},undefined),collectedOf(null,v)].join())")
        self.assertEqual(out, "true,false,false,false,false")


class TestWiring(unittest.TestCase):
    def test_loop(self):
        i = PIX.index("for (const s of spots) {\n    const p = toTile(s.lat, s.lng);\n    const near")
        body = PIX[i:PIX.index("if (s.featured && !cool && f)", i)]
        self.assertIn("collectedOf(s, G.state && G.state.visits)", body)
        self.assertIn("if (giant) collectedMarks.push([sx, sy, size, dpr]); else drawCollectedMark(sx, sy, size, dpr, !s.shop);", body)  # サイクル159で遅延描画へ
        self.assertGreater(body.index("collectedOf"), body.index("depthArt.push"))

    def test_mark_body(self):
        i = PIX.index("function drawCollectedMark(")
        body = PIX[i:PIX.index("\n}\n", i)]
        for w in ("#ffd54f", "✓", "rgba(255,213,79,.9)", "rgba(26,26,26,.75)", "size * 0.58", "size * 0.18"):
            self.assertIn(w, body)
        self.assertLess(body.index("rgba(255,213,79,.9)"), body.index("#ffd54f"))

    def test_only_three_uses(self):
        self.assertEqual(len(re.findall(r"collectedOf\b", PIX)), 3)  # 定義・描画ループ・テストAPIの3か所だけ
        self.assertIn("collected: { has: collectedOf }", PIX)

    def test_not_a_goal_condition(self):
        for name in ("function mzRoute(now) {", "function mazeGoal"):
            if name in PIX:
                i = PIX.index(name)
                self.assertNotIn("collectedOf", PIX[i:i + 6000])


class TestUnchanged(unittest.TestCase):
    def test_consts(self):
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
        self.assertIn("const GROW_TH = [15, 40, 80, 140, 210, 300, 420, 570, 760, 1000, 1300, 1700, 2200, 2800, 3600, 4600, 5900, 7600, 9800];", PIX)  # サイクル158（差2）で拡張
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
