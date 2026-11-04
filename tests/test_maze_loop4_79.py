"""第4弾サイクル79：のんびり・平和への修正 第13弾「西尾めいろのシェアは達成度を載せない」（参考：Alba）"""
import unittest
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "nishio-go"
SHARE = (D / "share.js").read_text(encoding="utf-8")


def block(src, start, end):
    i = src.index(start)
    return src[i:src.index(end, i)]


class Loop79(unittest.TestCase):
    def setUp(self):
        self.t = block(SHARE, "if (cur === 'meiro' && curMeiro)", "if (cur === 'mzgoal'")
        self.c = block(SHARE, "} else if (cur === 'meiro' && curMeiro) {", "} else if (cur === 'mzgoal'")

    def test_text_has_no_progress(self):
        self.assertNotIn("面", self.t)
        self.assertNotIn("ぜんぶ", self.t)
        self.assertNotIn("金の米つぶ", self.t)
        self.assertNotIn("m.n}", self.t)
        self.assertNotIn("m.got", self.t)
        self.assertNotIn("m.grains", self.t)

    def test_card_has_no_progress(self):
        self.assertNotIn("面", self.c)
        self.assertNotIn("\U0001f33e", self.c)
        self.assertNotIn("m.n}", self.c)
        self.assertNotIn("m.got", self.c)
        self.assertNotIn("m.grains", self.c)

    def test_daily_and_arrival_kept(self):
        self.assertIn("きょうの めいろ", self.t)
        self.assertIn("きょうの めいろ", self.c)
        self.assertIn("まで ついた", self.t)
        self.assertIn("まで ついた", self.c)

    def test_alba_noted(self):
        self.assertIn("Alba", SHARE)


if __name__ == "__main__":
    unittest.main()
