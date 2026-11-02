"""第3弾サイクル23：迷路の浄化マス（Mary Skelter: Nightmares の穢れ。踏んで浄化し、進み具合が札で見える）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def func_body(head, src=PIXEL):
    i = src.index(head)
    return src[i:src.index("\n}\n", i)]


class Purify(unittest.TestCase):
    def test_constants_and_functions(self):
        self.assertIn("const MZ_PURIFY = { n: 8, pts: 5, bonus: 20, min: 6", PIXEL)
        for h in ("function mzPurifyReset(", "function mzPurifyPick(", "function mzPurifyTick(", "function mzPurifyState(",
                  "function drawMzPurify(", "function drawMzPurifyTag("):
            self.assertIn(h, PIXEL)
        self.assertIn("mzBrigadeTick(now); mzPurifyTick(now);", PIXEL)   # 旅団 tick のあと

    def test_placement_and_mutual_avoidance(self):
        pick = func_body("function mzPurifyPick(")
        self.assertIn("mzFruitOk(x, y)", pick)       # ゴール・既存ボーナスのマスを避ける
        self.assertIn("MZ_PURIFY.min", pick)
        self.assertIn("MZ_PURIFY.n", pick)
        self.assertIn("mzPurify.cells.some(c => c[0] === cx && c[1] === cy)) return false", func_body("function mzFruitOk("))
        tick = func_body("function mzPurifyTick(")
        self.assertIn("if (c.length)", tick)          # 候補0なら出さない

    def test_purify_and_public_api(self):
        tick = func_body("function mzPurifyTick(")
        self.assertIn("r = G.mzPurify && G.mzPurify(fin);\n  if (!r) return;", tick)
        self.assertIn("!mzPurify.done[j]", tick)      # 1マス1回だけ
        self.assertIn("✨ 浄化した！ +${r.pts}pt（あと ${total - mzPurify.count}こ）", tick)
        self.assertIn("🎉 ぜんぶ浄化！ +${r.pts}pt", tick)
        g = func_body("function mzPurify(", GAME)
        for k in ("MZ_PURIFY_PTS + (done ? MZ_PURIFY_BONUS : 0)", "gainPoints(pts)", "S.purifyGot = (S.purifyGot || 0) + 1",
                  "save()", "track('maze_purify'", "return { pts }"):
            self.assertIn(k, g)
        self.assertIn("MZ_PURIFY_PTS = 5, MZ_PURIFY_BONUS = 20", GAME)
        self.assertRegex(GAME, r"mzBrigade, mzPurify,")
        self.assertIn("purifyGot: 0", GAME)

    def test_stat_row_added_in_cycle27(self):
        self.assertIn("S.purifyGot || 0, '回']", GAME)   # サイクル27できろく整備で行を追加

    def test_reset_rules(self):
        self.assertRegex(PIXEL, r"mzPurifyReset\(\);[^\n]*\n\s*mzRescueReset\(\);[^\n]*\n\s*mzBrigadeReset\(\);")
        self.assertRegex(PIXEL, r"!mazeOn\(\) && \(mzPurify\.sx >= 0 \|\| mzPurify\.count\)\) mzPurifyReset\(\)")
        self.assertIn("count: 0", func_body("function mzPurifyReset("))

    def test_tag(self):
        tag = func_body("function drawMzPurifyTag(")
        self.assertIn("💜 浄化 ${mzPurify.count}/${n}", tag)
        self.assertIn("MZ_PURIFY.tagMs", tag)
        self.assertIn("mzBrigade.doneAt", tag)        # 旅団札と重ならない
        self.assertIn("mapCovered(true)", tag)

    def test_state_hook(self):
        self.assertIn("purify: () => mzPurifyState()", PIXEL)
        st = func_body("function mzPurifyState(")
        for k in ("cells:", "count:", "total:", "done:"):
            self.assertIn(k, st)

    def test_draw_order(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzPurify(" in l)
        self.assertLess(line.index("drawMzPurify("), line.index("drawMzFogVeil("))   # けがれは veil より前（視界外はもや）
        self.assertNotIn("drawMzPurifyTag(w, dpr, now);", PIXEL)   # 文章札は 常時描画しない（サイクル25）

    def test_draw_uses_rects_and_calm(self):
        d = func_body("function drawMzPurify(")
        self.assertIn("fillRect", d)
        self.assertNotIn("ellipse", d)
        self.assertIn("calmMotion", d)

    def test_non_blocking(self):
        seg = PIXEL[PIXEL.index("// 迷路の 浄化マス（Mary"):PIXEL.index("// 手描き探索マップ")]
        for w in ("addEventListener", "confirm(", "alert(", "modal"):
            self.assertNotIn(w, seg)

    def test_syntax(self):
        for f in ("pixel.js", "game.js"):
            subprocess.run(["node", "--check", str(ROOT / "nishio-go" / f)], check=True)

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertIn("function mzPurifyTick(", PIXEL)   # サイクル25：差分は 描画行だけなので 仕組みの 残りで 確かめる
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"抹茶.{0,6}20")
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
