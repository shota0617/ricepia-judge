"""第4弾サイクル159：差3 特大絵の「集まった」印が奥行き再描画で隠れない"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def node(js):
    a = PIX.index("function collectedOf(")
    b = PIX.index("\n", a)
    return subprocess.run(["node", "-e", PIX[a:b] + "\n" + js], capture_output=True, text=True, check=True).stdout.strip()


class TestDeferredMarks(unittest.TestCase):
    def test_declared_and_reset(self):
        self.assertIn("const collectedMarks = [];", PIX)
        self.assertIn("  depthArt.length = 0;\n  collectedMarks.length = 0;\n", PIX)

    def test_spot_loop(self):
        i = PIX.index("collectedOf(s, G.state && G.state.visits)) {")
        line = PIX[i:PIX.index("\n", i)]
        self.assertIn("if (giant) collectedMarks.push([sx, sy, size, dpr]);", line)
        self.assertIn("else drawCollectedMark(sx, sy, size, dpr, !s.shop);", line)
        self.assertGreater(i, PIX.index("depthArt.push([spr[0]"))

    def test_flush_order(self):
        f = PIX.index("for (const [mx, my, msize, mdpr] of collectedMarks) drawCollectedMark(mx, my, msize, mdpr, false);")
        self.assertGreater(f, PIX.index("occludeRice(hx, by, hcy"))
        self.assertLess(f, PIX.index("if (!rec) drawNight(w, h, ox, oy"))

    def test_mark_body_unchanged(self):
        i = PIX.index("function drawCollectedMark(")
        body = PIX[i:PIX.index("\n}\n", i)]
        for w in ("#ffd54f", "✓", "rgba(255,213,79,.9)", "rgba(26,26,26,.75)", "size * 0.58", "size * 0.18"):
            self.assertIn(w, body)

    def test_collected_of(self):
        out = node("const v={a:1};console.log([collectedOf({id:'a'},v),collectedOf({id:'b'},v),collectedOf({id:'a'},null),collectedOf(null,v)].join())")
        self.assertEqual(out, "true,false,false,false")


class TestUnchanged(unittest.TestCase):
    def test_consts(self):
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
        self.assertIn("const GROW_TH = [15, 40, 80, 140, 210, 300, 420, 570, 760];", PIX)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        pat = "|".join(["ぼ" + "く", "だ" + "に", "約" + "20%"])
        for l in d.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                self.assertIsNone(re.search(pat, l[1:]), l)


if __name__ == "__main__":
    unittest.main()
