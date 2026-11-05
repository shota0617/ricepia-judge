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
        cols = {p[:3] for p in self.im.crop((4 * 32, 0, 5 * 32, 32)).getdata() if p[3]}
        self.assertNotIn((14, 14, 14), cols)
        self.assertNotIn((246, 160, 176), cols)

    def test_pixel_js_dot_path(self):
        self.assertIn("nishio-go/art/rice-dot.png", PX)
        self.assertIn("nishio-go/art/rice.png", PX)   # フォールバック
        i = PX.index("riceSprites.dot && !gb")
        self.assertIn("imageSmoothingEnabled = false", PX[i:i + 900])

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):   # 禁止表現はエスケープ表記（ファイル内に直書きしない）
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
