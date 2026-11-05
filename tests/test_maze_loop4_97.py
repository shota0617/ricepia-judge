"""第4弾サイクル97：スタートの1分。意味の分からない数字（⚡ 0/36・🔍 15）を消し、ゲージと光だけで伝える。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIX.index(head)
    return PIX[i:PIX.index("\n}\n", i)]


class NoNumbers97(unittest.TestCase):
    def test_energy_bar_has_no_text(self):
        b = func_body("function drawMzEnergyBar(")
        for w in ("fillText", "textAlign", "ctx.font", "burst", "⚡", "steps}/"):
            self.assertNotIn(w, b)
        self.assertIn("by = y0 + Math.round(bh * 0.35)", b)
        self.assertIn("bbh = Math.round(bh * 0.3)", b)
        self.assertIn("bh = Math.round(S * 1.5)", b)
        self.assertIn("mzEnergy.steps / MZ_ENERGY.need", b)
        self.assertIn("fillRect(bx, by, fill, bbh)", b)

    def test_cache_chip_gone(self):
        self.assertNotIn("drawMzCacheChip", PIX)
        self.assertIn("function drawMzCacheHint(", PIX)

    def test_cues_remain(self):
        for n in ("mzPulseSignal", "mzCacheGlow", "mzCacheTick", "mzCachePick", "drawMzCache"):
            self.assertIn(f"function {n}(", PIX)
        self.assertIn("mzCache.dist > MZ_CACHE.show", PIX)
        self.assertIn("drawMzEnergyBar(w, dpr, now); drawMzCubeShelf(w, dpr, now);", PIX)
        self.assertIn("function mzEnergyTick(", PIX)
        self.assertIn("満タン！", PIX)

    def test_physics_unchanged(self):
        self.assertIn("const ROLL_ACC = 7, ROLL_MAX = 4.2,", PIX)

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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_101.py", "tests/test_maze_loop4_102.py", "tests/test_maze_loop4_103.py", "tests/test_maze_loop4_104.py", "tests/test_maze_loop4_97.py", "tests/test_maze_loop3_18.py", "tests/test_maze_loop3_25.py", "tests/test_maze_loop3_26.py", "tests/test_maze_loop4_9.py", "tests/test_maze_loop4_95.py", "tests/test_maze_loop4_98.py", "tests/test_maze_loop4_99.py", "tests/test_maze_loop4_100.py", "tests/test_maze_loop4_16.py"})


if __name__ == "__main__":
    unittest.main()
