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
            if f.startswith("tests/"): continue
            self.assertIn(f, ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go.html", "tests/test_maze_loop4_2.py", "tests/test_maze_loop4_3.py", "tests/test_maze_loop4_6.py", "tests/test_maze_loop3_19.py", "tests/test_maze_loop3_38.py", "tests/test_maze_loop3_39.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop4_1.py", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_48.py", "tests/test_maze_loop3_49.py", "tests/test_maze_loop3_50.py", "tests/test_maze_loop3_51.py", "tests/test_maze_loop3_52.py", "tests/test_maze_loop3_53.py", "tests/test_maze_loop3_54.py", "tests/test_maze_loop3_55.py", "tests/test_maze_loop3_56.py", "tests/test_maze_loop3_57.py", "tests/test_maze_loop3_58.py", "tests/test_maze_loop3_59.py", "tests/test_maze_loop3_60.py", "tests/test_maze_loop3_61.py", "tests/test_maze_loop3_62.py", "tests/test_maze_loop3_63.py", "tests/test_maze_loop3_64.py", "tests/test_maze_loop3_65.py", "tests/test_maze_loop3_66.py", "tests/test_maze_loop3_67.py", "tests/test_maze_loop3_68.py", "tests/test_maze_loop3_35.py", "tests/test_maze_fog.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_33.py", "tests/test_maze_loop3_34.py", "tests/test_maze_loop3_36.py",
                              # サイクル37（地図タイル）が tick 並び・diff 検査法の期待を更新した分
                              "tests/test_maze_loop3_24.py", "tests/test_maze_loop3_26.py",
                              "tests/test_maze_loop3_29.py", "tests/test_maze_loop3_30.py",
                              "tests/test_maze_loop3_31.py", "tests/test_maze_loop3_37.py",
                              # サイクル38（るすばん結果カード廃止）が game.js を変更した分
                              "nishio-go/game.js", "tests/test_maze_loop3_38.py",
                              # サイクル39（探知リング）が波紋の期待と新規テストを追加した分
                              "tests/test_maze_loop3_32.py", "tests/test_maze_loop3_39.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_28.py", "tests/test_maze_loop3_29.py", "tests/test_maze_loop3_30.py", "tests/test_maze_loop3_31.py",
                              # サイクル42（吹き出し廃止）が kometalk.js・html・既存テスト期待を更新した分
                              "nishio-go.html", "nishio-go/kometalk.js", "tests/test_maze_loop3_42.py", "tests/test_maze_loop3_2.py", "tests/test_maze_loop3_19.py",
                              # サイクル43（エネルギーオーラ）が新規テストを追加した分
                              "tests/test_maze_loop3_43.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_46.py", "tests/test_maze_loop3_12.py", "tests/test_maze_loop3_13.py", "tests/test_maze_loop3_14.py", "tests/test_maze_loop3_15.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_17.py"))
        diff = subprocess.run(["git", "diff", "main...HEAD", "--", "nishio-go/pixel.js"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for bad in ("ぼく", "約20%", "約２０％"):
            self.assertNotIn(bad, added)


if __name__ == "__main__":
    unittest.main()
