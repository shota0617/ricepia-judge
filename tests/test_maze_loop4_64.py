"""第4弾サイクル64：画面すっきり化（🔍ボタンとミニマップの廃止）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go/style.css").read_text(encoding="utf-8")


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True, encoding="utf-8").stdout


class ZoomButtonGone(unittest.TestCase):
    def test_html(self):
        self.assertNotIn('id="pxZoom"', HTML)
        self.assertNotIn("🔍 大きさ", HTML)
        self.assertIn("🌏 せかいちず", HTML)
        self.assertIn("🌀 めいろ", HTML)

    def test_js_css(self):
        self.assertNotIn("$('pxZoom')", PIXEL)
        self.assertNotRegex(PIXEL, r"\$\('pxZoom'\)")
        self.assertNotIn(".zc", CSS)
        self.assertIn("body.simple #pxZoomIn,body.simple #pxZoomOut{display:none}", CSS)
        self.assertIn("function setScale(", PIXEL)
        self.assertIn("$('pxZoomIn')", PIXEL)
        self.assertIn("$('pxZoomOut')", PIXEL)


class MiniMapGone(unittest.TestCase):
    def test_drawing_removed(self):
        self.assertNotIn("drawMzMini", PIXEL)
        self.assertNotIn("MZ_MINI", PIXEL)

    def test_record_layer_remains(self):
        for k in ("function mzMiniTick(", "function mzMiniMarks(", "function mzMiniState(", "const mzMini =",
                  "mini: () => mzMiniState()", "miniPut", "function mzCubeReveal("):
            self.assertIn(k, PIXEL)
        self.assertRegex(PIXEL, r"mzMiniTick\(\);")


class Safety(unittest.TestCase):
    def test_no_forbidden_words(self):
        diff = git("diff", "origin/main", "--", "nishio-go", "nishio-go.html")
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + "20%"):
            self.assertNotIn(w, added)

    def test_files_allowed(self):
        files = git("diff", "--name-only", "origin/main").split()
        for f in files:
            self.assertTrue(f.startswith(("nishio-go/", "tests/")) or f == "nishio-go.html", f)


if __name__ == "__main__":
    unittest.main()
