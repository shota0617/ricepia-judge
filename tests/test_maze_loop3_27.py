"""第3弾サイクル27：きろくの完成（保存済みの迷路ボーナス達成回数5行をきろくに出す。STAT_PI は21件）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


class Record(unittest.TestCase):
    def setUp(self):
        i = GAME.index("const STAT_PI = [")
        self.pi = re.findall(r"'([a-z]+)'", GAME[i:GAME.index("];", i)])
        self.rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index("].map(([k, v, u], i)")]

    def test_new_rows(self):
        for k, g in (("たいまつを とった", "torchGot"), ("おとも旅団 完成", "brigadeGot"), ("ぜんぶ浄化", "purifyGot"),
                     ("救助完了", "rescueGot"), ("回転キューブ 完成", "cubeGot")):
            self.assertIn(f"['{k}', S.{g} || 0, '回']", self.rows)

    def test_stat_pi_matches_rows(self):
        self.assertEqual(len(self.pi), 21)
        self.assertEqual(len(self.pi), len(re.findall(r"\['[^']+', ", self.rows)))
        self.assertEqual(self.pi[16:], ["fire", "face", "star", "medal", "chest"])
        for n in set(self.pi):
            self.assertTrue((ROOT / f"nishio-go/art/stat-{n}.png").exists(), n)

    def test_single_map_for_both_views(self):
        i = GAME.index("].map(([k, v, u], i)")
        m = GAME[i:i + 700]
        self.assertIn("simple()", m)
        self.assertIn("STAT_PI[i]", m)
        self.assertIn('<div class="stat"><small>${k}</small>', m)

    def test_syntax_and_no_forbidden_words(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/game.js")], check=True)
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
