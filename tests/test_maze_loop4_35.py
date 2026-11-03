# 第4弾サイクル35：特大の名所の絵も近づくと少し迫る（参考ゲーム：ワンダと巨像）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
BL = (GO / 'biglandmark.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const b=globalThis.nishioBigLandmark;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'biglandmark.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Pure(unittest.TestCase):
    def test_constant(self):
        m = run('b.MAX_GIANT')
        self.assertTrue(1 < m <= 1.5)
        self.assertEqual(m, 1.25)

    def test_bounds(self):
        self.assertEqual(run('b.giantScaleFor(0)'), 1.25)
        self.assertEqual(run('b.giantScaleFor(-5)'), 1.25)
        self.assertEqual(run('b.giantScaleFor(3)'), 1.25)
        self.assertEqual(run('b.giantScaleFor(11)'), 1)
        self.assertEqual(run('b.giantScaleFor(50)'), 1)
        self.assertEqual(run('b.giantScaleFor(7)'), 1.125)

    def test_monotonic(self):
        v = run('Array.from({length:81},(_,i)=>b.giantScaleFor(3+i*0.1))')
        for a, c in zip(v, v[1:]):
            self.assertLessEqual(c, a)

    def test_invalid(self):
        for e in ['"3"', 'NaN', 'Infinity', '-Infinity', 'null', 'undefined', '{}']:
            self.assertEqual(run('b.giantScaleFor(%s)' % e), 1, e)

    def test_normal_unchanged(self):
        self.assertEqual(run('[b.MAX_SCALE,b.scaleFor(3),b.scaleFor(7)]'), [2, 2, 1.5])

    def test_continuous_growth(self):
        sizes = run('Array.from({length:33},(_,i)=>6*b.giantScaleFor(11-i*0.25))')
        self.assertAlmostEqual(sizes[0], 6)
        self.assertAlmostEqual(sizes[-1], 7.5)
        for a, c in zip(sizes, sizes[1:]):
            self.assertGreaterEqual(c, a)
            self.assertLess(c - a, 0.1)   # 線形：0.25マスごとに 6*0.25/32 ほど


class Wiring(unittest.TestCase):
    def body(self):
        m = re.search(r'const bigSpotSize = .*?\n\};\n', PIXEL, re.S)
        self.assertTrue(m)
        return m.group(0)

    def test_giant_uses_giant_scale(self):
        b = self.body()
        self.assertIn('B.giantScaleFor(d)', b)
        self.assertIn('B.scaleFor(d)', b)
        self.assertIn('giant && !B.giantScaleFor', b)
        self.assertIn('return base', b)
        self.assertIn('mazeOn()', b)
        self.assertIn('B.isBig(s)', b)

    def test_anchor_kept(self):
        self.assertIn('giant ? 0.72 : 0.5', PIXEL)

    def test_forbidden(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'tests'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for f in words:
            self.assertNotIn(f, added)


if __name__ == '__main__':
    unittest.main()
