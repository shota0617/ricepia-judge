"""第3弾サイクル30：見える範囲の光の輪（DQウォーク）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class SightRing(unittest.TestCase):
    def test_defined_and_called_after_veil(self):
        self.assertIn("function drawMzSightRing(ox, oy, T, now)", PIXEL)
        line = next(l for l in PIXEL.splitlines() if "if (mazeOn()) {" in l and "drawMzFogVeil(" in l)
        self.assertLess(line.index("drawMzFogVeil("), line.index("drawMzSightRing("))

    def test_radius_uses_sight_and_torch(self):
        t = body("drawMzSightRing")
        self.assertIn("MZ_FOG[Math.min(4, Math.max(1, Math.round(mzScale)))]", t)
        self.assertIn("typeof mzTorchBonus === 'function' ? mzTorchBonus() : 0", t)
        self.assertIn("sight * MZ_K * T", t)

    def test_guards(self):
        t = body("drawMzSightRing")
        self.assertIn("mzViewClear(now)", t)
        self.assertIn("if (!sight) return", t)
        self.assertIn("rp.x === null", t)

    def test_center_is_hero(self):
        t = body("drawMzSightRing")
        self.assertIn("mzOn(rp.x, rp.y)", t)

    def test_no_new_labels_or_points(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotRegex(added, r"fillText|G\.\w+\(|gainPoints|localStorage|floatText|riceSay|drawMz\w*Tag")
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
