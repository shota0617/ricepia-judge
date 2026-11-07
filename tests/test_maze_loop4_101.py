import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


class TestFirstMinuteAmbient(unittest.TestCase):
    def test_def(self):
        self.assertIn("const ambFirstRetry = (now, met) => !met && Number.isFinite(now) && now - AMB_BOOT < AMB_FIRST_MS;", PIX)
        self.assertIn("AMB_FIRST_MS = 60000", PIX)
        self.assertIn("const AMB_BOOT = performance.now()", PIX)

    def test_boundaries(self):
        f = lambda boot, now, met: (not met) and now - boot < 60000
        for now in (0, 30000, 59999, 120000, 60000):
            self.assertFalse(f(0, now, True))
        for now in (0, 30000, 59999):
            self.assertTrue(f(0, now, False))
        for now in (60000, 120000):
            self.assertFalse(f(0, now, False))

    def test_suzume(self):
        self.assertIn("suzume.next = now + (ambFirstRetry(now, suzume.met) ? 3500 + Math.random() * 2500 : 9000 + Math.random() * 9000);", PIX)
        self.assertIn("const suzume = { list: [], next: 0, visit: 0, met: false };", PIX)
        body = re.search(r"function suzumeSpawn\(.*?\n\}\n", PIX, re.S).group(0)
        self.assertIn("suzume.met = true;", body)
        self.assertIn("const suzumeWasMet = suzume.met;", PIX)
        self.assertIn("if (!suzumeWasMet) suzume.next = now + 9000 + Math.random() * 9000;", PIX)

    def test_neko(self):
        self.assertIn("neko.next = now + (ambFirstRetry(now, neko.met) ? 4000 + Math.random() * 3000 : 20000 + Math.random() * 20000);", PIX)
        self.assertIn("const neko = { cat: null, next: 0, met: false };", PIX)
        self.assertIn("NEKO_COLS.length)] }; neko.met = true; break; }", PIX)

    def test_unchanged(self):
        self.assertIn("AMB_MAX = 2;", PIX)
        self.assertIn("SUZUME_LIFE = 14000", PIX)
        self.assertIn("NEKO_LIFE = 40000", PIX)
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("RICE_BIG = 1.45", PIX)

    def test_exposed(self):
        self.assertIn("AMB_MAX, ambFirstRetry, AMB_FIRST_MS,", PIX)

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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_86.py", "tests/test_maze_loop4_105.py", "tests/test_maze_loop4_106.py", "tests/test_maze_loop4_101.py", "tests/test_maze_loop4_102.py", "tests/test_maze_loop4_103.py", "tests/test_maze_loop4_104.py", "tests/test_maze_loop4_100.py", "tests/test_maze_loop4_99.py", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_97.py", "tests/test_maze_loop4_98.py", "tests/test_maze_loop4_107.py", "tests/test_maze_loop4_108.py", "tests/test_maze_loop4_145.py"})


if __name__ == "__main__":
    unittest.main()
