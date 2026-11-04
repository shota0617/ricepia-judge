# 第4弾サイクル53：コロコロの跡の間引きを合わせ技でも判断する（参考ゲーム：タングラム）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def count(a, b):
    return len(run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(%s,{w:1}),s(%s,{w:1})])" % (a, b)))


class Together(unittest.TestCase):
    def test_together_drops_old(self):
        self.assertEqual(count("-0.07,0,0.07,0", "0.07,0,0.21,0"), 2)

    def test_gap_kept(self):
        self.assertEqual(count("-0.07,0,0.03,0", "0.11,0,0.21,0"), 3)

    def test_small_interior_gap_kept(self):
        # Codex指摘: 途中の隙間0.03は LONG_TOL で埋めない（両端の端切れだけに使う）
        self.assertEqual(count("-0.04,0,0.055,0", "0.085,0,0.18,0"), 3)

    def test_side_shifted_candidate_ignored(self):
        self.assertEqual(count("-0.07,0,0.07,0", "0.07,0.1,0.21,0.1"), 3)

    def test_orthogonal_candidate_ignored(self):
        self.assertEqual(count("-0.07,0,0.07,0", "0.07,-0.07,0.07,0.07"), 3)

    def test_single_exact_drops(self):
        self.assertEqual(len(run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(0,0,0.14,0,{w:1})])")), 1)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeNear(%s)" % v), [])

    def test_invalid_items_kept(self):
        out = run("r.dedupeNear([null,s(0,0,0.14,0),s('a',0,1,0),s(0,0,0,0),7])")
        self.assertEqual(len(out), 5)

    def test_input_unchanged(self):
        self.assertTrue(run("(()=>{const a=[s(0,0,0.14,0,{w:1}),s(-0.07,0,0.07,0,{w:1}),s(0.07,0,0.21,0,{w:1})];const j=JSON.stringify(a);const o=r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===3&&o.length===2})()"))

    def test_no_forbidden_words(self):
        bad = [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20' + chr(0x25)]
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in bad:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
