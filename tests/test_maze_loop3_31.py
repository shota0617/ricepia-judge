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
    def test_drawing_abolished_cycle64(self):
        # サイクル64：手描き地図の描画（方眼紙・インクの壁線）ごと廃止。記録層は残る
        self.assertNotIn("drawMzMini", PIXEL)
        self.assertNotIn("MZ_MINI", PIXEL)
        self.assertNotIn("rgba(244,240,222,.94)", PIXEL)
        for n in ("mzMiniTick", "mzMiniMarks", "mzMiniState"):
            self.assertIn(f"function {n}(", PIXEL)

    def test_no_new_state_or_calls(self):
        diff = subprocess.run(["git", "diff", "--word-diff=porcelain", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l)
        self.assertNotRegex(added, r"fillText(?!\(QUEST_TOOLS\[i\]\.emoji, X, Y\))|G\.\w+\(|gainPoints|localStorage|floatText|riceSay|drawMz\w*Tag")
        self.assertNotRegex(added, r"^\+\s*(const|let|var) mz\w+ = ", )
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
