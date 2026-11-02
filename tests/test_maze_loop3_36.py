"""第3弾サイクル36：ゴールごとに生け垣の色テーマが変わる（ミズ・パックマン）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class WallTheme(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_four_palettes_theme0_is_original(self):
        m = re.search(r"const MZ_WALL_THEMES = (\[\[.*?\]\]);", PIXEL)
        self.assertTrue(m)
        pals = re.findall(r"\[('#[0-9a-f]{6}'(?:, '#[0-9a-f]{6}'){3})\]", m.group(1))
        self.assertEqual(len(pals), 4)
        self.assertEqual(len(set(pals)), 4)
        self.assertEqual(pals[0], "'#2f7a58', '#256548', '#3d9168', '#5aac7c'")

    def test_theme_is_pure_function_of_goal_id(self):
        t = body("mzWallTheme")
        self.assertIn("mzRt.gid", t)
        self.assertIn("charCodeAt", t)
        self.assertIn("% 4", t)
        for bad in ("Math.random", "Date.now", "performance.now", "localStorage", "lsSet"):
            self.assertNotIn(bad, t)

    def test_walls_use_palette(self):
        pat = body("mzHedgePat")
        self.assertNotIn("'#2f7a58'", pat)
        self.assertNotIn("'#256548'", pat)
        self.assertIn("wc[0]", pat)
        self.assertIn("mzWallTheme()", pat)   # 模様の使い回しの鍵にテーマを含める
        self.assertNotIn("'#2f7a58'", body("drawMaze"))
        self.assertNotIn("'#2f7a58'", body("drawMazeGrid"))
        self.assertIn("mzWallCols()", body("drawMazeGrid"))
        self.assertIn("mzWallTheme()].join()", body("drawMaze"))   # 下絵の使い回しの鍵

    def test_only_original_green_in_palette_def(self):
        self.assertEqual(PIXEL.count("#2f7a58"), 1)

    def test_test_hook(self):
        self.assertIn("wallTheme: () => mzWallTheme()", PIXEL)

    def test_no_new_state_points_or_text(self):
        seg = PIXEL[PIXEL.index("const MZ_WALL_THEMES"):PIXEL.index("function mzHedgePat(")]
        for bad in ("lsSet", "localStorage", "setTimeout", "floatText", "toast", "addPoints", "fillText"):
            self.assertNotIn(bad, seg)

    def test_only_pixel_js_changed_and_no_banned_words(self):
        files = subprocess.run(["git", "diff", "--name-only", "main...HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.split()
        for f in files:
            self.assertIn(f, ("nishio-go/pixel.js", "tests/test_maze_loop3_36.py"))
        diff = subprocess.run(["git", "diff", "main...HEAD", "--", "nishio-go/pixel.js"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for bad in ("ぼく", "約20%", "約２０％"):
            self.assertNotIn(bad, added)


if __name__ == "__main__":
    unittest.main()
