import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
FN = PIX[PIX.index("function mzMichikusa(now) {"):]
FN = FN[:FN.index("\n}\n") + 3]


class TestMichikusaFirstRoll(unittest.TestCase):
    def test_first_gate_is_now(self):
        self.assertIn("if (!michi.next) michi.next = now;", FN)
        self.assertNotIn("now + 15000", FN)
        self.assertNotIn("return; }   // \u306f\u3058\u3081", FN)

    def test_first_gate_before_pick(self):
        self.assertLess(FN.index("if (!michi.next) michi.next = now;"), FN.index("M.pick("))

    def test_rice_say_happy(self):
        self.assertIn("riceSay(r.item.say, 2400, 'happy');", FN)
        self.assertNotIn("riceSay(r.item.say, 2400);", FN)

    def test_later_interval_and_seen_unchanged(self):
        self.assertIn("michi.next = now + 45000 + Math.random() * 30000;", FN)
        self.assertIn("michi.next = now + 5000; return;", FN)
        self.assertIn("localStorage.setItem(MICHI_KEY, JSON.stringify(r.seen))", FN)
        self.assertIn("const MICHI_KEY = 'nsg_michikusa';", PIX)

    def test_guards_unchanged(self):
        g = ("if (!M || !LU || now < michi.next || now < riceBub.until + 3000 || !howtoEl.hidden || mapCovered() || "
             "sightBusy() || worldMode || driving || rp.x === null || Math.hypot(rp.vx, rp.vy) < 0.2) return;")
        self.assertIn(g, FN)

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
        allowed = {"nishio-go/pixel.js", "tests/test_maze_loop4_86.py", "tests/test_maze_loop4_106.py", "tests/test_maze_loop4_145.py", "nishio-go/game.js", "nishio-go.html", "tests/test_maze_loop4_146.py", "tests/test_maze_loop4_66.py", "tests/test_nishio_cycle126.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop4_86.py", "nishio-go/style.css", "tests/test_maze_loop4_147.py", "tests/test_nishio_cycle144.py" } | {"tests/test_maze_loop4_%d.py" % n for n in (95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 107, 108)}
        self.assertLessEqual(files, allowed)


if __name__ == "__main__":
    unittest.main()
