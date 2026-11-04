# 第4弾サイクル48：コロコロの跡の横のはみ出しを残す（参考ゲーム：Lawn Mowing Simulator）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def rows(v):
    return [[round(s[k], 6) for k in ('x1', 'y1', 'x2', 'y2')] + [round(s['w'], 6) if 'w' in s else None] for s in v]


class Band(unittest.TestCase):
    def test_new_above(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0,{w:1}),s(0,0.05,0.14,0.05,{w:1})])")
        self.assertEqual(rows(out), [[0, -0.075, 0.14, -0.075, 0.25], [0, 0.05, 0.14, 0.05, 1]])

    def test_new_below(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0,{w:1}),s(0,-0.05,0.14,-0.05,{w:1})])")
        self.assertEqual(rows(out), [[0, 0.075, 0.14, 0.075, 0.25], [0, -0.05, 0.14, -0.05, 1]])

    def test_tiny_shift_no_band(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0,{w:1}),s(0,0.01,0.14,0.01,{w:1})])")
        self.assertEqual(rows(out), [[0, 0.01, 0.14, 0.01, 1]])

    def test_axial_and_band(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0,{w:1}),s(0.07,0.05,0.21,0.05,{w:1})])")
        self.assertEqual(rows(out), [[0, 0, 0.07, 0, 1], [0.07, -0.075, 0.14, -0.075, 0.25], [0.07, 0.05, 0.21, 0.05, 1]])

    def test_zero_shift_reverse(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0,{w:1}),s(0.14,0,0,0,{w:1})])")
        self.assertEqual(rows(out), [[0.14, 0, 0, 0, 1]])

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeSplit(%s)" % v), [])

    def test_invalid_items_kept(self):
        out = run("r.dedupeSplit([s(0,0,0,0),s('a',0,1,0),null,7,s(0,0,0.14,0),s(0,0.05,0.14,0.05)])")
        self.assertEqual(len(out), 6)
        self.assertEqual(out[2:4], [None, 7])
        self.assertAlmostEqual(out[4]['y1'], -0.075)

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=[s(0,0,0.14,0),s(0,0.05,0.14,0.05)];const j=JSON.stringify(a);r.dedupeSplit(a);return JSON.stringify(a)===j&&a.length===2})()"), True)

    def test_band_inherits_props(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0,{a:0.3,g:2,w:1}),s(0,0.05,0.14,0.05,{a:0.1,g:3,w:1})])")
        self.assertEqual((out[0]['a'], out[0]['g'], out[0]['w']), (0.3, 2, 0.25))


class Forbidden(unittest.TestCase):
    def test_no_forbidden_words(self):
        words = [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20' + chr(0x25)]
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in words:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
