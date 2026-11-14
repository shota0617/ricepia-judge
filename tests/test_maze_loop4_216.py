"""第4弾サイクル216：通しの critterSure が ときどき 落ちた（afterPanel 0）わけ と 確かめの そろえ。
田んぼの 知らせ（「🌾 田んぼ：まだ会っていない生きもの N」）は、きょうの 出会いが 5回（CRITTER_DAILY）に とどくと 出ない（critterLeft が null）。
通しでは 前の 確かめで きょうの 出会いが ふえて いて、5回に とどいた 回だけ「きろく を 閉じた あとの 1歩」でも 知らせが 出なかった（ゲームの きまり どおり）。
はかった：critterSure だけを きょうの 出会い 0・4・5 回で 走らせる と、main の 確かめは 5回 で underPanel 0・afterPanel 0（通しで 落ちた 中身と 同じ）、0・4回 は 通る。
直し（確かめ だけ）：はかる 前に きょうの 出会いと 手帳を 空に する（終わりに もとへ もどす。5回の ふたは 同じ 確かめの capped で 見る）。"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def block():
    i = PLAY.index("  R.checks.critterSure = await page.evaluate(")
    return PLAY[i:PLAY.index("\n  });\n", i)]


class CritterSureState216(unittest.TestCase):
    def test_day_and_book_cleared_before_panel_steps(self):
        """きろく の 開け閉めで 知らせを 見る 前に、きょうの 出会い（day.critters）と 手帳（st.critters）を 空に する"""
        b = block()
        reset = b.index("day.critters = 0; st.critters = {};")
        self.assertLess(reset, b.index("const underPanel = stepTold("))
        self.assertLess(reset, b.index("const afterPanel = stepTold("))
        self.assertIn("st.critters = Object.assign(book0 || {}, st.critters); day.critters = n0 || 0;", b)   # 終わりに もとへ

    def test_requirements_kept(self):
        """求めは ゆるめない：開いた まま 0・閉じた あと 1・入った 1歩めの 数・3歩め・100歩め・早出しなし・5回の ふた"""
        b = block()
        self.assertIn("underPanel === 0 && afterPanel === 1", b)
        self.assertIn("first === 3 && next === 100 && early === 0", b)
        self.assertIn("day.critters = 5; const capped = G.critterLeft('paddy');", b)

    def test_game_rule_unchanged(self):
        """ゲームの きまり（1日 5回・知らせは パネルの 間 出さない）は かえない"""
        self.assertIn("const CRITTER_DAILY = 5,", GAME)
        self.assertIn("if ((dayState().critters || 0) >= CRITTER_DAILY || !me) return null;", GAME)
        self.assertIn("if (!G.critterLeft || !active || worldMode || driving || mapCovered() || sightBusy()) return false;", PIX)

    def test_doc(self):
        self.assertIn("サイクル216", DOC)


if __name__ == "__main__":
    unittest.main()
