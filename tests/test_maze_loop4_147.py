import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()
HTML = open(os.path.join(ROOT, "nishio-go.html"), encoding="utf-8").read()
CSS = open(os.path.join(ROOT, "nishio-go", "style.css"), encoding="utf-8").read()


def fn(src, name):
    i = src.index("function " + name + "(")
    j = src.index("\n}\n", i)
    return src[i:j + 3]


class TestF4(unittest.TestCase):
    def test_buttons_hidden_in_first_walk(self):
        f = fn(PIX, "firstWalkBtns")
        self.assertIn("const fw = firstWalk();", f)
        self.assertIn("'pxWorld'", f)
        self.assertIn("'pxMeiro'", f)
        self.assertIn("b.hidden = fw", f)
        self.assertIn("firstWalkBtns();", fn(PIX, "updatePad"))
        self.assertIn("firstWalkBtns();", fn(PIX, "mzHelpGoal"))
        self.assertIn("\nfirstWalkBtns();\n", PIX)
        self.assertIn("#pxMeiro[hidden]", CSS)

    def test_koyomi_gate(self):
        k = fn(GAME, "renderKoyomi")
        self.assertIn("if (demo && !(store.get('nsg_mzgoals', 0) >= 3)) { el.hidden = true; renderKoyomi.key = ''; return; }", k)

    def test_pts_hidden_at_zero(self):
        h = fn(GAME, "renderHeader")
        self.assertIn("ptsEl.hidden = !(S.points > 0)", h)
        self.assertIn(".pts[hidden]", CSS)
        self.assertRegex(HTML, r'<div class="pts" hidden')

    def test_guide_number_only(self):
        g = fn(GAME, "renderGuide")
        self.assertNotIn("🌀${fmtM", g)
        self.assertIn("const far = fmtM(mr ? mr.m : dist(me, g));", g)
        self.assertIn("${mr ? '🏁 ' : ''}", g)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        for l in added:
            self.assertIsNone(re.search("\u307c\u304f|\u3060\u306b|\u7d0420%", l), l)


if __name__ == "__main__":
    unittest.main()
