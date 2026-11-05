"""第4弾サイクル99：スタートの1分。止まっている間、かおりちゃんが笑顔のまま目だけそっとまばたきする。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


class Blink99(unittest.TestCase):
    def test_constants_and_blink_on(self):
        self.assertIn("const BLINK_MS = 3400, BLINK_SHUT_MS = 150;", PIX)
        self.assertIn("const blinkOn = now => Number.isFinite(now) && now >= 0 && (now % BLINK_MS) < BLINK_SHUT_MS;", PIX)
        ms, shut = 3400, 150
        on = lambda n: isinstance(n, (int, float)) and n == n and n not in (float("inf"), float("-inf")) and n >= 0 and (n % ms) < shut
        for n, want in [(0, True), (149, True), (150, False), (3399, False), (3400, True), (-1, False), (float("nan"), False)]:
            self.assertEqual(on(n), want, n)

    def test_rice_mood(self):
        m = re.search(r"function riceMood\(now\) \{([^}]*)\}", PIX)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertIn("!calmMotion && roll.kind === 'stop' && blinkOn(now)", body)
        self.assertEqual(set(re.findall(r"'(\w+)'", body)), {"stop", "blink", "happy", "smile"})
        for bad in ("ouch", "dizzy", "wow", "excited"):
            self.assertNotIn(f"'{bad}'", body)

    def test_face_set_blink(self):
        self.assertIn("blink: 'shut cheeks smile'", PIX)

    def test_dot_path_draws_blink(self):
        self.assertIn("const shutEyes = (mood === 'blink' || asleepShut()) && riceEyeAt && (fr === riceSprites.right[0] || fr === riceSprites.down[0]);", PIX)
        self.assertIn("rgb(250,249,243)", PIX)
        self.assertIn("rgb(14,14,14)", PIX)
        self.assertIn("(riceEyeAt.y + 2 - rb0.gy) * u, 2 * u, u)", PIX)
        self.assertIn("for (const dx of [0, 5])", PIX)

    def test_eye_saved_and_public(self):
        self.assertIn("riceEyeAt = (ex < N && ey < N) ? { x: ex, y: ey } : null;", PIX)
        self.assertIn("let riceEyeAt = null;", PIX)
        self.assertIn("window.nishioPixel = { blinkOn, BLINK_MS, BLINK_SHUT_MS, get riceEye() { return riceEyeAt; },", PIX)
        self.assertIn("const out = { smile: face };", PIX)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)

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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_105.py", "tests/test_maze_loop4_106.py", "tests/test_maze_loop4_101.py", "tests/test_maze_loop4_102.py", "tests/test_maze_loop4_103.py", "tests/test_maze_loop4_104.py", "tests/test_maze_loop4_99.py", "tests/test_maze_loop4_100.py", "tests/test_maze_loop4_16.py", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_97.py", "tests/test_maze_loop4_98.py"})


if __name__ == "__main__":
    unittest.main()
