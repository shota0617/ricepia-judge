"""サイクル115：開いた直後の手本はアイコンだけ。→ サイクル194（運営者の声 2026-11-10）で、止まって 2秒の たびに 出る 指の 手本と 傾きの ボタンに かわった（くわしくは test_maze_loop4_194.py）。
ここでは 115 の ねらいの うち いまも のこる もの（手本は 絵だけ・入力を じゃましない・さわると 消える・転がりは かえない）を 見る。"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8") as f:
    PIX = f.read()
with open(os.path.join(ROOT, "nishio-go", "style.css"), encoding="utf-8") as f:
    CSS = f.read()
FN = PIX[PIX.index("function tapDemoTick() {"):]
FN = FN[:FN.index("\nsetInterval(tapDemoTick")]


class TestTiltHint(unittest.TestCase):
    def test_icon_only(self):
        self.assertIn("tapDemo.el = mk('tapDemo', '👆'); tapDemo.ph = mk('tiltHint', '📱');", FN)

    def test_does_not_block_input(self):
        self.assertRegex(CSS, r"#tiltHint\{[^}]*pointer-events:none")
        self.assertRegex(CSS, r"#tapDemo\{[^}]*pointer-events:none")

    def test_goes_away(self):
        self.assertIn("tapDemoHide", FN)
        # サイクル206：傾けて お米が 動いたら 消える（0.25秒の 見回りで 0.05マスより 動いた とき）。センサーの 値 そのもの では 消さない
        # （持ち方が 1.2度 ずれて いる だけ・手が ふるえて いる だけで、止まって いるのに 手本が 出なかった）
        self.assertIn("if (moved) { tapDemo.at = now;", FN)
        self.assertIn("if (!ok) { tapDemoHide(); return; }", FN)
        self.assertNotIn("deviceorientation", FN)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
