"""第4弾サイクル98：スタートの1分。未読込区画（C.X）を黒い穴ではなく淡い霧にする。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def lum(hexcol):
    r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


class UnreadFog98(unittest.TestCase):
    def test_constants(self):
        self.assertIn("const UNREAD_BG = '#c9d6c0';", PIX)
        self.assertIn("const UNREAD_DOT = '#aebfa5';", PIX)
        self.assertGreaterEqual(lum("#c9d6c0"), 180)
        self.assertGreaterEqual(lum("#aebfa5"), 150)

    def test_usage(self):
        self.assertIn("[C.X]: UNREAD_BG,", PIX)
        self.assertIn("[C.X]: (px, r, f) => { px(UNREAD_BG, 0, 0, 16, 16); px(UNREAD_DOT, (f * 8) % 16, 7, 2, 2); },", PIX)

    def test_old_dark_colors_gone(self):
        self.assertNotIn("#0d1418", PIX)
        self.assertNotIn("#1a252b", PIX)

    def test_block_and_physics_unchanged(self):
        self.assertRegex(PIX, r"BLOCK\s*=\s*new Set\(\[[^\]]*C\.X")
        self.assertIn("ROLL_MAX = 4.2", PIX)

    def test_public(self):
        self.assertIn("UNREAD_BG, UNREAD_DOT,", PIX)

    def _diff(self, *args):
        return subprocess.run(["git", "diff", "HEAD~1", "HEAD", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout

    def test_no_forbidden_in_added_lines(self):
        bad = ["\u307c\u304f", "\u3060\u306b", "\u7d0420%"]
        for line in self._diff("--", "nishio-go").splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                for b in bad:
                    self.assertNotIn(b, line)

    def test_scope(self):
        files = set(self._diff("--name-only").split())
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_101.py", "tests/test_maze_loop4_102.py", "tests/test_maze_loop4_103.py", "tests/test_maze_loop4_98.py", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_97.py", "tests/test_maze_loop4_99.py", "tests/test_maze_loop4_100.py", "tests/test_maze_loop4_16.py"})


if __name__ == "__main__":
    unittest.main()
