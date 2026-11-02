"""第3弾サイクル28：歩いた道が 太い塗り道になる（踏破 tint を濃く、足あとを 太い線と大きな丸に）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Paint(unittest.TestCase):
    def test_fog_alpha_tint_and_veil(self):
        f = body("mzFogAlpha")
        self.assertIn("return { veil: visited ? 0 : f.veil, tint: visited ? 0.34 : 0 }", f)
        self.assertIn("return { veil: 0, tint: visited ? 0.34 : 0 }", f)
        self.assertIn("return { veil: visited ? f.veil * 0.4 : f.veil, tint: visited ? 0.22 : 0 }", f)
        self.assertNotIn("0.16", f)
        self.assertIn("const MZ_FOG = { 1: { sight: 0, veil: 0.2 }, 2: { sight: 9, veil: 0.3 }, 3: { sight: 6, veil: 0.4 }, 4: { sight: 4, veil: 0.46 } }", PIXEL)

    def test_fog_cells_cap(self):
        self.assertIn("Math.min(0.58, f.tint * zt.k)", body("mzFogCells"))

    def test_trail_is_thick_paint(self):
        t = body("drawMzTrail")
        self.assertIn("mzOpen(cx, cy, dx, dy)", t)
        self.assertIn("mzTrail.has((cx + dx) + ',' + (cy + dy))", t)
        self.assertIn("mzOn(x, y)", t)
        self.assertRegex(t, r"lw = Math\.max\(\d+, T \* 0\.5\)")
        self.assertRegex(t, r"rg = Math\.max\(\d+(\.\d+)?, T \* 0\.3\)")
        self.assertIn("ctx.lineWidth = w", t)
        self.assertIn("rgba(255,250,232,.55)", t)

    def test_no_new_labels_or_points(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotRegex(added, r"fillText|G\.\w*(add|pt|point)\w*\(", "文字札・ポイント呼び出しを 増やさない")
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")

    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


if __name__ == "__main__":
    unittest.main()
