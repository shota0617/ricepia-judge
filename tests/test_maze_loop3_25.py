"""第3弾サイクル25：文字を最小限に（常時表示の文章札を全廃し、エネルギーは ⚡＋数字だけのチップ）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
TAGS = ("ViewClearTag", "CacheHint", "QuestTag", "DinoTag", "ChaseTag", "TorchTag", "BrigadeTag", "PurifyTag", "RescueTag")


def func_body(head, src):
    i = src.index(head)
    return src[i:src.index("\n}\n", i)]


class MinimalText(unittest.TestCase):
    def test_no_always_on_text_tags(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzEnergyBar(w, dpr, now);" in l and "drawMzMini(" in l)
        for t in TAGS:
            self.assertNotIn(f"drawMz{t}(", line)
            self.assertIn(f"function drawMz{t}(", PIXEL)   # 関数は 未使用のまま 残す
        for k in ("drawMzShelf(", "drawMzViewPanorama(", "drawMzMini("):
            self.assertIn(k, line)

    def test_no_tag_call_anywhere(self):
        for t in TAGS:
            self.assertEqual(PIXEL.count(f"drawMz{t}("), 1, t)   # 定義の 1つだけ

    def test_energy_chip_is_numbers_only(self):
        h = func_body("function drawMzEnergyBar(", PIXEL)
        self.assertIn("`⚡ ${", h)
        self.assertNotIn("さんぽエネルギー", h)
        self.assertIn("createLinearGradient", h)

    def test_guide_has_no_glow_treasure_lines(self):
        g = func_body("function renderGuide(", GAME)
        self.assertNotIn("glowHtml()", g)
        self.assertNotIn("treasureHtml()", g)
        self.assertIn("function glowHtml(", GAME)
        self.assertIn("function treasureHtml(", GAME)
        self.assertIn("guideChips(", g)

    def test_cache_chip_icon_number_only(self):
        h = func_body("function drawMzCacheChip(", PIXEL)
        self.assertIn("`🔍 ${mzCache.dist}`", h)   # アイコン＋数字だけ
        for w in ("あつい", "つめたい", "かくし宝箱"):
            self.assertNotIn(w, h)   # 文章は 描かない
        line = next(l for l in PIXEL.splitlines() if "drawMzEnergyBar(w, dpr, now);" in l and "drawMzMini(" in l)
        self.assertIn("drawMzCacheChip(w, dpr, now);", line)   # 描画行に 配線されている
        e = func_body("function drawMzEnergyBar(", PIXEL)
        self.assertNotIn("mzViewClear(now)) y0", e)   # 消した 見晴らし札の 余白を 残さない

    def test_mechanisms_remain(self):
        for n in ("mzTorch", "mzBrigade", "mzPurify", "mzRescue", "mzDino", "mzChase", "mzQuest", "mzEnergy"):
            self.assertIn(f"function {n}Reset(", PIXEL)
        for n in ("mzTorchTick", "mzBrigadeTick", "mzPurifyTick", "mzRescueTick"):
            self.assertIn(f"function {n}(", PIXEL)
        for k in ("purifyGot", "rescueGot", "brigadeGot", "torchGot"):
            self.assertIn(k, GAME)

    def test_syntax_and_forbidden_words(self):
        for f in ("pixel.js", "game.js"):
            subprocess.run(["node", "--check", str(ROOT / "nishio-go" / f)], check=True)
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに"):
            self.assertNotIn(w, added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
