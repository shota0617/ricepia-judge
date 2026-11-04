# 第4弾サイクル59：斜め覆いでも切り分けを両端で厳密にする（参考ゲーム：SuchArt: Creative Space）
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def tilt(cx, cy, deg, w=1, length=0.14, rev=False):
    a = math.radians(deg)
    dx, dy = math.cos(a) * length / 2, math.sin(a) * length / 2
    p = [cx - dx, cy - dy, cx + dx, cy + dy]
    if rev:
        p = [p[2], p[3], p[0], p[1]]
    return "s(%r,%r,%r,%r,{w:%r,a:7})" % (p[0], p[1], p[2], p[3], w)


OLD = "s(0,0,0.14,0,{w:1,a:7})"


def split(*items):
    return run("r.dedupeSplit([%s])" % ",".join(items))


class SplitBothEnds(unittest.TestCase):
    def test_offcenter_tilt_not_cover(self):
        for rev in (False, True):
            out = split(OLD, tilt(0.07, 0.06, 25, rev=rev))
            self.assertEqual(len(out), 2)
            self.assertEqual(out[0], {'x1': 0, 'y1': 0, 'x2': 0.14, 'y2': 0, 'w': 1, 'a': 7})

    def test_centered_tilt_leaves_two_thin_bands(self):
        for rev in (False, True):
            out = split(OLD, tilt(0.07, 0, 25, rev=rev))
            self.assertEqual(len(out), 3)
            thin = [o for o in out if o['w'] < 0.5]
            self.assertEqual(len(thin), 2)
            ys = sorted(o['y1'] for o in thin)
            self.assertAlmostEqual(ys[0], -0.0805, places=3)
            self.assertAlmostEqual(ys[1], 0.0805, places=3)
            for o in thin:
                self.assertAlmostEqual(o['w'], 0.195, places=3)
                self.assertEqual(o['a'], 7)

    def test_thin_tilt_empty_guarantee_not_cover(self):
        # 保証区間が空になる細い傾いた覆い（w=0.1・25度）は、覆いに数えず古い帯が残る
        out = split(OLD, tilt(0.07, 0, 25, w=0.1))
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0], {'x1': 0, 'y1': 0, 'x2': 0.14, 'y2': 0, 'w': 1, 'a': 7})

    def test_parallel_unchanged(self):
        out = split(OLD, "s(0,0.05,0.14,0.05,{w:1,a:7})")
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(out[0]['y1'], -0.075, places=6)
        self.assertEqual(len(split(OLD, "s(0,0.06,0.14,0.06,{w:1})")), 2)
        self.assertEqual(len(split(OLD, OLD)), 1)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeSplit(%s)" % v), [])

    def test_invalid_items_kept(self):
        self.assertEqual(len(run("r.dedupeSplit([null,s(0,0,0.14,0),s('a',0,1,0),s(0,0,0,0),7])")), 5)

    def test_input_unchanged(self):
        self.assertTrue(run("(()=>{const a=[s(0,0,0.14,0,{w:1}),s(0.01,0.03,0.12,0.06,{w:1})];const j=JSON.stringify(a);const o=r.dedupeSplit(a);return JSON.stringify(a)===j&&a.length===2&&o.length>=1})()"))

    def test_no_forbidden_words(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20' + chr(0x25)]
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for l in added:
            for w in words:
                self.assertNotIn(w, l)
