# 第4弾サイクル46：コロコロの跡の部分的な重なりも1回だけ塗る（参考ゲーム：ハウスフリッパー）
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


class DedupeNear(unittest.TestCase):
    def test_shifted_overlap_keeps_newest(self):
        self.assertEqual(run("r.dedupeNear([s(0,0,0.14,0),s(0.02,0.01,0.16,0.01)])"), [seg(0.02, 0.01, 0.16, 0.01)])

    def test_reverse_shifted_overlap_keeps_newest(self):
        self.assertEqual(run("r.dedupeNear([s(0,0,0.14,0),s(0.16,0.01,0.02,0.01)])"), [seg(0.16, 0.01, 0.02, 0.01)])

    def test_parallel_near_both_kept(self):
        v = [seg(0, 0, 0.14, 0), seg(0, 0.1, 0.14, 0.1)]
        self.assertEqual(run("r.dedupeNear(%s)" % json.dumps(v)), v)

    def test_crossing_both_kept(self):
        v = [seg(0, 0, 0.14, 0), seg(0.07, -0.07, 0.07, 0.07)]
        self.assertEqual(run("r.dedupeNear(%s)" % json.dumps(v)), v)

    def test_order_kept(self):
        v = [seg(0, 0, 0.14, 0), seg(5, 5, 5.14, 5), seg(0.02, 0.01, 0.16, 0.01)]
        self.assertEqual(run("r.dedupeNear(%s)" % json.dumps(v)), [v[1], v[2]])

    def test_not_chained(self):
        # 中点 0 / 0.06 / 0.12：真ん中は最新に落とされ、最古は残った最新とは遠いので残る
        out = run("r.dedupeNear([s(-0.07,0,0.07,0),s(-0.01,0,0.13,0),s(0.05,0,0.19,0)])")
        self.assertEqual(out, [seg(-0.07, 0, 0.07, 0), seg(0.05, 0, 0.19, 0)])

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}', 'undefined'):
            self.assertEqual(run("r.dedupeNear(%s)" % v), [])

    def test_invalid_items_kept_and_harmless(self):
        out = run("r.dedupeNear([null,s(0,0,0.14,0),s('a',0,1,0),s(NaN,0,1,0),s(0,0,0,0),s(0.02,0,0.16,0),7])")
        self.assertEqual(out, [None, {'x1': 'a', 'y1': 0, 'x2': 1, 'y2': 0}, {'x1': None, 'y1': 0, 'x2': 1, 'y2': 0}, seg(0, 0, 0, 0), seg(0.02, 0, 0.16, 0), 7])

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=[s(0,0,0.14,0),s(0.02,0,0.16,0)];const j=JSON.stringify(a);r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===2})()"), True)

    def test_exposed(self):
        self.assertEqual(run("typeof r.dedupeNear"), 'function')


class PixelSide(unittest.TestCase):
    src = (GO / 'pixel.js').read_text(encoding='utf-8')

    def test_near_after_dedupe(self):
        i = self.src.index('function drawRollPath')
        b = self.src[i:i + 6000]
        a, n = b.index('RT.dedupe ?'), b.index('segs = RT.dedupeNear(segs)')
        self.assertIn('if (RT.dedupeNear)', b)
        self.assertLess(a, n)
        self.assertLess(n, b.index('const bases'))
        self.assertLess(n, b.index('RT.ribbon(segs)'))


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
