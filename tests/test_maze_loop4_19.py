# 第4弾サイクル19：M1 転がりの基本（移動距離と回転の同期。回転角＝距離÷半径）
import json
import math
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
RS_SRC = (GO / 'rollsync.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
CIRC = 2 * math.pi * 0.42


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rollsync.js')), expr)
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Numbers(unittest.TestCase):
    def test_one_turn(self):
        self.assertAlmostEqual(run('r.advance(%r,0)' % CIRC)['dAng'], 2 * math.pi, places=9)
        self.assertAlmostEqual(run('r.advance(0.42,0)')['dAng'], 1, places=9)
        self.assertAlmostEqual(run('r.advance(0,-0.84)')['dPitch'], -2, places=9)
        d = run('r.advance(0.42,0.42)')
        self.assertAlmostEqual(d['dAng'], 1, places=9)
        self.assertAlmostEqual(d['dPitch'], 1, places=9)

    def test_split_invariant(self):
        total = run('(()=>{let a=0;for(let i=0;i<26;i++)a+=r.advance(0.1,0).dAng;a+=r.advance(%r-2.6,0).dAng;return a})()' % CIRC)
        self.assertAlmostEqual(total, 2 * math.pi, places=9)

    def test_turns_and_frames(self):
        self.assertAlmostEqual(run('r.turnsFor(%r)' % CIRC), 1, places=9)
        self.assertEqual(run('r.frameFor(0)'), 0)
        self.assertEqual(run('r.frameFor(%r)' % CIRC), 0)
        self.assertEqual(run('r.frameFor(%r)' % (CIRC / 8 + 1e-9)), 1)

    def test_bad_input(self):
        self.assertEqual(run('r.advance(NaN,"a")'), {'dAng': 0, 'dPitch': 0, 'dist': 0})
        self.assertEqual(run('r.advance(undefined,null)'), {'dAng': 0, 'dPitch': 0, 'dist': 0})
        self.assertEqual(run('r.turnsFor("x")'), 0)
        self.assertEqual(run('r.frameFor(NaN)'), 0)
        for sc in ['0', '-3', 'NaN', '"2"']:
            self.assertAlmostEqual(run('r.advance(0.42,0,%s)' % sc)['dAng'], 1, places=9)

    def test_scale(self):
        self.assertAlmostEqual(run('r.advance(0.42,0,2)')['dAng'], 0.5, places=9)


class Static(unittest.TestCase):
    def test_pixel_uses_module(self):
        body = PIXEL[PIXEL.index('function riceSpin'):PIXEL.index('function settlePitch')]
        self.assertIn('nishioRollSync', body)
        self.assertIn('advance(', body)
        self.assertIn('frameFor', PIXEL)

    def test_sync_not_gated_by_speed(self):
        body = PIXEL[PIXEL.index('function riceSpin'):PIXEL.index('function settlePitch')]
        self.assertIn('!KP.spinAlways && d > 1e-9 && d < 3', body)
        self.assertNotIn('WADDLE_V', body)

    def test_html_script_order(self):
        self.assertIn('<script src="nishio-go/rollsync.js"></script>', HTML)
        self.assertLess(HTML.index('nishio-go/rollsync.js'), HTML.index('nishio-go/pixel.js'))

    def test_radius_matches(self):
        self.assertEqual(re.search(r'const RICE_R = ([\d.]+);', PIXEL).group(1), '0.42')
        self.assertEqual(re.search(r'const R = ([\d.]+);', RS_SRC).group(1), '0.42')

    def test_no_banned_words(self):
        banned = ['\u307c\u304f', '\u3060\u306b', '\u7d0420%']
        for name in ['rollsync.js']:
            for w in banned:
                self.assertNotIn(w, RS_SRC)
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go/pixel.js', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True).stdout
        for l in diff.splitlines():
            if l.startswith('+') and not l.startswith('+++'):
                for w in banned:
                    self.assertNotIn(w, l)


if __name__ == '__main__':
    unittest.main()
