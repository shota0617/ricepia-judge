# 第4弾サイクル61：真ん中を通る細い覆いでも横の残りを出す（参考ゲーム：Manifold Garden）
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


def split(new):
    return run("r.dedupeSplit([%s,%s])" % (OLD, new))


def ctr(b):
    return (b['y1'] + b['y2']) / 2


class Center(unittest.TestCase):
    def check(self, w, off, bw):
        out = split("s(0,0,0.14,0,{w:%s,a:9})" % w)
        self.assertEqual(len(out), 3)
        self.assertEqual(out[-1]['a'], 9)
        thin = out[:-1]
        for b in thin:
            self.assertEqual(b['a'], 7)
            self.assertAlmostEqual(b['w'], bw, delta=0.02)
        self.assertEqual(sorted(round(ctr(b), 2) for b in thin), [-off, off])

    def test_w03(self):
        self.check(0.3, 0.07, 0.35)

    def test_w06(self):
        self.check(0.6, 0.08, 0.2)

    def test_w1_single(self):
        self.assertEqual(len(split("s(0,0,0.14,0,{w:1,a:9})")), 1)

    def test_w09_single(self):
        self.assertEqual(len(split("s(0,0,0.14,0,{w:0.9,a:9})")), 1)

    def test_offset_case(self):
        out = split("s(0,0.05,0.14,0.05,{w:0.3,a:9})")
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(out[0]['w'], 0.6, delta=0.02)
        self.assertAlmostEqual(ctr(out[0]), -0.04, delta=0.005)

    def test_invalid_and_immutable(self):
        self.assertEqual(run("r.dedupeSplit(5)"), [])
        self.assertEqual(run("r.dedupeSplit([s(0,0,0,0),s('a',0,1,1)])"), [{'x1': 0, 'y1': 0, 'x2': 0, 'y2': 0}, {'x1': 'a', 'y1': 0, 'x2': 1, 'y2': 1}])
        self.assertEqual(run("(()=>{const a=[%s,s(0,0,0.14,0,{w:0.3})];const j=JSON.stringify(a);r.dedupeSplit(a);return JSON.stringify(a)===j&&a.length===2})()" % OLD), True)


class Source(unittest.TestCase):
    def test_condition(self):
        self.assertIn("(b.gHi - b.gLo) < 2 * hi0 - 1e-9", SRC)
        self.assertIn("第4弾サイクル61・Manifold Garden", SRC)

    def test_no_banned(self):
        d = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20' + chr(37)):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
