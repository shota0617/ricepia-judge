# 第4弾サイクル38：コロコロの跡の仕上げ（古い端ほど細く薄い）（参考ゲーム：大神）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


TWO = '[{x:0,y:0,t:1000},{x:1.1,y:0,t:2000}]'
NOW0 = '[{x:0,y:0,t:0},{x:2.5,y:0,t:0}]'


class Brush(unittest.TestCase):
    def test_w_range_and_monotone(self):
        v = run('r.segments(%s,3000)' % TWO)
        self.assertGreater(len(v), 2)
        self.assertTrue(all(0.30 <= s['w'] <= 1.0 for s in v))
        for a, c in zip(v, v[1:]):
            self.assertLessEqual(a['w'], c['w'] + 1e-12)
            self.assertLessEqual(a['a'], c['a'] + 1e-12)
        self.assertAlmostEqual(v[0]['w'], 0.30)
        self.assertAlmostEqual(v[-1]['w'], 1.0)

    def test_oldest_faint_newest_strong(self):
        v = run('r.segments(%s,0)' % NOW0)
        self.assertLessEqual(v[0]['a'], 0.04)
        self.assertGreaterEqual(v[-1]['a'], 0.35)

    def test_single_segment_w(self):
        v = run('r.segments([{x:0,y:0,t:0},{x:0.2,y:0,t:0}],0)')
        self.assertEqual(len(v), 1)
        self.assertEqual(v[0]['w'], 1)

    def test_invalid(self):
        for e in ['[]', 'null', '"abc"', '[null,{x:"a"}]']:
            self.assertEqual(run('r.segments(%s,5)' % e), [], e)
        self.assertEqual(run('r.segments(%s,NaN)' % TWO), [])


class Static(unittest.TestCase):
    def test_pixel_uses_w(self):
        body = PIXEL[PIXEL.index('function drawRollPath'):]
        body = body[:body.index('function drawWaterCorners')]
        self.assertIn('s.w', body)
        self.assertIn('wsum', body)
        self.assertIn('T * 0.20 *', body)
        self.assertIn('ctx.lineWidth = T * 0.20;', body)

    def test_no_forbidden_words(self):
        bad = [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20%']
        diff = subprocess.run(['git', 'diff', 'origin/main'], capture_output=True, text=True, check=True, cwd=ROOT).stdout
        added = [l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for l in added:
            for b in bad:
                self.assertNotIn(b, l)


if __name__ == '__main__':
    unittest.main()
