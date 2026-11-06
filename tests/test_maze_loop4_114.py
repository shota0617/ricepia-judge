"""サイクル114：はじめの1枚は窓を出さず、そのままもらう。"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8") as f:
    GAME = f.read()
FN = GAME[GAME.index("function pickFirst(cands, done, opt = {}) {"):]
FN = FN[:FN.index("const open = () => {")]


class TestFirstCardNoWindow(unittest.TestCase):
    def test_default_pick_skips_window(self):
        self.assertIn("if (!opt.title) { finishFirst(cands[0]); return; }", FN)

    def test_titled_pick_keeps_choice(self):
        self.assertIn("しるしの1枚を えらぼう", GAME)


if __name__ == "__main__":
    unittest.main()
