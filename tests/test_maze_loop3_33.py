"""第3弾サイクル33：駅印（駅メモ！）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Station(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_sequence_counted_before_offscreen_skip(self):
        t = body("drawMzTrail")
        self.assertIn("seq++;", t)
        self.assertLess(t.index("seq++;"), t.index("if (cx < c0"))

    def test_every_tenth(self):
        t = body("drawMzTrail")
        self.assertIn("seq % 10 === 0", t)
        self.assertIn("'220,70,60'", t)
        self.assertIn("mzZoneTint(ar).rgb", t)

    def test_drawn_after_flowers(self):
        t = body("drawMzTrail")
        self.assertLess(t.index("for (const [X, Y, rgb, scale, full] of flowers)"), t.index("of stations"))
        self.assertIn("Math.max(4, T * 0.38)", t)
        self.assertIn("Math.max(2, T * 0.12)", t)
        self.assertIn("sr * 0.38", t)
        self.assertIn("'#fff'", t)

    def test_deterministic_no_state_text(self):
        t = body("drawMzTrail")
        for bad in ("Math.random", "Date.now", "G.", "fillText", "floatText"):
            self.assertNotIn(bad, t)

    def test_order_unchanged(self):
        line = next(l for l in PIXEL.splitlines() if "if (mazeOn()) {" in l and "drawMzFogVeil(" in l)
        self.assertLess(line.index("drawMzTrail("), line.index("drawMzFogVeil("))


if __name__ == "__main__":
    unittest.main()
