"""第4弾サイクル205：下の札の 行き先は「場所（人）」の 順で 出す（最初の1分・狭い画面でも 場所が 読める）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")


def fn(name):
    i = GAME.index("function %s(" % name)
    return GAME[i:GAME.index("\n}\n", i) + 2]


def run(arg):
    code = fn("guideDispName") + "console.log(JSON.stringify(%s));" % arg
    return json.loads(subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout)


class GuideDispName205(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "game.js")]).returncode, 0)

    def test_swap(self):
        self.assertEqual(run("guideDispName({kind:'npc',name:'観光ボランティアガイドさん（西尾城跡）'})"), "西尾城跡（観光ボランティアガイドさん）")

    def test_unchanged(self):
        self.assertEqual(run("guideDispName({kind:'spot',name:'西尾市歴史公園（西尾城跡）'})"), "西尾市歴史公園（西尾城跡）")
        self.assertEqual(run("guideDispName({kind:'npc',name:'米屋さん'})"), "米屋さん")
        self.assertEqual(run("[guideDispName(null), guideDispName({kind:'npc'}), guideDispName({kind:'npc',name:''})]"), ["", "", ""])

    def test_deterministic_and_permutation(self):
        n = "駅前の学生（西尾駅）"
        r = run("[guideDispName({kind:'npc',name:'%s'}), guideDispName({kind:'npc',name:'%s'})]" % (n, n))
        self.assertEqual(r[0], r[1])
        self.assertEqual(len(r[0]), len(n))
        self.assertEqual(sorted(r[0]), sorted(n))

    def test_source(self):
        rg = fn("renderGuide")
        self.assertIn("esc(guideDispName(g))", rg)
        self.assertIn("esc(guideDispName(a))", rg)
        self.assertIn("${guideDispName(o)}", GAME)
        self.assertIn("toast(`🧭 ${guideDispName(S.guide)}へ 行こう`)", GAME)
        am = fn("arriveMsg")
        self.assertEqual(am.count("guideDispName(g)"), 2)
        self.assertIn("name: `${ref.n.name}（${ref.n.spotName}）`", GAME)
        self.assertIn("name: `${pickN.name}（${pickN.spotName}）`", GAME)
        self.assertIn("guideDispName, decideGuide,", GAME)

    def test_no_forbidden(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ["ぼ" + "く", "だ" + "に", "約" + "20%"]:
            self.assertNotIn(w, added)

    def test_scope(self):
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        files = {l[3:] for l in out.splitlines()}
        files |= set(subprocess.run(["git", "diff", "--name-only", "origin/main", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.split())
        self.assertLessEqual(files, {"nishio-go/game.js", "tests/test_maze_loop4_205.py"})


if __name__ == "__main__":
    unittest.main()
