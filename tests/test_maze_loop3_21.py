"""第3弾サイクル21：迷路のたいまつ（Legend of Grimrock の明かりの輪。フォグの視界 +3マス・45秒）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Torch(unittest.TestCase):
    def test_constants_and_functions(self):
        self.assertIn("const MZ_TORCH = { sight: 3, ms: 45000, pts: 10, min: 6", PIXEL)
        for h in ("function mzTorchReset(", "function mzTorchPick(", "function mzTorchTick(", "function mzTorchBonus(",
                  "function mzTorchState(", "function drawMzTorch(", "function drawMzTorchFlame(", "function drawMzTorchTag("):
            self.assertIn(h, PIXEL)
        self.assertIn("mzMiniTick(); mzTorchTick(now); mzBrigadeTick(now); }", PIXEL)

    def test_placement_exclusions(self):
        pick = func_body("function mzTorchPick(")
        for m in ("mzFruit", "mzPiece", "mzView", "mzCache", "mzQuest", "mzDino"):
            self.assertIn(f"x === {m}.cx", pick)
        self.assertIn("mzFruitOk(x, y)", pick)
        self.assertIn("MZ_TORCH.min", pick)
        # あとから出るみかん等もたいまつのマスを避ける
        self.assertIn("mzTorch.cx === cx && mzTorch.cy === cy) return false", func_body("function mzFruitOk("))

    def test_fog_radius_added_at_single_point(self):
        al = func_body("function mzFogAlpha(")
        self.assertIn("f.sight + bonus", al)
        self.assertIn("mzFogAlpha(sc, d, visited, tb)", func_body("function mzFogCells("))
        self.assertIn("mzTorchBonus()", func_body("function mzFogCells("))
        self.assertIn("d <= sight", al)
        self.assertIn("f.sight ? f.sight + mzTorchBonus() : 9", func_body("function mzMiniTick("))
        self.assertIn("MZ_FOG = { 1: { sight: 0, veil: 0.2 }, 2: { sight: 9", PIXEL)   # 既定 9/6/4 は変えない
        self.assertIn("sight: 6", PIXEL)
        self.assertIn("sight: 4", PIXEL)
        self.assertIn("if (!mzViewClear(now)) mzFogFill(mzFogCells(", func_body("function drawMzFogVeil("))   # 霧晴れは従来どおり
        # ズーム1（sight 0）は半径を変えない
        self.assertIn("f.sight ? f.sight + bonus : 0", al)

    def test_pickup_and_public_api(self):
        tick = func_body("function mzTorchTick(")
        self.assertIn("const r = G.mzTorch && G.mzTorch();\n  if (!r) return;", tick)
        self.assertIn("mzTorch.until = now + MZ_TORCH.ms", tick)   # 加算ではなく張り直し
        self.assertNotIn("until +", tick)
        self.assertIn("🔥 たいまつ ゲット！ +${r.pts}pt（${MZ_TORCH.ms / 1000}秒間 ひろく 見えるよ）", tick)
        self.assertIn("grainSound()", tick)
        self.assertIn("mzFx.push", tick)
        self.assertIn("mzTorch.cx = mzTorch.cy = -1", tick)   # 取ったら湧き直す（所持中も次が出る）
        g = GAME[GAME.index("function mzTorch()"):]
        g = g[:g.index("\n}\n")]
        for k in ("gainPoints(MZ_TORCH_PTS)", "S.torchGot = (S.torchGot || 0) + 1", "save()", "track('maze_torch'", "return { pts: MZ_TORCH_PTS }"):
            self.assertIn(k, g)
        self.assertIn("const MZ_TORCH_PTS = 10;", GAME)
        self.assertRegex(GAME, r"mzEnergy, mzShoo, mzTorch,")   # window.nishioGo の公開リスト
        self.assertIn("torchGot: 0", GAME)

    def test_stat_rows_unchanged(self):
        # 取得回数は S.torchGot に保存するが、きろく行は増やさない（STAT_PI と行数の対応は16のまま）
        self.assertNotIn("S.torchGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index('].map(([k, v, u], i)')]
        self.assertEqual(pi.count(',') + 1, len(re.findall(r"\['[^']+', ", rows)))
        self.assertEqual(pi.count(',') + 1, 16)

    def test_reset_rules(self):
        self.assertRegex(PIXEL, r"mzTorchReset\(\);[^\n]*\n\s*mzMini\.seen\.clear\(\);")   # ゴール変更時
        self.assertRegex(PIXEL, r"!mazeOn\(\) && \(mzTorch\.sx >= 0 \|\| mzTorch\.until\)\) mzTorchReset\(\)")   # 迷路退出時
        self.assertIn("until: 0", func_body("function mzTorchReset("))

    def test_tag_and_flame(self):
        tag = func_body("function drawMzTorchTag(")
        self.assertIn("🔥 たいまつ あと${Math.ceil((mzTorch.until - now) / 1000)}秒　視界が ひろいよ", tag)
        self.assertIn("mzEnergy.lastCx >= 0) y0 +=", tag)   # エネルギーゲージと重ならない
        self.assertIn("mzTorch.until <= now", tag)           # 時間切れで消える
        self.assertIn("mzTorch.until <= now", func_body("function drawMzTorchFlame("))
        self.assertIn("mzTorchBonus() { return mzTorch.until > performance.now()", PIXEL)

    def test_state_hook(self):
        self.assertIn("torch: () => mzTorchState()", PIXEL)
        st = func_body("function mzTorchState(")
        for k in ("at:", "left:", "got:", "bonus:"):
            self.assertIn(k, st)

    def test_draw_order(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzTorch(" in l)
        self.assertLess(line.index("drawMzTorch("), line.index("drawMzFogVeil("))        # 立つたいまつは veil より前
        self.assertGreater(line.index("drawMzTorchFlame("), line.index("drawMzFogVeil("))  # 炎は veil より後
        self.assertGreater(line.index("drawMzTorchFlame("), line.index("drawMzChase("))    # 夕立雲と同じ側（もやの後）
        hud = next(l for l in PIXEL.splitlines() if "drawMzEnergyBar(w, dpr, now);" in l)
        self.assertLess(hud.index("drawMzEnergyBar("), hud.index("drawMzTorchTag("))
        self.assertLess(hud.index("drawMzTorchTag("), hud.index("drawMzMini("))

    def test_non_blocking(self):
        seg = PIXEL[PIXEL.index("// たいまつ（Legend of Grimrock"):PIXEL.index("// 手描き探索マップ")]
        for w in ("addEventListener", "confirm(", "alert(", "modal"):
            self.assertNotIn(w, seg)

    def test_syntax(self):
        for f in ("pixel.js", "game.js"):
            subprocess.run(["node", "--check", str(ROOT / "nishio-go" / f)], check=True)

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertIn("mzTorch", added)
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"抹茶.{0,6}20")
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
