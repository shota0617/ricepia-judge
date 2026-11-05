"""第3弾サイクル40：集めたどうぐが かおりちゃんの頭上に見える（Orna 装備コレクション）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Carry(unittest.TestCase):
    def test_defined_and_uses_tools(self):
        t = body("drawMzQuestCarry")
        self.assertIn("mzQuest.got", t)
        self.assertIn("QUEST_TOOLS[i].emoji", t)
        self.assertIn("QUEST_TOOLS[i].color", t)
        self.assertIn("mzOn(rp.x, rp.y)", t)

    def test_guards(self):
        t = body("drawMzQuestCarry")
        self.assertIn("if (!mzQuest.got || rp.x === null) return;", t)

    def test_slots(self):
        t = body("drawMzQuestCarry")
        self.assertIn("[[-1.8, -1.1], [0, -1.7], [1.8, -1.1]]", t)
        self.assertIn("calmMotion ? 0 : Math.sin(now / 320) * q", t)  # 弧ぜんたいで同じ揺れ（相対位置が変わらない）

    def test_badge_geometry_no_overlap(self):
        # Codex指摘への対応: 代表サイズで隣のバッジ同士が重ならないこと（中心間距離 > 直径＋輪の太さ）
        import math
        t = body("drawMzQuestCarry")
        slots = [[float(v) for v in s.split(",")] for s in re.search(r"slots = \[(.*)\];", t).group(1)[1:-1].split("], [")]
        for T in (10, 12, 16, 20, 28, 40):
            u = max(5, T * 0.5)
            outer = 2 * max(3, T * 0.3) + max(1.5, T * 0.07)
            for a, b in zip(slots, slots[1:]):
                d = math.hypot((b[0] - a[0]) * u, (b[1] - a[1]) * u)
                # 座標の丸めで最大約1.4px縮んでも重ならないこと（揺れは弧全体で同じため相対位置は不変）
                self.assertGreater(d, outer + 1.4, f"T={T} でバッジが重なる")

    def test_filltext_exemption_is_exact(self):
        # Codex指摘への対応: 絵文字の fillText は正確な呼び出し1件だけ。それ以外の fillText 追加は従来どおり禁止される形
        self.assertEqual(PIXEL.count("fillText(QUEST_TOOLS[i].emoji, X, Y)"), 1)
        for n in (28, 29, 30, 31):
            s = (ROOT / f"tests/test_maze_loop3_{n}.py").read_text(encoding="utf-8")
            self.assertIn(r"fillText(?!\(QUEST_TOOLS\[i\]\.emoji, X, Y\))", s)

    def test_order(self):
        line = next(l for l in PIXEL.splitlines() if "if (mazeOn()) {" in l and "drawMzFogVeil(" in l)
        self.assertLess(line.index("drawMzFogVeil("), line.index("drawMzQuestCarry("))
        self.assertIn("drawMzBrigadeMates(ox, oy, T, now); drawMzQuestCarry(ox, oy, T, now); drawMzPurifyPetals(ox, oy, T, now); drawMzRescueMate(", line)
        self.assertEqual(PIXEL.count("drawMzQuestCarry(ox, oy, T, now);"), 1)

    def test_pure(self):
        t = re.sub(r"//.*", "", body("drawMzQuestCarry"))
        self.assertNotRegex(t, r"mzQuest\.\w+\s*=[^=]|gainPoints|(?<!ctx\.)\bsave\(|\btrack\(|G\.\w+|floatText|riceSay|localStorage|Sound|[ぁ-んァ-ン]")


class Scope(unittest.TestCase):
    def test_files_and_words(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.split()
        for f in out:
            self.assertRegex(f, r"^(nishio-go/pixel\.js|nishio-go/style\.css|nishio-go\.html|nishio-go/game\.js|nishio-go/postcard\.js|nishio-go/photoquiz\.js|nishio-go/daystamp\.js|nishio-go/picross\.js|nishio-go/shopmap\.js|nishio-go/bingo\.js|nishio-go/memory\.js|nishio-go/slidepuzzle\.js|nishio-go/janken\.js|nishio-go/rollsync\.js|nishio-go/landscape\.js|nishio-go/biglandmark\.js|nishio-go/rolltrail\.js|nishio-go/meiro\.js|nishio-go/share\.js|nishio-go/shomai\.js|nishio-go/art/shomai-cute\.png|nishio-go/art/rice-dot\.png|nishio-go/art/poi\.png|nishio-go/art/spots\.png|nishio-go/art/people\.png|nishio-go/art/cat-[a-z]+\.png|nishio-go/dankyu\.js|nishio-go/harvest\.js|nishio-go/hiryoyama\.js|nishio-go/idlecard\.js|nishio-go/kometalk\.js|tests/test_(maze_(loop3_\d+|loop4_\d+|fog|coverage)|furusato|monosashi|nedoko|okaeri|reward_tip|shirushi|yume)\.py)$")
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
