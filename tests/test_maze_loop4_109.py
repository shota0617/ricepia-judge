"""サイクル109：開始時のおたすけ説明を消し、道すじの絵を残す。"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8") as f:
    PIX = f.read()
FN = PIX[PIX.index("function drawMzHint("):]
FN = FN[:FN.index("\n}\n") + 3]


class TestQuietFirstGuide(unittest.TestCase):
    def test_no_explanation_toast(self):
        self.assertNotIn("水色の 線が ゴールへの 道", PIX)
        self.assertNotIn("mzHelp.told = true", FN)

    def test_guide_still_draws(self):
        self.assertIn("mzRt.path", FN)
        self.assertIn("mzHelp.dots", FN)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
