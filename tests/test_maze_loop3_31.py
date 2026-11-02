"""第3弾サイクル31：手描き地図らしい探索マップ（世界樹の迷宮）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class HandDrawnMap(unittest.TestCase):
    def test_graph_paper_ground(self):
        t = body("drawMzMini")
        self.assertIn("rgba(244,240,222,.94)", t)
        self.assertIn("rgba(90,120,160,.18)", t)
        self.assertIn("i * q", t)

    def test_ink_walls_only_where_not_open(self):
        t = body("drawMzMini")
        self.assertIn("rgba(43,38,30,.9)", t)
        self.assertIn("Math.max(1, Math.round(q * 0.28))", t)
        for d in ("0, -1", "0, 1", "-1, 0", "1, 0"):
            self.assertIn(f"if (!mzOpen(cx, cy, {d}))", t)

    def test_outline_after_tint_before_marks(self):
        t = body("drawMzMini")
        self.assertLess(t.index("tint(cx, cy); ctx.fillRect"), t.index("rgba(43,38,30,.9)"))
        self.assertLess(t.index("rgba(43,38,30,.9)"), t.index("mzMini.seen"))

    def test_existing_parts_remain(self):
        t = body("drawMzMini")
        for s in ("mzZoneTint(a)", "mzMini.seen", "mzHudRects", "mapCovered(true)", "mzBanner.t0", "rec ||", "#ffffff"):
            self.assertIn(s, t)

    def test_no_new_state_or_calls(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotRegex(added, r"fillText|G\.\w+\(|gainPoints|localStorage|floatText|riceSay|drawMz\w*Tag")
        self.assertNotRegex(added, r"^\+\s*(const|let|var) mz\w+ = ", )
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
