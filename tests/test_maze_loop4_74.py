"""第4弾サイクル74：ミニゲームに優劣をつけない（★の廃止・ごほうび一律20pt）"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GO = ROOT / "nishio-go"


def code(name):
    """コメント行・行末コメントを除いた本文"""
    out = []
    for line in (GO / name).read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("//"):
            continue
        out.append(re.sub(r"\s//.*$", "", line))
    return "\n".join(out)


def raw(name):
    return (GO / name).read_text(encoding="utf-8")


class TestMaze74(unittest.TestCase):
    def test_dankyu(self):
        c = code("dankyu.js")
        self.assertNotIn("stars()", c)
        self.assertNotIn("'★'.repeat", c)
        self.assertIn("G.miniBest('dankyu', lv, 1, 0, false)", c)
        self.assertIn("G.dankyuReward(lv)", c)

    def test_harvest(self):
        c = code("harvest.js")
        self.assertNotIn("stars", c)
        self.assertNotIn("'★'.repeat", c)
        self.assertIn("G.miniBest('harvest', lv, 1, 0, false)", c)
        self.assertIn("G.harvestReward(lv)", c)

    def test_harvest_record_only_on_success(self):
        # Codex指摘（サイクル74）: 失敗した回に「できた」記録が付かないこと
        c = code("harvest.js")
        self.assertIn("if (r.ok && G && G.miniBest) G.miniBest('harvest'", c)

    def test_hiryo(self):
        c = code("hiryoyama.js")
        for w in ("STARS", "starsOf", "★は"):
            self.assertNotIn(w, c)
        self.assertIn("ok = why === 'done'", c)
        self.assertIn("G.hiryoReward()", c)
        self.assertIn("G.miniBest('hiryo', 0, 1, 0, false)", c)

    def test_game_rewards(self):
        c = code("game.js")
        self.assertIn("const MINI_PTS = 20;", c)
        for fn in ("harvestReward(level)", "hiryoReward()", "dankyuReward(level)"):
            m = re.search(r"function " + re.escape(fn) + r" \{(.*?)\n\}", c, re.S)
            self.assertIsNotNone(m, fn)
            body = m.group(1)
            self.assertIn("const pts = MINI_PTS;", body)
            self.assertNotIn("5 *", body)
            self.assertNotIn("★", body)

    def test_cozy_grove(self):
        for f in ("dankyu.js", "harvest.js", "hiryoyama.js", "game.js"):
            self.assertIn("Cozy Grove", raw(f), f)

    def test_node_check(self):
        for f in ("dankyu.js", "harvest.js", "hiryoyama.js", "game.js"):
            r = subprocess.run(["node", "--check", str(GO / f)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
