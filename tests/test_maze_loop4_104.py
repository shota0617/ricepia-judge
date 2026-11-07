import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


class TestFirstMinuteOtedama(unittest.TestCase):
    def test_first_gate(self):
        self.assertIn("if (!o.next) o.next = now;", PIX)
        self.assertNotIn("if (!o.next) o.next = now + 10000;", PIX)

    def test_header_note(self):
        self.assertIn("（はじめの とびはねから）", PIX)
        self.assertNotIn("（はじめは 10秒後）", PIX)

    def test_later_interval_unchanged(self):
        self.assertIn("o.next = now + 30000 + Math.random() * 20000;", PIX)

    def test_constants_unchanged(self):
        self.assertIn("OTEDAMA_MS = 1300", PIX)
        self.assertIn("o.prevH <= 0", PIX)
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
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_86.py", "tests/test_maze_loop4_104.py", "tests/test_maze_loop4_145.py"} | {"tests/test_maze_loop4_%d.py" % n for n in (95, 97, 98, 99, 100, 101, 102, 103, 105, 106, 107, 108)}
        self.assertLessEqual(files, allowed)


if __name__ == "__main__":
    unittest.main()
