"""第4弾サイクル81：明かりと見晴らしは急がせない（Eastshade）。たいまつ・見晴らし台の期限（秒）を廃止し、迷路の間ずっと続く形に。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


def one_line(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n", i)]


class NoDeadline(unittest.TestCase):
    def test_torch_has_no_time_limit(self):
        for w in ("MZ_TORCH.ms", "now + MZ_TORCH", "mzTorch.until", "clearUntil", "clearMs", "mzTorchLeft"):
            self.assertNotIn(w, PIXEL, w)
        torch = PIXEL[PIXEL.index("const MZ_TORCH"):PIXEL.index("function drawMzTorch(")]   # 無関係な 45000ms タイマー（カカシ・春・みち）とは 区別して たいまつの 区間だけ 見る
        self.assertNotIn("45000", torch)
        self.assertNotIn("45秒", torch)
        self.assertNotRegex(PIXEL, r"const MZ_TORCH = \{[^}]*\bms:")

    def test_view_has_no_time_limit(self):
        self.assertNotRegex(PIXEL, r"const MZ_VIEW = \{[^}]*clearMs")
        self.assertRegex(PIXEL, r"const MZ_VIEW = \{ min: 8, reach: 18, pts: 15, panoMs: 6000 \}")   # パノラマ帯の約6秒は維持
        self.assertNotRegex(PIXEL, r"mzView\.\w*[uU]ntil")
        self.assertNotIn("now + MZ_VIEW", PIXEL)

    def test_view_clear_lasts_for_the_maze(self):
        self.assertIn("function mzViewClear() { return mzView.done; }", PIXEL)
        self.assertNotIn("done: false, cx: -1, cy: -1, sx: -1, sy: -1, next: 0, panoAt: 0, clearUntil", PIXEL)
        self.assertIn("mzView.panoAt = now;", func_body("function mzViewTick("))

    def test_torch_held_until_maze_ends(self):
        self.assertIn("function mzTorchBonus() { return mzTorch.held ? MZ_TORCH.sight : 0; }", PIXEL)
        self.assertIn("function mzTorchLit() { return mzTorch.held ? 1 : 0; }", PIXEL)
        self.assertIn("held: false", func_body("function mzTorchReset("))
        self.assertIn("mzTorch.held = true", func_body("function mzTorchTick("))
        self.assertNotIn("= false", func_body("function mzTorchTick("))   # tick では失効させない


class PickupText(unittest.TestCase):
    def test_float_texts_have_no_seconds(self):
        t = func_body("function mzTorchTick(")
        self.assertIn("floatText(`🔥 たいまつ ゲット！ +${r.pts}pt（ひろく 見えるよ）`);", t)
        v = func_body("function mzViewTick(")
        self.assertIn("floatText(`🔭 見晴らし台に ついた！ +${r.pts}pt（もやが 晴れるよ）`);", v)
        for src in (t, v):
            fl = next(l for l in src.splitlines() if "floatText(" in l)
            self.assertNotRegex(fl, r"\d+\s*秒|/ 1000|\.ms")


class NoTags(unittest.TestCase):
    def test_tag_functions_removed(self):
        self.assertNotIn("drawMzTorchTag", PIXEL)
        self.assertNotIn("drawMzViewClearTag", PIXEL)
        self.assertNotIn("たいまつ あと", PIXEL)
        self.assertNotIn("見晴らし中 あと", PIXEL)

    def test_no_leftover_tag_offsets(self):
        self.assertNotIn("たいまつ札の", PIXEL)
        self.assertNotRegex(PIXEL, r"mzTorch\.until")
        self.assertNotRegex(PIXEL, r"else if \(mzViewClear\(now\)\) y0")   # 札が無いのに空白だけ残さない
        self.assertIn("function drawMzViewPanorama(", PIXEL)   # パノラマ帯は維持


class Held(unittest.TestCase):
    def test_no_next_torch_while_held(self):
        t = func_body("function mzTorchTick(")
        self.assertIn("if (mzTorch.held || now < mzTorch.next) return;", t)

    def test_flame_does_not_shrink(self):
        self.assertIn("function mzTorchFlameScale() { return mzTorch.held ? 1 : 0; }", PIXEL)
        f = func_body("function drawMzTorchFlame(")
        for w in ("smoke", "6000", "globalAlpha", "scale <= 0.25", "ctx.arc("):
            self.assertNotIn(w, f)
        self.assertIn("flick", f)   # ゆらめきは維持

    def test_test_ports(self):
        st = func_body("function mzTorchState(")
        self.assertIn("held: mzTorch.held", st)
        self.assertNotIn("left:", st)
        self.assertIn("bonus: mzTorchBonus()", st)
        for k in ("torch: () => mzTorchState()", "torchLit: () => mzTorchLit()", "torchFlame: () => mzTorchFlameScale()"):
            self.assertIn(k, PIXEL)


class Comments(unittest.TestCase):
    def test_eastshade_comment(self):
        torch = PIXEL[PIXEL.index("// たいまつ（Legend of Grimrock"):PIXEL.index("const MZ_TORCH")]
        view = PIXEL[PIXEL.index("// 見晴らし台（A Short Hike"):PIXEL.index("const MZ_VIEW")]
        self.assertIn("Eastshade", torch)
        self.assertIn("Eastshade", view)
        self.assertNotIn("45秒", torch)
        self.assertNotIn("30秒", view)


class Safety(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_forbidden_words_not_in_sections(self):
        seg = PIXEL[PIXEL.index("// たいまつ（Legend of Grimrock"):PIXEL.index("// おとも旅団")]
        seg += PIXEL[PIXEL.index("// 見晴らし台（A Short Hike"):PIXEL.index("// かくし宝箱")]
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%", "fillText", "riceSay", "addEventListener", "confirm("):
            self.assertNotIn(w, seg)


if __name__ == "__main__":
    unittest.main()
