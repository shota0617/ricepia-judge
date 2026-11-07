"""第4弾サイクル91：れんさの達成バッジ（めぐりの達人）を外し、素のままに"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")

# 禁止表現（Unicode エスケープ表記。ここには直書きしない）
BANNED = ["\u307c\u304f", "\u3060\u306b", "\u7d0420%"]


class Loop91(unittest.TestCase):
    def test_badge_removed(self):
        self.assertNotIn("id: 'chain4'", GAME)
        self.assertNotIn("めぐりの達人", GAME)   # めぐりの達人

    def test_badge_pi_removed(self):
        m = re.search(r"BADGE_PI = \{.*?\};", GAME, re.S)
        self.assertIsNotNone(m)
        self.assertNotIn("chain4", m.group(0))

    def test_chain_record_kept(self):
        m = re.search(r"function chainStep\(s, now\) \{.*?\n\}", GAME, re.S)
        self.assertIsNotNone(m)
        self.assertIn("c.best = Math.max(c.best || 0, c.n)", m.group(0))

    def test_quiet_record_line_kept(self):
        line = next(l for l in GAME.split("\n") if "自己ベスト ${best.m" in l)
        self.assertIn("いちばんの れんさ ${S.chain.best}", line)

    def test_no_banned_in_added_lines(self):
        out = subprocess.run(["git", "diff", "HEAD~1", "HEAD", "--", "nishio-go"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in out.split("\n") if l.startswith("+") and not l.startswith("+++"))
        for w in BANNED:
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
