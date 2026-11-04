"""第4弾サイクル66：のんびり・平和への修正 第1弾「時間で競わせない」（参考：Alba: A Wildlife Adventure）"""
import re
import unittest
from pathlib import Path

SRC = (Path(__file__).resolve().parent.parent / "nishio-go" / "game.js").read_text(encoding="utf-8")


def fn(name):
    i = SRC.index("function " + name)
    return SRC[i:SRC.index("\n}\n", i) + 3]


class Loop66(unittest.TestCase):
    def test_chain_no_time_expiry(self):
        self.assertNotIn("CHAIN.ms", SRC)
        self.assertNotIn("chainLeft", SRC)
        body = fn("chainStep")
        self.assertNotIn("now - c.last", body)
        self.assertIn("c.id !== s.id ? c.n + 1 : 1", body)
        self.assertIn("c.best = Math.max(c.best || 0, c.n)", body)

    def test_no_30min_text(self):
        self.assertNotIn("30分以内", SRC)
        self.assertIn("ちがう名所を 4か所つづけて めぐる（めぐりの れんさ 4）", SRC)
        self.assertIn("`🔗 めぐりの れんさ ${ch.n} ×${chainMult(ch.n)} +${ch.bonus}`", SRC)

    def test_guide_has_no_countdown(self):
        self.assertNotIn("次の名所 → れんさ", SRC)
        self.assertIsNone(re.search(r"のこり\$\{Math\.ceil\(cl", SRC))
        self.assertIn("S.chain.n >= 2 && S.chain.last && ymd(new Date(S.chain.last)) === ymd() ? S.chain.n : 0", SRC)

    def test_maze_goal_no_speed_scoring(self):
        g = fn("mazeGoal")
        for bad in ("MZ_STAR_PTS", "MZ_WAY", "mzSpeed(", "friendVs(", "fmtSec", "はやい！", "まよわず"):
            self.assertNotIn(bad, g)
        self.assertNotIn("MZ_STAR_PTS", SRC)
        self.assertNotIn("MZ_WAY", SRC)
        self.assertIn("🏁 めいろ ゴール！${gl.m ?", g)
        self.assertIn("stars: 0", g)
        self.assertIn("🍵 おつかれさま", g)

    def test_mzspeed_records_nothing(self):
        self.assertIn("function mzSpeed() { return ''; }", SRC)
        self.assertNotIn("store.set('nsg_mz_speed'", SRC)

    def test_koro_rec_no_speed_best(self):
        self.assertNotIn("はやさ ベスト 1秒に", SRC)

    def test_reference_game_recorded(self):
        self.assertIn("Alba", SRC)


if __name__ == "__main__":
    unittest.main()
