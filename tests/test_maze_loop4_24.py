# 第4弾サイクル24：名所の大きな絵（近づくと大きく迫る）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
BL = (GO / 'biglandmark.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const b=globalThis.nishioBigLandmark;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'biglandmark.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Pure(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(run('[b.NEAR,b.FAR,b.MAX_SCALE]'), [3, 11, 2])

    def test_scale_bounds(self):
        self.assertEqual(run('b.scaleFor(3)'), 2)
        self.assertEqual(run('b.scaleFor(0)'), 2)
        self.assertEqual(run('b.scaleFor(-5)'), 2)
        self.assertEqual(run('b.scaleFor(11)'), 1)
        self.assertEqual(run('b.scaleFor(50)'), 1)
        self.assertEqual(run('b.scaleFor(7)'), 1.5)

    def test_monotonic_continuous(self):
        v = run('Array.from({length:81},(_,i)=>b.scaleFor(11-i*0.1))')
        for a, c in zip(v, v[1:]):
            self.assertGreaterEqual(c, a)
            self.assertLess(c - a, 0.02)
        self.assertTrue(all(1 <= x <= 2 for x in v))

    def test_invalid(self):
        for e in ['NaN', 'Infinity', '-Infinity', '"3"', 'null', 'undefined', '{}']:
            self.assertEqual(run('b.scaleFor(%s)' % e), 1, e)

    def test_is_big(self):
        for a in ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']:
            self.assertTrue(run('b.isBig({featured:true,area:"%s"})' % a), a)
            self.assertFalse(run('b.isBig({featured:true,shop:true,area:"%s"})' % a), a)
            self.assertFalse(run('b.isBig({featured:false,area:"%s"})' % a), a)
        self.assertFalse(run('b.isBig({featured:true,area:"anjo"})'))
        self.assertFalse(run('b.isBig({featured:true})'))
        for e in ['null', 'undefined', '5', '"x"', '{}']:
            self.assertFalse(run('b.isBig(%s)' % e), e)


class Wiring(unittest.TestCase):
    def test_html_before_pixel(self):
        self.assertIn('nishio-go/biglandmark.js', HTML)
        self.assertLess(HTML.index('biglandmark.js'), HTML.index('nishio-go/pixel.js'))

    def test_shared_helper_for_draw_and_hit(self):
        self.assertIn('const bigSpotSize = (s, spr, T, giant)', PIXEL)
        self.assertIn('const size = bigSpotSize(s, spr, T, giant);', PIXEL)
        self.assertIn('bigSpotSize(s, spriteOf(s), T, null) / 2', PIXEL)
        self.assertNotIn('const size = spotSize(s, spr, T);', PIXEL)
        self.assertNotIn('spotSize(s, spriteOf(s), T) / 2', PIXEL)

    def test_guards(self):
        m = re.search(r'const bigSpotSize = .*?\n\};\n', PIXEL, re.S)
        self.assertTrue(m)
        body = m.group(0)
        for k in ['!B', 'giant', 'mazeOn()', 'B.isBig(s)', 'B.scaleFor(']:
            self.assertIn(k, body)
        self.assertIn('bigHero.x = hp.x; bigHero.y = hp.y;', PIXEL)

    def test_reference_game_and_forbidden(self):
        self.assertIn('ワンダと巨像', Path(__file__).read_text(encoding='utf-8'))   # 参考ゲーム43番
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        for f in words:
            self.assertNotIn(f, BL)
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for f in words:
            self.assertNotIn(f, added)


if __name__ == '__main__':
    unittest.main()
