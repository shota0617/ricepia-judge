"""第3弾サイクル32：発見の波紋（Pokémon GO）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Pulse(unittest.TestCase):
    def test_defined_and_called_after_ring(self):
        self.assertIn("function drawMzPulse(ox, oy, T, now)", PIXEL)
        line = next(l for l in PIXEL.splitlines() if "if (mazeOn()) {" in l and "drawMzFogVeil(" in l)
        self.assertLess(line.index("drawMzFogVeil("), line.index("drawMzSightRing("))
        self.assertLess(line.index("drawMzSightRing("), line.index("drawMzPulse(ox, oy, T, now)"))

    def test_deterministic_time_based(self):
        t = body("drawMzPulse")
        self.assertIn("(now % 2400) / 2400 + i / 2) % 1", t)
        self.assertIn("0.55 * (1 - phase)", t)
        self.assertIn("0.3 + 2.9 * phase", t)
        self.assertNotIn("Math.random", t)
        self.assertNotIn("Date.now", t)
        self.assertNotIn("fill(", t)

    def test_guards_and_center(self):
        t = body("drawMzPulse")
        self.assertIn("rec ||", t)
        self.assertIn("rp.x === null", t)
        self.assertIn("mzOn(rp.x, rp.y)", t)
        self.assertNotIn("mzViewClear", t)

    def test_no_state_points_text(self):
        t = body("drawMzPulse")
        self.assertNotRegex(t, r"gainPoints|(?<!ctx\.)\bsave\(|\btrack\(|G\.\w+|floatText|fillText|riceSay|localStorage|Sound")
        self.assertIsNone(re.search(r"[ぁ-んァ-ン一-龥]", re.sub(r"//.*", "", t)))

    def test_diff_clean(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
