"""第4弾サイクル78：のんびり・平和への修正 第12弾「シェアで競わない」（参考：Kind Words）"""
import re
import unittest
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "nishio-go"
SHARE = (D / "share.js").read_text(encoding="utf-8")
GAME = (D / "game.js").read_text(encoding="utf-8")


def block(src, start, end):
    i = src.index(start)
    return src[i:src.index(end, i)]


class Loop78(unittest.TestCase):
    def test_share_url_has_no_vs(self):
        self.assertNotIn("vs=${", SHARE)
        self.assertNotIn("vst=${", SHARE)
        self.assertIn("kind === 'mzgoal' ? 'play=1&'", SHARE)

    def test_no_nsg_vs_or_friend_toast(self):
        self.assertNotIn("nsg_vs", SHARE)
        self.assertNotIn("友だちは", SHARE)
        self.assertNotIn("fmtSec", SHARE)
        self.assertIn("searchParams.delete('vs')", SHARE)
        self.assertIn("searchParams.delete('vst')", SHARE)

    def test_mzgoal_text_and_card(self):
        t = block(SHARE, "if (cur === 'mzgoal' && curMz)", "if (cur === 'koro'")
        c = block(SHARE, "} else if (cur === 'mzgoal' && curMz) {", "} else if (cur === 'koro'")
        for s in (t, c):
            self.assertNotIn("秒", s)
            self.assertNotIn("★", s)
            self.assertNotIn("☆", s)
            self.assertNotIn(".sec", s)
        self.assertIn("まで ついた", t)
        self.assertIn("mzRunLine", t)

    def test_koro_text_and_card(self):
        t = block(SHARE, "if (cur === 'koro' && curKoro)", "if (cur === 'voice'")
        c = block(SHARE, "} else if (cur === 'koro' && curKoro) {", "} else if (cur === 'voice'")
        for s in (t, c):
            for bad in ("コンボ", "はやさ", "1秒", "🏃", "れんさ", "k.combo", "k.speed", "k.chain"):
                self.assertNotIn(bad, s)
        self.assertIn("お米を ころころ", t)
        self.assertIn("お米を ころころ", c)
        g = SHARE[SHARE.index("curKoro = kind === 'koro'"):]
        g = g[:g.index("\n")]
        self.assertNotIn("combo", g)
        self.assertNotIn("nsg_mz_speed", g)

    def test_game_no_friend_vs(self):
        self.assertNotIn("friendVs", GAME)
        self.assertNotIn("friend_vs", GAME)
        self.assertNotIn("nsg_vs", GAME)
        self.assertNotIn("タイムに いどめる", GAME)


if __name__ == "__main__":
    unittest.main()
