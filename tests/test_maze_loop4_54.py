# 第4弾サイクル54：コロコロの跡の間引きを横の合わせ技でも判断する（参考ゲーム：カルカソンヌ）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def count(a, b, w=1):
    return len(run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(%s,{w:%s}),s(%s,{w:%s})])" % (a, w, b, w)))


class Sideways(unittest.TestCase):
    def test_together_drops_old(self):
        self.assertEqual(count("0,-0.05,0.14,-0.05", "0,0.05,0.14,0.05"), 2)

    def test_thin_pair_exact(self):
        self.assertEqual(count("0,-0.05,0.14,-0.05", "0,0.05,0.14,0.05", 0.5), 2)

    def test_gap_kept(self):
        self.assertEqual(count("0,-0.05,0.14,-0.05", "0,0.2,0.14,0.2"), 3)

    def test_single_side_kept(self):
        self.assertEqual(len(run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(0,-0.05,0.14,-0.05,{w:1})])")), 2)

    def test_longitudinal_shifted_ignored(self):
        self.assertEqual(count("0,-0.05,0.14,-0.05", "0.06,0.05,0.2,0.05"), 3)

    def test_orthogonal_ignored(self):
        self.assertEqual(count("0,-0.05,0.14,-0.05", "0.07,-0.02,0.07,0.12"), 3)

    def test_single_exact_drops(self):
        self.assertEqual(len(run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(0,0,0.14,0,{w:1})])")), 1)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeNear(%s)" % v), [])

    def test_invalid_items_kept(self):
        out = run("r.dedupeNear([null,s(0,0,0.14,0),s('a',0,1,0),s(0,0,0,0),7])")
        self.assertEqual(len(out), 5)

    def test_input_unchanged(self):
        self.assertTrue(run("(()=>{const a=[s(0,0,0.14,0,{w:1}),s(0,-0.05,0.14,-0.05,{w:1}),s(0,0.05,0.14,0.05,{w:1})];const j=JSON.stringify(a);const o=r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===3&&o.length===2})()"))

    def test_no_forbidden_words(self):
        bad = [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20' + chr(0x25)]
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in bad:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
