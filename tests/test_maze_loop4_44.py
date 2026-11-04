# 第4弾サイクル44：コロコロの跡の重なりを1回だけ塗る（参考ゲーム：マリオペイント）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def seg(x1, y1, x2, y2, **o):
    return dict({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}, **o)


class Dedupe(unittest.TestCase):
    def test_example_reverse_overlap(self):
        self.assertEqual(run("r.dedupe([s(0,0,1,0),s(1,0,2,0),s(1,0,0,0)])"), [seg(1, 0, 2, 0), seg(1, 0, 0, 0)])

    def test_same_direction_overlap(self):
        self.assertEqual(run("r.dedupe([s(0,0,1,0),s(0,0,1,0),s(5,5,6,5)])"), [seg(0, 0, 1, 0), seg(5, 5, 6, 5)])

    def test_no_overlap_keeps_order(self):
        v = [seg(0, 0, 1, 0), seg(1, 0, 2, 0), seg(2, 0, 3, 0)]
        self.assertEqual(run("r.dedupe(%s)" % json.dumps(v)), v)

    def test_three_same_keeps_newest(self):
        out = run("r.dedupe([s(0,0,1,0,{a:.1,w:.3}),s(1,0,0,0,{a:.2,w:.5}),s(0,0,1,0,{a:.3,w:.9})])")
        self.assertEqual(out, [seg(0, 0, 1, 0, a=.3, w=.9)])

    def test_rounding_to_two_decimals(self):
        self.assertEqual(len(run("r.dedupe([s(0.001,0,1,0),s(0,0.004,1.003,0)])")), 1)
        self.assertEqual(len(run("r.dedupe([s(0,0,1,0),s(0,0,1.02,0)])")), 2)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}', 'undefined'):
            self.assertEqual(run("r.dedupe(%s)" % v), [])
        out = run("r.dedupe([null,s(0,0,1,0),s('a',0,1,0),s(NaN,0,1,0),s(0,0,1,0),7])")
        self.assertEqual(out, [None, {'x1': 'a', 'y1': 0, 'x2': 1, 'y2': 0}, {'x1': None, 'y1': 0, 'x2': 1, 'y2': 0}, seg(0, 0, 1, 0), 7])

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=[s(0,0,1,0),s(1,0,0,0)];const j=JSON.stringify(a);r.dedupe(a);return JSON.stringify(a)===j&&a.length===2})()"), True)

    def test_exposed(self):
        self.assertEqual(run("typeof r.dedupe"), 'function')


class PixelSide(unittest.TestCase):
    src = (GO / 'pixel.js').read_text(encoding='utf-8')

    def body(self):
        i = self.src.index('function drawRollPath')
        return self.src[i:i + 6000]

    def test_dedupe_used(self):
        b = self.body()
        self.assertIn('RT.dedupe', b)
        self.assertIn('const segs = RT.dedupe ? RT.dedupe(', b)

    def test_tip_circle_skipped_with_ribbon(self):
        b = self.body()
        self.assertIn('ribbonUsed = true', b)
        self.assertIn('a > 0 && !ribbonUsed', b)

    def test_empty_segs_not_ribbon(self):
        b = self.body()
        self.assertIn('quads && segs.length && quads.length === segs.length', b)


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
