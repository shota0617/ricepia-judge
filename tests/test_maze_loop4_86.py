"""第4弾サイクル86：主人公かおりちゃんを手描きドット絵に作り直す（rice-dot.png とドット描き経路）"""
import subprocess
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


class Loop86(unittest.TestCase):
    def setUp(self):
        self.im = Image.open(ROOT / "nishio-go" / "art" / "rice-dot.png").convert("RGBA")

    def test_sheet_size_and_colors(self):
        self.assertEqual(self.im.size, (256, 64))
        cols = {p[:3] for p in self.im.getdata() if p[3]}
        self.assertLessEqual(len(cols), 40)

    def test_face_colors_in_frame0(self):
        for row in (0, 1):
            cols = {p[:3] for p in self.im.crop((0, row * 32, 32, row * 32 + 32)).getdata() if p[3]}
            self.assertIn((14, 14, 14), cols)
            self.assertIn((246, 160, 176), cols)

    def test_back_frame_has_no_face(self):
        for row in (0, 1):
            cols = {p[:3] for p in self.im.crop((4 * 32, row * 32, 5 * 32, row * 32 + 32)).getdata() if p[3]}
            self.assertNotIn((14, 14, 14), cols)
            self.assertNotIn((246, 160, 176), cols)

    def test_pixel_js_reverted_to_program_path(self):
        # ユーザー指示 2026-11-06（米粒の姿と動きを元に戻す）：サイクル86のドット絵経路は廃止し、
        # rice.png を直接読み、drawRiceBall のプログラム描画経路で描く形へ復元した（仕様変更として追随）
        self.assertNotIn("rice-dot", PX)
        self.assertNotIn("riceSprites.dot", PX)
        self.assertIn("img.src = 'nishio-go/art/rice.png';", PX)

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):   # 禁止表現はエスケープ表記（ファイル内に直書きしない）
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()


class HeroRevert(unittest.TestCase):
    def test_loader_reads_rice_png_directly(self):
        self.assertIn("img.src = 'nishio-go/art/rice.png';", PX)
        self.assertNotIn("rice-dot", PX)
        self.assertNotIn("riceSprites.dot", PX)
        self.assertIn("const riceSprites = { right: [], left: [], down: [], up: [], ready: false };", PX)

    def test_no_frame_switching_in_draw(self):
        i = PX.index("function drawRiceBall")
        body = PX[i:PX.index("\n}\n", i)]
        self.assertNotIn("riceSprites.right.length === 8", body)   # コマ切り替え分岐がない
        self.assertNotIn("riceSprites.down[pk]", body)
        self.assertIn("const fc = (rb.faces && rb.faces[mood]) || rb.face;", body)   # 顔は mood で選ぶ
        self.assertIn("RICE_TONE", body)   # 再照明で丸く描く経路が本体

    def test_distance_synced_rotation_kept(self):
        self.assertIn("roll.ang += adv.dAng; roll.pitch += adv.dPitch;", PX)   # 距離で回る（M1）
        self.assertIn("drawRiceBall(hx, by, u, th % (Math.PI * 2), sx, sy, roll.spin", PX)

    def test_size_kept_cycle94(self):
        self.assertIn("const RICE_BIG = 1.45;", PX)
        self.assertIn("sz = sz0 * RICE_BIG, u = sz / 32", PX)   # 歩く地図
        self.assertIn("hs * RICE_BIG / 32", PX)   # めいろ

    def test_physics_kept_cycle68(self):
        self.assertRegex(PX, r"ROLL_MAX = 4\.2\b")
        self.assertRegex(PX, r"ROLL_ACC = 7\b")
        self.assertRegex(PX, r"HOP_V = 4\.6\b")
        self.assertRegex(PX, r"RICE_R = 0\.42\b")

    def test_faces_available_in_program_path(self):
        self.assertIn("blink: 'shut cheeks smile'", PX)   # まばたき
        self.assertIn("happy: 'arcUp cheeks open'", PX)   # うれしい顔
        self.assertIn("dst.translate((sn * rb.a * 0.7 + look) * u, sp * rb.b * 0.6 * u);", PX)   # きょろきょろ（顔の横ずれ）

    def test_dot_asset_retained(self):
        self.assertTrue((ROOT / "nishio-go" / "art" / "rice-dot.png").exists())   # ファイルは残置（未使用）

    def test_no_forbidden_in_added_lines(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout
        bad = ["\u307c\u304f", "\u3060\u306b", "\u7d0420%"]
        for line in diff.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                for b in bad:
                    self.assertNotIn(b, line)

    def test_scope(self):
        files = set(subprocess.run(["git", "diff", "origin/main", "--name-only"], cwd=ROOT,
                                   capture_output=True, text=True, check=True).stdout.split())
        allowed = {"nishio-go/pixel.js"} | {"tests/test_maze_loop4_%d.py" % n
                                            for n in (86, 95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 145)} \
            | {"tests/test_maze_loop4_hero_revert.py"}
        self.assertLessEqual(files, allowed)


if __name__ == "__main__":
    unittest.main()
