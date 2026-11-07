import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


class TestFirstMinuteMeetings(unittest.TestCase):
    def test_otomo_first(self):
        self.assertIn("otomo.next = now + 6000;", PIX)
        self.assertNotIn("otomo.next = now + 20000;", PIX)

    def test_deai_first(self):
        self.assertIn("deai.next = now + 10000;", PIX)
        self.assertNotIn("deai.next = now + 25000;", PIX)

    def test_later_intervals_unchanged(self):
        self.assertIn("otomo.next = now + 60000 + Math.random() * 40000;", PIX)
        self.assertIn("deai.next = now + 80000 + Math.random() * 60000;", PIX)
        self.assertIn("if (!o) otomo.next = now + 8000;", PIX)
        self.assertIn("if (!e) deai.next = now + 8000;", PIX)

    def test_constants_unchanged(self):
        self.assertIn("NAKAMA_FOLLOW = 6000", PIX)
        self.assertIn("NAKAMA_CD = 40000", PIX)
        self.assertIn("DEAI_STAY = 4200", PIX)
        self.assertIn("DEAI_GO = 600", PIX)
        self.assertIn("!sightBusy() && !nakama.n && now > riceBub.until + 2500", PIX)
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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_86.py", "tests/test_maze_loop4_105.py", "tests/test_maze_loop4_106.py", "tests/test_maze_loop4_102.py", "tests/test_maze_loop4_103.py", "tests/test_maze_loop4_104.py", "tests/test_maze_loop4_101.py", "tests/test_maze_loop4_100.py", "tests/test_maze_loop4_99.py", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_97.py", "tests/test_maze_loop4_98.py", "tests/test_maze_loop4_107.py", "tests/test_maze_loop4_108.py", "tests/test_maze_loop4_145.py", "nishio-go/game.js", "nishio-go.html", "tests/test_maze_loop4_146.py", "tests/test_maze_loop4_66.py", "tests/test_nishio_cycle126.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop4_86.py"})


if __name__ == "__main__":
    unittest.main()
