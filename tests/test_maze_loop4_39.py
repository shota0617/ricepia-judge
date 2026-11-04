# 第4弾サイクル39：コロコロの跡が地区色になる（参考ゲーム：de Blob）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def area_rgb():
    m = re.search(r'const AREA_RGB = \{(.*?)\};', GAME)
    return {k: ','.join(v.split(',')) for k, v in
            ((a, ','.join(re.findall(r'\d+', b))) for a, b in re.findall(r'(\w+):\s*\[([^\]]*)\]', m.group(1)))}


class AreaColor(unittest.TestCase):
    def test_matches_game_area_rgb(self):
        rgb = area_rgb()
        self.assertEqual(set(rgb), {'nishio', 'isshiki', 'kira', 'hazu', 'sakushima'})
        for k, v in rgb.items():
            self.assertEqual(run('r.colorFor(%s)' % json.dumps(k)), v)

    def test_invalid_returns_null(self):
        for e in ["'unknown'", "''", 'null', 'undefined', '5', '{}', '[]', "'toString'", "'__proto__'", "'constructor'"]:
            self.assertIsNone(run('r.colorFor(%s)' % e), e)

    def test_pixel_uses_both(self):
        i = PIXEL.index('function drawRollPath')
        body = PIXEL[i:PIXEL.index('function drawWaterCorners')]
        self.assertIn('colorFor', body)
        self.assertIn('landAreaOf', body)
        self.assertIn('255,246,220', body)
        self.assertIn('try', body)
        self.assertIn('srgb !== rgb', body)  # Codex指摘：区間の中でも地区色が変われば描き分ける

    def test_cycle38_segments_unchanged(self):
        v = run('r.segments([{x:0,y:0,t:1000},{x:1.1,y:0,t:2000}],3000)')
        self.assertTrue(all(0.30 <= s['w'] <= 1.0 and 0 <= s['a'] <= 0.38 for s in v))
        self.assertAlmostEqual(v[0]['w'], 0.30)
        self.assertAlmostEqual(v[-1]['w'], 1.0)
        self.assertEqual(run('[r.MAX,r.GAP,r.LIFE_MS]'), [24, 0.55, 12000])


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
