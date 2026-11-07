"""第4弾サイクル80：のんびり・平和への修正 第14弾「きろくは比べない」（参考：TOEM）"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
G = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")


def block(src, start, end):
    i = src.index(start)
    return src[i:src.index(end, i)]


class Loop80(unittest.TestCase):
    def setUp(self):
        self.stats = block(G, "$('stats').innerHTML = [", "].map(")
        self.ending = block(G, "function showEnding()", "const seals")

    def test_no_longest_streak_row(self):
        self.assertNotIn("最長連続", self.stats)
        self.assertNotIn("最長連続", block(G, "const STAT_PI", "\n"))
        self.assertIn("連続日数", self.stats)

    def test_pic_count_matches_rows(self):
        pi = block(G, "const STAT_PI = [", "]")
        n_pi = len(re.findall(r"'[a-z]+'", pi))
        n_rows = len(re.findall(r"\['[^']+', ", self.stats))
        self.assertEqual(n_pi, n_rows)
        self.assertEqual(n_rows, 20)

    def test_ending_has_no_best(self):
        self.assertNotIn("いちばんの れんさ", self.ending)
        self.assertNotIn("100歩たんけんの自己ベスト", self.ending)
        self.assertIn("しらべた路地の行き止まり", self.ending)

    def test_records_kept(self):
        self.assertIn("function clearRecord()", G)
        self.assertIn("chain: (S.chain && S.chain.best) || 0, h100: S.h100best || 0", G)
        self.assertRegex(G, r"S\.streak\.max\s*=")
        self.assertIn("自己ベスト ${best.m", G)

    def test_toem_comment_once(self):
        self.assertEqual(len(re.findall(r"TOEM", G)), 1)

    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "game.js")], check=True)


if __name__ == "__main__":
    unittest.main()
