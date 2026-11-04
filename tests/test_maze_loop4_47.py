# 第4弾サイクル47：コロコロの跡の重なりを切り分ける（参考ゲーム：パワーウォッシュシミュレーター）
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


def coords(v):
    return [[round(s[k], 6) for k in ('x1', 'y1', 'x2', 'y2')] for s in v]


class DedupeSplit(unittest.TestCase):
    def test_one_side_remains(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0),s(0.07,0,0.21,0)])")
        self.assertEqual(coords(out), [[0, 0, 0.07, 0], [0.07, 0, 0.21, 0]])

    def test_splits_in_two(self):
        out = run("r.dedupeSplit([s(0,0,0.28,0),s(0.07,0,0.21,0)])")
        self.assertEqual(coords(out), [[0, 0, 0.07, 0], [0.21, 0, 0.28, 0], [0.07, 0, 0.21, 0]])

    def test_axial_shift(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0),s(0.08,0,0.22,0)])")
        self.assertEqual(coords(out), [[0, 0, 0.08, 0], [0.08, 0, 0.22, 0]])

    def test_reverse_full_overlap_drops(self):
        out = run("r.dedupeSplit([s(0,0,0.14,0),s(0.14,0,0,0)])")
        self.assertEqual(out, [seg(0.14, 0, 0, 0)])

    def test_crossing_both_kept(self):
        v = [seg(0, 0, 0.14, 0), seg(0.07, -0.07, 0.07, 0.07)]
        self.assertEqual(run("r.dedupeSplit(%s)" % json.dumps(v)), v)

    def test_parallel_apart_both_kept(self):
        v = [seg(0, 0, 0.14, 0), seg(0, 0.1, 0.14, 0.1)]
        self.assertEqual(run("r.dedupeSplit(%s)" % json.dumps(v)), v)

    def test_small_side_shift_splits(self):
        out = run("r.dedupeSplit([s(0,0,0.28,0),s(0.07,0.01,0.21,0.01)])")
        self.assertEqual(len(out), 3)

    def test_untouched_is_same_object(self):
        self.assertEqual(run("(()=>{const a=s(0,0,0.14,0),b=s(5,5,5.14,5);const o=r.dedupeSplit([a,b]);return o[0]===a&&o[1]===b})()"), True)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}', 'undefined'):
            self.assertEqual(run("r.dedupeSplit(%s)" % v), [])

    def test_invalid_items_kept_and_harmless(self):
        out = run("r.dedupeSplit([s(0,0,0,0),s(0,0,0.14,0),s('a',0,1,0),s(NaN,0,1,0),null,s(0,0,0,0),7])")
        self.assertEqual(out, [seg(0, 0, 0, 0), seg(0, 0, 0.14, 0), {'x1': 'a', 'y1': 0, 'x2': 1, 'y2': 0}, {'x1': None, 'y1': 0, 'x2': 1, 'y2': 0}, None, seg(0, 0, 0, 0), 7])

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=[s(0,0,0.28,0,{a:0.3}),s(0.07,0,0.21,0)];const j=JSON.stringify(a);r.dedupeSplit(a);return JSON.stringify(a)===j&&a.length===2})()"), True)

    def test_pieces_inherit_props(self):
        out = run("r.dedupeSplit([s(0,0,0.28,0,{a:0.3,w:0.5,g:2}),s(0.07,0,0.21,0,{a:0.1,w:1,g:3})])")
        for p in out[:2]:
            self.assertEqual((p['a'], p['w'], p['g']), (0.3, 0.5, 2))

    def test_ends_exact(self):
        out = run("r.dedupeSplit([s(0.1,0.2,0.38,0.2),s(0.17,0.2,0.31,0.2)])")
        self.assertEqual((out[0]['x1'], out[0]['y1'], out[1]['x2'], out[1]['y2']), (0.1, 0.2, 0.38, 0.2))

    def test_exposed(self):
        self.assertEqual(run("typeof r.dedupeSplit"), 'function')


class PixelSide(unittest.TestCase):
    src = (GO / 'pixel.js').read_text(encoding='utf-8')

    def test_split_before_near(self):
        i = self.src.index('function drawRollPath')
        b = self.src[i:i + 6000]
        a, n = b.index('segs = RT.dedupeSplit(segs)'), b.index('segs = RT.dedupeNear(segs)')
        self.assertIn('if (RT.dedupeSplit)', b)
        self.assertLess(a, n)
        self.assertLess(n, b.index('const bases'))
        self.assertLess(n, b.index('RT.ribbon(segs)'))

    def test_pipeline_keeps_protruding_end(self):
        # 描画側の順（dedupe → dedupeSplit → dedupeNear）を通しても、はみ出した端が残ること
        out = run("(()=>{let v=[s(0,0,0.14,0),s(0.07,0,0.21,0)];v=r.dedupe(v);v=r.dedupeSplit(v);v=r.dedupeNear(v);return v})()")
        self.assertEqual(out, [seg(0, 0, 0.07, 0), seg(0.07, 0, 0.21, 0)])


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
