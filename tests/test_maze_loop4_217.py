"""第4弾サイクル217：通しの rollFeel が ときどき 落ちた（かべに 押しつけた さいごの 1秒で ゆれ 0.43マス・速さ 2.4）わけ と 確かめの そろえ。
バネの わざ（とってから 12秒）の 間は、やわらかい 生け垣に 当たると 外へ 押しだされる（ゲームの きまり どおり）。前の 確かめで バネを とって いると、
押しつけた 先が 生け垣の とき はね続けて 落ちた。はかった（rollFeel だけ・同じ 所・各 5回）：バネ あり 2/5 落ちる・バネ なし 0/5。
直し（確かめ だけ）：押す 前に バネを 切り、終わりに もとの のこりを もどす。求め（止まる 3.5秒・さいごの 1秒で 0.02マス・速さ 0.2）は かえない。"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def block():
    i = PLAY.index("  R.checks.rollFeel = await (async () => {")
    return PLAY[i:PLAY.index("\n  })();\n", i)]


class RollFeelSpring217(unittest.TestCase):
    def test_spring_off_before_push_and_restored(self):
        b = block()
        off = b.index("M.springOn(0); return left;")
        self.assertLess(off, b.index("await page.keyboard.down(open[0]);"))
        self.assertLess(off, b.index("await page.keyboard.down(wall[0]);"))
        self.assertGreater(b.index("nishioPixel.maze.springOn(left)"), b.index("await page.keyboard.up(wall[0]);"))

    def test_requirements_kept(self):
        b = block()
        self.assertIn("dbg.spread < 0.02 && dbg.vmax < 0.2", b)
        self.assertIn("stopped && stopS <= 3.5", b)

    def test_game_rule_unchanged(self):
        self.assertIn("const MZ_SPRING_MS = 12000, MZ_SPRING_E = 1.3;", PIX)

    def test_doc(self):
        self.assertIn("サイクル217", DOC)


if __name__ == "__main__":
    unittest.main()
