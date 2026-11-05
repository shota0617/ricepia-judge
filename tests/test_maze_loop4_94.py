"""第4弾サイクル94：最初の1分。主人公（かおりちゃん）を顔が読める大きさに拡大する。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


class Big94(unittest.TestCase):
    def test_const_range(self):
        m = re.search(r"const RICE_BIG\s*=\s*([\d.]+);", PIX)
        self.assertTrue(m)
        self.assertTrue(1.3 <= float(m.group(1)) <= 1.6)

    def test_walking_map_applies(self):
        self.assertIn("sz = sz0 * RICE_BIG, u = sz / 32", PIX)
        self.assertIn("ground = hcy + T * 0.4 - sz0 / 2 + 13.5 * sz0 / 32", PIX)

    def test_maze_applies(self):
        self.assertIn("hs * RICE_BIG / 32", PIX)

    def test_physics_unchanged(self):
        self.assertRegex(PIX, r"ROLL_MAX\s*=\s*4\.2\b")
        self.assertRegex(PIX, r"ROLL_ACC\s*=\s*7\b")
        self.assertRegex(PIX, r"RICE_R\s*=\s*0\.42\b")

    def test_no_forbidden_in_added_lines(self):
        bad = ["\u307c\u304f", "\u3060\u306b", "\u7d0420%"]
        diff = subprocess.run(["git", "diff", "HEAD~1", "HEAD", "--", "nishio-go", "nishio-go.html"], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout
        for line in diff.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                for b in bad:
                    self.assertNotIn(b, line)


if __name__ == "__main__":
    unittest.main()
