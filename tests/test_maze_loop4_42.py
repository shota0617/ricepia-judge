# 第4弾サイクル42：コロコロの跡のリボン化（参考ゲーム：スプラトゥーン）
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def S(x1, y1, x2, y2, w=1):
    return {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'w': w}


class Ribbon(unittest.TestCase):
    def rib(self, segs):
        return run("r.ribbon(%s)" % json.dumps(segs))

    def test_shared_edge_and_half_widths(self):
        q = self.rib([S(0, 0, 1, 0, 0.30), S(1, 0, 2, 0, 1.00)])
        a, b = q
        for k in ('x', 'y'):
            self.assertAlmostEqual(a['r%s2' % k], b['r%s1' % k])
            self.assertAlmostEqual(a['l%s2' % k], b['l%s1' % k])
        # 向き (1,0) の法線は (0,1)：左 = +y
        self.assertAlmostEqual(a['ly1'], 0.03)
        self.assertAlmostEqual(a['ry1'], -0.03)
        self.assertAlmostEqual(a['ly2'], 0.065)
        self.assertAlmostEqual(b['ly2'], 0.10)
        self.assertAlmostEqual(b['ry2'], -0.10)

    def test_right_angle(self):
        a, b = self.rib([S(0, 0, 1, 0), S(1, 0, 1, 1)])
        # 中点の向き (1,1)/√2、法線 (-1,1)/√2。曲がり角でくびれないよう半幅は cos(45°) で割り戻され 0.10/√2×√2=0.10 の成分になる
        self.assertAlmostEqual(a['lx2'], 0.9)
        self.assertAlmostEqual(a['ly2'], 0.10)
        self.assertAlmostEqual(a['rx2'], 1.1)
        self.assertAlmostEqual(a['ry2'], -0.10)
        self.assertAlmostEqual(b['lx1'], a['lx2'])
        self.assertAlmostEqual(b['ry1'], a['ry2'])
        # 端は自分の向き：b の終点 (1,1) の向き (0,1)、法線 (-1,0)
        self.assertAlmostEqual(b['lx2'], 0.9)
        self.assertAlmostEqual(b['rx2'], 1.1)

    def test_chain_break_and_invalid(self):
        a, b, c = self.rib([S(0, 0, 1, 0), S(1.5, 0, 1.5, 1), S(3, 3, 3, 3)])
        self.assertAlmostEqual(b['lx1'], 1.4)   # 自分の向き (0,1) で始まる
        self.assertAlmostEqual(b['rx1'], 1.6)
        self.assertAlmostEqual(a['ly2'], 0.10)  # 前の鎖は自分の向きで終わる
        self.assertIsNone(c)

    def test_non_array_and_no_mutation(self):
        for v in ['null', '"abc"', '5', '{}', 'undefined']:
            self.assertEqual(run("r.ribbon(%s)" % v), [])
        segs = [S(0, 0, 1, 0, 0.5), S(1, 0, 1, 1, 'x'), None, S(0, 0, 0, 0)]
        before = json.dumps(segs, separators=(',', ':'))
        out = run("(()=>{const a=%s;const b=r.ribbon(a);return [JSON.stringify(a),b.length,b[2],b[3]]})()" % before)
        self.assertEqual(out[0], before)
        self.assertEqual(out[1:], [4, None, None])


class Drawing(unittest.TestCase):
    def test_pixel_uses_ribbon_with_stroke_fallback(self):
        i = PIXEL.index('function drawRollPath')
        body = PIXEL[i:PIXEL.index('function drawWaterCorners', i)]
        self.assertIn('RT.ribbon ? RT.ribbon(segs) : null', body)
        self.assertIn('quads.length === segs.length', body)   # 計算失敗時は従来描画へ戻る
        rib = body[body.index('if (quads'):body.index('} else {')]
        self.assertIn('ctx.fill()', rib)
        self.assertNotIn('stroke', rib)
        self.assertIn('ctx.stroke()', body)   # flush（従来の stroke 描画）が残っている
        self.assertIn('flush();', body[body.index('} else {'):])


class Forbidden(unittest.TestCase):
    def test_no_forbidden_words(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
