# 第4弾サイクル40：コロコロの跡のなめらか仕上げ（参考ゲーム：Gris）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class MixRgb(unittest.TestCase):
    def test_midpoint(self):
        self.assertEqual(run("r.mixRgb('0,0,0','100,200,254',0.5)"), '50,100,127')

    def test_k_clamped(self):
        self.assertEqual(run("r.mixRgb('10,20,30','100,200,250',-1)"), '10,20,30')
        self.assertEqual(run("r.mixRgb('10,20,30','100,200,250',2)"), '100,200,250')

    def test_invalid_side(self):
        self.assertEqual(run("r.mixRgb('x','1,2,3',0.5)"), '1,2,3')
        self.assertEqual(run("r.mixRgb('1,2,3',null,0.5)"), '1,2,3')
        self.assertEqual(run("r.mixRgb('300,0,0','1,2,3',0.5)"), '1,2,3')

    def test_both_invalid_no_throw(self):
        for e in ["r.mixRgb('x','y',0.5)", 'r.mixRgb()', 'r.mixRgb({},[],NaN)', 'r.mixRgb(1,2,3)']:
            self.assertIsNone(run(e), e)


class Step(unittest.TestCase):
    def test_step_published(self):
        self.assertEqual(run('r.STEP'), 0.14)

    def test_segment_length_and_count(self):
        pts = '[{x:0,y:0,t:0},{x:1.1,y:0,t:1000}]'
        segs = run('r.segments(%s,1000)' % pts)
        self.assertEqual(len(segs), 8)
        for s in segs:
            self.assertLessEqual(((s['x2'] - s['x1']) ** 2 + (s['y2'] - s['y1']) ** 2) ** 0.5, 0.14 + 1e-9)

    def test_a_w_ranges_monotonic(self):
        segs = run('r.segments([{x:0,y:0,t:0},{x:1.1,y:0,t:500},{x:2.2,y:0,t:1000}],1000)')
        for s in segs:
            self.assertTrue(0 <= s['a'] <= 0.38)
            self.assertTrue(0.30 <= s['w'] <= 1)
        for p, q in zip(segs, segs[1:]):
            self.assertLessEqual(p['w'], q['w'])


class PixelStatic(unittest.TestCase):
    def body(self):
        i = PIXEL.index('function drawRollPath')
        return PIXEL[i:PIXEL.index('function drawWaterCorners')]

    def test_uses_mix_and_width_flush(self):
        b = self.body()
        self.assertIn('mixRgb', b)
        self.assertIn('0.03', b)   # サイクル41で太さの区切りを 0.15 から 0.03 へ
        self.assertIn('colorFor', b)
        self.assertIn("'255,246,220'", b)


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20' + chr(0x25)]:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
