"""第3弾サイクル29：歩いた道に 小さな 花が 咲く（ピクミン ブルーム）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Flowers(unittest.TestCase):
    def test_flower_drawn_in_trail(self):
        t = body("drawMzTrail")
        self.assertIn("i < 5", t)                       # 花びら5枚
        self.assertIn("mzZoneTint(ar).rgb", t)          # 地区色
        self.assertIn("#ffd84a", t)                     # 黄色の中心
        self.assertIn("Math.max(1.5, T * 0.09)", t)
        self.assertIn("T * 0.22", t)
        self.assertIn("T * 0.18", t)
        self.assertNotIn("Math.random", t)

    def test_flower_after_paint_before_veil(self):
        t = body("drawMzTrail")
        self.assertLess(t.index("rgba(255,250,232,.55)"), t.index("#ffd84a"))
        line = next(l for l in PIXEL.splitlines() if "drawMzTrail(tx0" in l and "drawMzFogVeil(" in l)
        self.assertLess(line.index("drawMzTrail("), line.index("drawMzFogVeil("))

    def test_no_new_labels_or_points(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotRegex(added, r"fillText|G\.\w+\(|localStorage|floatText|riceSay")
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")

    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


if __name__ == "__main__":
    unittest.main()
