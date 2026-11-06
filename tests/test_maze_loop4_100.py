"""第4弾サイクル100：スタートの1分。止まっている間、目だけそっときょろきょろ、眠るときは目を閉じたまますやすや。"""
import math
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def glance(look):
    try:
        x = float(look)
    except (TypeError, ValueError):
        x = 0.0
    if math.isnan(x):
        x = 0.0
    v = math.floor(x + 0.5)
    return -1 if v < -1 else 1 if v > 1 else v


class Glance100(unittest.TestCase):
    def test_glance_shift_definition_and_bounds(self):
        self.assertIn("const glanceShift = look => { const v = Math.round(Number(look) || 0); return v < -1 ? -1 : v > 1 ? 1 : v; };", PIX)
        for look, want in [(-1.5, -1), (-0.6, -1), (-0.4, 0), (0, 0), (0.4, 0), (0.6, 1), (1.5, 1), (float("nan"), 0)]:
            self.assertEqual(glance(look), want, look)

    def test_asleep_shut(self):
        self.assertIn("const asleepShut = () => !calmMotion && roll.kind === 'stop' && roll.idle > 12;", PIX)
        self.assertGreater(PIX.index("const asleepShut"), PIX.index("const riceAsleep"))

    def test_glance_drawn_by_program_face(self):
        # ユーザー指示 2026-11-06（米粒の姿と動きを元に戻す）に追随：ドット絵経路の目の上書き描画は廃止。
        # きょろきょろはプログラム描画経路が look で顔全体を少し横へずらして描く（定義・公開は従来どおり残る）
        self.assertNotIn("riceSprites.dot", PIX)
        self.assertIn("dst.translate((sn * rb.a * 0.7 + look) * u, sp * rb.b * 0.6 * u);", PIX)
        self.assertIn("const fc = (rb.faces && rb.faces[mood]) || rb.face;", PIX)

    def test_mood_unchanged(self):
        m = re.search(r"function riceMood\(now\) \{(.*?)\n", PIX).group(1)
        self.assertIn("!calmMotion && roll.kind === 'stop' && blinkOn(now)", m)
        self.assertEqual(set(re.findall(r"'(\w+)'", m)), {"stop", "blink", "happy", "smile"})
        self.assertIn("blink: 'shut cheeks smile'", PIX)

    def test_exposed(self):
        self.assertIn("get riceEye() { return riceEyeAt; }, glanceShift, asleepShut,", PIX)

    def test_physics_unchanged(self):
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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_86.py", "tests/test_maze_loop4_105.py", "tests/test_maze_loop4_106.py", "tests/test_maze_loop4_101.py", "tests/test_maze_loop4_102.py", "tests/test_maze_loop4_103.py", "tests/test_maze_loop4_104.py", "tests/test_maze_loop4_100.py", "tests/test_maze_loop4_99.py", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_97.py", "tests/test_maze_loop4_98.py"})


if __name__ == "__main__":
    unittest.main()
