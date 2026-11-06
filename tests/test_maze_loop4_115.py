"""サイクル115：開いた直後の手本はアイコンだけ。"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8") as f:
    PIX = f.read()
with open(os.path.join(ROOT, "nishio-go", "style.css"), encoding="utf-8") as f:
    CSS = f.read()
FN = PIX[PIX.index("function tiltHintShow() {"):]
FN = FN[:FN.index("\nsetTimeout(tiltHintShow")]


class TestTiltHint(unittest.TestCase):
    def test_icon_only(self):
        self.assertIn("? '👆' : '📱'", FN)

    def test_does_not_block_input(self):
        self.assertRegex(CSS, r"#tiltHint\{[^}]*pointer-events:none")

    def test_goes_away(self):
        self.assertIn("tiltHintOff", FN)
        self.assertIn("deviceorientation", FN)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
