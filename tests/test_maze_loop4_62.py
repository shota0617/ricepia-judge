# 第4弾サイクル62：斜め覆いの横の残りを前半・後半で保証し直す（参考ゲーム：Fruit Ninja）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
SRC = (GO / 'rolltrail.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


OLD = "s(0,0,0.14,0,{w:1,a:7})"
# 中心 (0.07,0)・25度・長さ0.14 の覆い（cos25×0.07, sin25×0.07）
CX, CY = 0.0634415, 0.0295833


def split(new):
    return run("r.dedupeSplit([%s,%s])" % (OLD, new))


def cover(x1, y1, x2, y2, w=1):
    return "s(%s,%s,%s,%s,{w:%s,a:9})" % (x1, y1, x2, y2, w)


class Tilt(unittest.TestCase):
    def check(self, new):
        out = split(new)
        self.assertEqual(len(out), 3)
        thin = sorted(out[:-1], key=lambda b: min(b['x1'], b['x2']))
        front, back = thin
        for b in thin:
            self.assertAlmostEqual(b['w'], 0.195, delta=0.005)
        self.assertAlmostEqual(front['y1'], 0.0805, delta=0.002)
        self.assertAlmostEqual(back['y1'], -0.0805, delta=0.002)
        self.assertAlmostEqual(min(front['x1'], front['x2']), 0.0066, delta=0.001)
        self.assertAlmostEqual(max(front['x1'], front['x2']), 0.07, delta=0.001)
        self.assertAlmostEqual(min(back['x1'], back['x2']), 0.07, delta=0.001)
        self.assertAlmostEqual(max(back['x1'], back['x2']), 0.1334, delta=0.001)

    def test_forward(self):
        self.check(cover(0.07 - CX, -CY, 0.07 + CX, CY))

    def test_reverse(self):
        self.check(cover(0.07 + CX, CY, 0.07 - CX, -CY))

    def test_off_center_not_cover(self):
        out = split(cover(0.07 - CX, 0.06 - CY, 0.07 + CX, 0.06 + CY))
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['x2'], 0.14)

    def test_thin_not_cover(self):
        out = split(cover(0.07 - CX, -CY, 0.07 + CX, CY, 0.1))
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['x2'], 0.14)


class Parallel(unittest.TestCase):
    def test_parallel_thin_unchanged(self):
        out = split("s(0.03,0,0.11,0,{w:0.3,a:9})")
        thin = [b for b in out if b['a'] == 7 and b['w'] < 1]
        self.assertEqual(len(thin), 2)
        for b in thin:
            self.assertAlmostEqual(b['x1'], 0.03, places=6)
            self.assertAlmostEqual(b['x2'], 0.11, places=6)


class Edge(unittest.TestCase):
    def test_non_array(self):
        self.assertEqual(run("r.dedupeSplit(null)"), [])

    def test_invalid_kept(self):
        out = run("r.dedupeSplit([s(NaN,0,1,0),s(0,0,0,0),%s])" % OLD)
        self.assertEqual(len(out), 3)

    def test_input_unchanged(self):
        r = run("(()=>{const a=[%s,%s];const b=JSON.stringify(a);r.dedupeSplit(a);return JSON.stringify(a)===b})()" % (OLD, cover(0.07 - CX, -CY, 0.07 + CX, CY)))
        self.assertTrue(r)


class Static(unittest.TestCase):
    def test_source(self):
        body = SRC[SRC.index('function dedupeSplit'):]
        self.assertIn('(b.lo + b.hi) / 2', body)
        self.assertIn('oLo', body)
        self.assertIn('sgLo', body)
        self.assertIn('サイクル62', body)

    def test_no_banned(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        banned = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        for line in diff.splitlines():
            if line.startswith('+') and not line.startswith('+++'):
                for w in banned:
                    self.assertNotIn(w, line)


if __name__ == '__main__':
    unittest.main()
