# 第4弾サイクル41：コロコロの跡の完全な連続化（参考ゲーム：Journey）
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


class SmoothColors(unittest.TestCase):
    def test_gradient(self):
        A, B = '0,0,0', '100,200,254'
        self.assertEqual(run("r.smoothColors(%s)" % json.dumps([A] * 3 + [B] * 3)), [A, A, '25,50,64', '50,100,127', '75,150,191', B])

    def test_same_color_unchanged(self):
        self.assertEqual(run("r.smoothColors(['1,2,3','1,2,3','1,2,3'])"), ['1,2,3'] * 3)

    def test_non_array(self):
        for v in ['null', '"abc"', '5', '{}', 'undefined']:
            self.assertEqual(run("r.smoothColors(%s)" % v), [])

    def test_invalid_colors_kept(self):
        self.assertEqual(run("r.smoothColors(['x','x','y'])"), ['x', 'x', 'y'])
        self.assertEqual(run("r.smoothColors(['0,0,0','bad','bad'])"), ['0,0,0', 'bad', 'bad'])
        self.assertEqual(run("r.smoothColors([null,'0,0,0',7])"), [None, '0,0,0', 7])

    def test_input_not_mutated(self):
        self.assertEqual(run("(()=>{const a=['0,0,0','0,0,0','100,100,100','100,100,100'];const b=r.smoothColors(a);return [a,b]})()"),
                         [['0,0,0', '0,0,0', '100,100,100', '100,100,100'], ['0,0,0', '25,25,25', '50,50,50', '75,75,75']])

    def test_edges_in_range(self):
        self.assertEqual(run("r.smoothColors(['0,0,0','100,100,100'])"), ['25,25,25', '50,50,50'])

    def test_existing_api_kept(self):
        self.assertEqual(run("[r.MAX,r.GAP,r.LIFE_MS,r.STEP]"), [24, 0.55, 12000, 0.14])
        self.assertEqual(run("r.mixRgb('0,0,0','100,200,254',0.5)"), '50,100,127')


class PixelStatic(unittest.TestCase):
    def body(self):
        i = PIXEL.index('function drawRollPath')
        return PIXEL[i:PIXEL.index('function drawWaterCorners')]

    def test_uses_smooth_and_fine_width_flush(self):
        b = self.body()
        self.assertIn('RT.smoothColors', b)
        self.assertEqual(b.count('RT.segments('), 1)
        self.assertIn('Math.abs(w - w0) > 0.03', b)
        self.assertNotIn('> 0.15', b)
        self.assertIn('colorFor', b)
        self.assertIn("'255,246,220'", b)
        self.assertIn('RT.mixRgb', b)   # smoothColors が無いときのフォールバック
        self.assertIn('segs[si].g !== segs[si - 1].g', b)   # 途切れた区間の間では混ぜない（Codex指摘の修正）


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20' + chr(0x25)]:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
