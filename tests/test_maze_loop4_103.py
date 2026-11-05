import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


class TestFirstMinuteGochiso(unittest.TestCase):
    def test_first_gate(self):
        self.assertIn("if (!g.next) g.next = now + 2000;", PIX)
        self.assertNotIn("if (!g.next) g.next = now + 30000;", PIX)

    def test_header_note(self):
        self.assertIn("（はじめは 止まって 約3秒で）", PIX)
        self.assertNotIn("（はじめは 30秒後）", PIX)

    def test_later_interval_unchanged(self):
        self.assertIn("now + 150000 + Math.random() * 90000", PIX)

    def test_constants_unchanged(self):
        self.assertIn("GOCHISO_MS = 6500", PIX)
        self.assertIn("roll.idle < 1 || roll.idle > 5", PIX)
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("RICE_BIG = 1.45", PIX)

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
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_103.py"} | {"tests/test_maze_loop4_%d.py" % n for n in (95, 97, 98, 99, 100, 101, 102, 104, 105, 106)}
        self.assertLessEqual(files, allowed)


if __name__ == "__main__":
    unittest.main()
