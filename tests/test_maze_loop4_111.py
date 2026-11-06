"""サイクル111：自店の金色の輪は残し、点滅だけやめる。"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8") as f:
    PIX = f.read()
BLOCK = PIX[PIX.index("if (s.shop) {   // 自店は 地図の目印"):]
BLOCK = BLOCK[:BLOCK.index("\n    }")]


class TestShopRingStill(unittest.TestCase):
    def test_ring_stays(self):
        self.assertIn("rgba(255,213,79,.9)", BLOCK)
        self.assertIn("ctx.arc(rx, ry, rr, 0, Math.PI * 2)", BLOCK)

    def test_no_pulse(self):
        self.assertNotIn("Math.sin(now", BLOCK)
        self.assertNotIn("dirty = true", BLOCK)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
