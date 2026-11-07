"""第4弾サイクル85：れんさと時間で優劣をつけない（れんさの倍率ボーナスと、めいろの時間★計算を廃止）"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


class Loop85(unittest.TestCase):
    def test_chain_bonus_removed(self):
        self.assertNotIn("const CHAIN", GAME)
        self.assertNotIn("chainMult", GAME)
        self.assertNotIn("ch.bonus", GAME)
        self.assertNotIn("めぐりの れんさ ${", GAME)   # れんさボーナス行

    def test_chain_record_kept(self):
        m = re.search(r"function chainStep\(s, now\) \{.*?\n\}", GAME, re.S)
        self.assertIsNotNone(m)
        body = m.group(0)
        self.assertNotIn("bonus", body)
        self.assertIn("return { n: c.n };", body)
        self.assertIn("c.id !== s.id ? c.n + 1 : 1", body)
        self.assertIn("c.best = Math.max(c.best || 0, c.n)", body)
        self.assertNotIn("id: 'chain4'", GAME)   # サイクル91で達成バッジは撤去

    def test_guide_has_no_chain(self):
        self.assertNotIn("れんさ <b>", GAME)

    def test_maze_stars_removed(self):
        for w in ("mzPar", "mzStars", "MZ_WAY_MIN"):
            self.assertNotIn(w, PX)
        goal = re.search(r"return \{ sec, m: [^\n]*?warp: !!g\.warp \}", PX)
        self.assertIsNotNone(goal)
        for w in ("stars", "par:", "way"):
            self.assertNotIn(w, goal.group(0))
        for w in ("sec", "m:", "run:"):
            self.assertIn(w, goal.group(0))
        clk = re.search(r"clock: \(\) => \(mazeOn\(\)[^\n]*?\} : null\)", PX)
        self.assertIsNotNone(clk)
        self.assertIn("{ sec: (performance.now() - mzRt.t0) / 1000 }", clk.group(0))
        self.assertNotIn("stars", clk.group(0))

    def test_clock_kept(self):
        self.assertIn("function mzClock(now)", PX)
        self.assertIn("function mzClockFoot(dpr, now)", PX)

    def test_reference_comment(self):
        self.assertIn("Dordogne", GAME)
        self.assertIn("Dordogne", PX)

    def test_no_forbidden_words_added(self):
        d = subprocess.run(["git", "diff", "HEAD", "-U0", "--", "nishio-go/game.js", "nishio-go/pixel.js"], cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8", check=True).stdout
        add = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, add)


if __name__ == "__main__":
    unittest.main()
