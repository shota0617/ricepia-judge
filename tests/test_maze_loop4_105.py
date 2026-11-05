import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


class TestHappyFace(unittest.TestCase):
    def test_happy_face_defined(self):
        self.assertIn("const happyFace = () => !calmMotion && roll.kind === 'stop' && roll.happyT > 0;", PIX)
        self.assertLess(PIX.index("const happyFace"), PIX.index("const asleepShut"))

    def test_happy_face_boundary(self):
        f = lambda calm, kind, t: (not calm) and kind == "stop" and t > 0
        self.assertTrue(f(False, "stop", 0.01))
        self.assertFalse(f(False, "stop", 0))
        self.assertFalse(f(False, "roll", 1.6))
        self.assertFalse(f(True, "stop", 1.6))

    def test_rice_mood_one_line(self):
        m = re.search(r"function riceMood\(now\) \{(.*?)\n", PIX).group(1)
        self.assertIn("'blink' : happyFace() ? 'happy' : 'smile'", m)
        self.assertLess(m.index("blinkOn(now)"), m.index("happyFace()"))
        self.assertEqual(set(re.findall(r"'(\w+)'", m)), {"stop", "blink", "happy", "smile"})
        for bad in ("ouch", "dizzy", "wow", "excited", "yawn", "sleepy"):
            self.assertNotIn(f"'{bad}'", m)

    def test_happy_eyes_block(self):
        self.assertIn("const happyEyes = mood === 'happy' && !asleepShut() && riceEyeAt && (fr === riceSprites.right[0] || fr === riceSprites.down[0]);", PIX)
        i = PIX.index("const happyEyes")
        self.assertGreater(i, PIX.index("const gl = shutEyes"))
        self.assertLess(i, PIX.index("const nD = rb0.spots"))

    def test_arc_points_and_colors(self):
        i = PIX.index("if (happyEyes)")
        blk = PIX[i:PIX.index("const nD = rb0.spots")]
        self.assertIn("for (const bx of [-1, 4])", blk)
        self.assertIn("4 * u, 3 * u", blk)
        self.assertIn("[[-1, 1], [0, 0], [1, 0], [2, 1]]", blk)
        self.assertIn("for (const dx of [0, 5])", blk)
        self.assertLess(blk.index("rgb(250,249,243)"), blk.index("rgb(14,14,14)"))

    def test_existing_strings_unchanged(self):
        self.assertIn("const shutEyes = (mood === 'blink' || asleepShut()) && riceEyeAt && (fr === riceSprites.right[0] || fr === riceSprites.down[0]);", PIX)
        self.assertIn("const gl = shutEyes ? 0 : glanceShift(look);", PIX)
        self.assertIn("glanceShift, asleepShut, happyFace,", PIX)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)
        self.assertIn("RICE_BIG = 1.45", PIX)

    def _diff(self, *args):
        return subprocess.run(["git", "diff", "HEAD~1", "HEAD", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout

    def test_no_forbidden_in_added_lines(self):
        added = "\n".join(l for l in self._diff("-U0", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and not l.startswith("+++"))
        for bad in ("\u307c\u304f", "\u7d0420%"):
            self.assertNotIn(bad, added)

    def test_scope(self):
        files = set(self._diff("--name-only").split())
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_105.py"} | {"tests/test_maze_loop4_%d.py" % n for n in (95, 97, 98, 99, 100, 101, 102, 103, 104)}
        self.assertLessEqual(files, allowed)


if __name__ == "__main__":
    unittest.main()
