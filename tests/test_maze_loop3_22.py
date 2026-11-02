"""第3弾サイクル22：迷路のおとも旅団（ルフランの地下迷宮と魔女ノ旅団。おとも米を集めて主人公の周りに編成）。"""
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


class Brigade(unittest.TestCase):
    def test_constants_and_functions(self):
        self.assertIn("const MZ_BRIGADE = { n: 3, pts: 5, bonus: 15, min: 6", PIXEL)
        for h in ("function mzBrigadeReset(", "function mzBrigadePick(", "function mzBrigadeTick(", "function mzBrigadeState(",
                  "function drawMzBrigade(", "function drawMzBrigadeMates(", "function drawMzBrigadeTag("):
            self.assertIn(h, PIXEL)
        self.assertIn("mzTorchTick(now); mzBrigadeTick(now);", PIXEL)   # 既存 tick の並びの後ろ

    def test_placement_exclusions(self):
        pick = func_body("function mzBrigadePick(")
        for m in ("mzTorch", "mzFruit", "mzPiece", "mzView", "mzCache", "mzQuest", "mzDino"):
            self.assertIn(f"x === {m}.cx", pick)
        self.assertIn("mzFruitOk(x, y)", pick)
        self.assertIn("MZ_BRIGADE.min", pick)
        self.assertIn("mzBrigade.cx === cx && mzBrigade.cy === cy) return false", func_body("function mzFruitOk("))

    def test_pickup_and_public_api(self):
        tick = func_body("function mzBrigadeTick(")
        self.assertIn("r = G.mzBrigade && G.mzBrigade(fin);\n  if (!r) return;", tick)
        self.assertIn("fin = mzBrigade.count + 1 >= MZ_BRIGADE.n", tick)
        self.assertIn("おともが ふえた！ +${r.pts}pt（あと ${MZ_BRIGADE.n - mzBrigade.count}こ）", tick)
        self.assertIn("🎉 おとも旅団 完成！ +${r.pts}pt", tick)
        self.assertIn("grainSound()", tick)
        self.assertIn("mzFx.push", tick)
        self.assertIn("mzBrigade.cx = mzBrigade.cy = -1", tick)   # 取ったら湧き直す
        self.assertIn("mzBrigade.count >= MZ_BRIGADE.n) return", tick)   # 3つで打ち止め
        g = func_body("function mzBrigade(", GAME)
        for k in ("MZ_BRIGADE_PTS + (done ? MZ_BRIGADE_BONUS : 0)", "gainPoints(pts)", "S.brigadeGot = (S.brigadeGot || 0) + 1",
                  "save()", "track('maze_brigade'", "return { pts }"):
            self.assertIn(k, g)
        self.assertIn("MZ_BRIGADE_PTS = 5, MZ_BRIGADE_BONUS = 15", GAME)
        self.assertRegex(GAME, r"mzTorch, mzBrigade,")   # window.nishioGo の公開リスト
        self.assertIn("brigadeGot: 0", GAME)

    def test_stat_rows_unchanged(self):
        self.assertNotIn("S.brigadeGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index('].map(([k, v, u], i)')]
        self.assertEqual(pi.count(',') + 1, len(re.findall(r"\['[^']+', ", rows)))

    def test_reset_rules(self):
        self.assertRegex(PIXEL, r"mzBrigadeReset\(\);[^\n]*\n\s*mzTorchReset\(\);")   # ゴール変更時
        self.assertRegex(PIXEL, r"!mazeOn\(\) && \(mzBrigade\.sx >= 0 \|\| mzBrigade\.count\)\) mzBrigadeReset\(\)")   # 迷路退出時
        self.assertIn("count: 0", func_body("function mzBrigadeReset("))

    def test_mates_around_hero(self):
        m = func_body("function drawMzBrigadeMates(")
        self.assertIn("mzOn(rp.x, rp.y)", m)   # 主人公の位置が基準
        self.assertIn("slots", m)
        self.assertIn("mzBrigade.count", m)
        self.assertIn("calmMotion", m)

    def test_tag(self):
        tag = func_body("function drawMzBrigadeTag(")
        self.assertIn("🎒 おとも旅団 ${mzBrigade.count}/${MZ_BRIGADE.n}　おとも米", tag)
        self.assertIn("'✓' : '◯'", tag)
        self.assertIn("🎉 おとも旅団 完成！ かおりちゃんと おとも米たち！", tag)
        self.assertIn("MZ_BRIGADE.tagMs", tag)
        self.assertIn("mzEnergy.lastCx >= 0) y0 +=", tag)
        self.assertIn("mzTorch.until > now) y0 +=", tag)   # たいまつ札と重ならない
        self.assertIn("tagMs: 6000", PIXEL)

    def test_state_hook(self):
        self.assertIn("brigade: () => mzBrigadeState()", PIXEL)
        st = func_body("function mzBrigadeState(")
        for k in ("at:", "count:", "done:", "start:"):
            self.assertIn(k, st)

    def test_draw_order(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzBrigade(" in l)
        self.assertLess(line.index("drawMzBrigade("), line.index("drawMzFogVeil("))            # おとも米は veil より前
        self.assertGreater(line.index("drawMzBrigadeMates("), line.index("drawMzFogVeil("))    # 編成おともは veil より後
        self.assertGreater(line.index("drawMzBrigadeMates("), line.index("drawMzTorchFlame("))
        self.assertNotIn("drawMzBrigadeTag(w, dpr, now);", PIXEL)   # 文章札は 常時描画しない（サイクル25）

    def test_non_blocking(self):
        seg = PIXEL[PIXEL.index("// おとも旅団（ルフラン"):PIXEL.index("// 手描き探索マップ")]
        for w in ("addEventListener", "confirm(", "alert(", "modal"):
            self.assertNotIn(w, seg)

    def test_syntax(self):
        for f in ("pixel.js", "game.js"):
            subprocess.run(["node", "--check", str(ROOT / "nishio-go" / f)], check=True)

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertIn("function mzBrigadeTick(", PIXEL)   # サイクル25：差分は 描画行だけなので 仕組みの 残りで 確かめる
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"抹茶.{0,6}20")
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
