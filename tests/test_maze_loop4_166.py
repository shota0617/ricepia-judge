"""第4弾サイクル166：差10 ゴール到着の区切りに、着いた名所の大きな絵を出す"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def fn_src(name):
    i = PIX.index("function %s(" % name)
    return PIX[i:PIX.index("\n}\n", i) + 3]


class TestGoalArt(unittest.TestCase):
    def test_banner_gid_init(self):
        self.assertIn("mzBanner = { t0: 0, text: '', gid: '' }", PIX)

    def test_gid_saved_from_confirmed_goal(self):
        src = fn_src("mzGoalFx")
        self.assertIn("mzBanner.gid =", src)
        self.assertIn("mzGoalAsk", src)
        self.assertIn("mzGoalAsk.id = id;", PIX)

    def test_banner_art_api(self):
        self.assertIn("bannerArt: () => mzBanner.gid || ''", PIX)
        self.assertIn("goalFxSpec:", PIX)

    def test_draw_uses_gid_and_accessors(self):
        src = fn_src("drawMzFx")
        self.assertIn("mzBanner.gid", src)
        self.assertIn("giantOf(gs) || spriteOf(gs)", src)
        self.assertIn("ctx.drawImage(gi,", src)
        self.assertIn("S * 5", src)
        self.assertLess(src.index("ctx.drawImage(gi,"), src.index("ctx.globalAlpha = 1;"))
        self.assertIn("mzBanner.gid = ''", src)

    def test_goalask_cleared_on_goal_entry(self):
        # Codex指摘: 失敗した goal(id) で前の保留 id が残らないよう、入口で消す
        i = PIX.index("mzGoalAsk.id = '';")
        self.assertLess(i, PIX.index("mzGoalAsk.id = id;"))
        self.assertIn("if (gz > 0) ctx.drawImage(gi,", PIX)

    def test_goal_fx_constants_unchanged(self):
        self.assertIn("const MZ_GOAL_FX = { n: 24, bannerSec: 1.6, fadeSec: 0.4, lifeMin: 0.7, lifeVar: 0.4, vMin: 1.2, vVar: 2.4, up: 2.2, happyMs: 1600 };", PIX)

    def test_diff_scope_and_words(self):
        out = subprocess.run(["git", "diff", "HEAD", "--name-only"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_166.py"}
        self.assertTrue(set(out) <= allowed, out)
        diff = subprocess.run(["git", "diff", "HEAD", "-U0", "nishio-go/pixel.js"], cwd=ROOT, capture_output=True, text=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
