"""第4弾サイクル95：最初の1分は夜の幕をうすく（夜でも真っ暗にしない）。"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def run_k(values):
    m = re.search(r"const START_NIGHT_MS = 90000;\nfunction nightStartK\(ms\) \{.*?\n\}\n", PIX, re.S)
    js = m.group(0) + "console.log(JSON.stringify([%s].map(nightStartK)));" % ",".join(values)
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
    import json
    return json.loads(out)


@unittest.skipUnless(shutil.which("node"), "node が必要")
class StartNight95(unittest.TestCase):
    def test_boundaries(self):
        r = run_k(["0", "-5", "NaN", "59999", "60000", "75000", "90000", "120000"])
        self.assertEqual(r[0], 0.3)
        self.assertEqual(r[1], 0.3)
        self.assertEqual(r[2], 0.3)
        self.assertEqual(r[3], 0.3)
        self.assertAlmostEqual(r[4], 0.3)
        self.assertAlmostEqual(r[5], 0.65)
        self.assertEqual(r[6], 1)
        self.assertEqual(r[7], 1)

    def test_monotonic(self):
        r = run_k([str(t) for t in range(60000, 90001, 5000)])
        self.assertEqual(r, sorted(r))


class DrawNight95(unittest.TestCase):
    def test_uses_lve(self):
        self.assertIn("lve = lv * sk", PIX)
        self.assertIn("rgba(8,12,36,${0.62 * lve})", PIX)
        self.assertIn("${a * lve})", PIX)

    def test_hero_light_radius(self):
        self.assertIn("(1 + Math.sin(now / 180) * 0.03) * (1 + 0.6 * (1 - sk))", PIX)

    def test_exports(self):
        self.assertIn("  nightStartK, get nightK()", PIX)

    def test_physics_unchanged(self):
        self.assertRegex(PIX, r"ROLL_MAX\s*=\s*4\.2\b")

    def _diff(self, *args):
        return subprocess.run(["git", "diff", "HEAD~1", "HEAD", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout

    def test_no_forbidden_in_added_lines(self):
        bad = ["\u307c\u304f", "\u3060\u306b", "\u7d0420%"]
        for line in self._diff("--", "nishio-go", "nishio-go.html").splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                for b in bad:
                    self.assertNotIn(b, line)

    def test_scope(self):
        files = set(self._diff("--name-only").split())
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_96.py"})


if __name__ == "__main__":
    unittest.main()
