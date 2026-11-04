# 第4弾サイクル51：コロコロの跡の間引きを両端で判断する（参考ゲーム：Farming Simulator）
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


def tilted(deg):
    a = math.radians(deg)
    h = 0.07
    c, sn = math.cos(a), math.sin(a)
    return "s(%r,%r,%r,%r)" % (0.07 - h * c, -h * sn, 0.07 + h * c, h * sn)


def kept(old_y, old_w, new_y, new_w):
    return len(run("r.dedupeNear([s(0,%s,0.14,%s,{w:%s}),s(0,%s,0.14,%s,{w:%s})])" % (old_y, old_y, old_w, new_y, new_y, new_w)))


class EndsAware(unittest.TestCase):
    def test_parallel_same_width_drops_old(self):
        out = run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(0.02,0.01,0.16,0.01,{w:1})])")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['y1'], 0.01)

    def test_tilt_25_kept(self):
        self.assertEqual(len(run("r.dedupeNear([s(0,0,0.14,0),%s])" % tilted(25))), 2)

    def test_tilt_8_dropped(self):
        out = run("r.dedupeNear([s(0,0,0.14,0),%s])" % tilted(8))
        self.assertEqual(len(out), 1)

    def test_thin_old_boundaries(self):
        self.assertEqual(kept(-0.06, 0.25, 0, 1), 1)
        self.assertEqual(kept(-0.09, 0.25, 0, 1), 2)

    def test_thick_old_not_dropped_by_thin_new(self):
        self.assertEqual(kept(0, 1, 0, 0.25), 2)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeNear(%s)" % v), [])

    def test_invalid_items_kept(self):
        out = run("r.dedupeNear([null,s(0,0,0.14,0),s('a',0,1,0),s(NaN,0,1,0),s(0,0,0,0),s(0.02,0,0.16,0),7])")
        self.assertEqual(len(out), 6)
        self.assertEqual(out[0], None)
        self.assertEqual(out[-1], 7)

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=[s(0,0,0.14,0,{w:0.25}),s(0,0.02,0.14,0.02,{w:1})];const j=JSON.stringify(a);r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===2})()"), True)


class Forbidden(unittest.TestCase):
    def test_no_forbidden_words_in_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        for w in words:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
