# 第4弾サイクル50：コロコロの跡の間引きを幅で判断する（参考ゲーム：de Blob）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def kept(old_y, old_w, new_y, new_w):
    out = run("r.dedupeNear([s(0,%s,0.14,%s,{w:%s}),s(0,%s,0.14,%s,{w:%s})])" % (old_y, old_y, old_w, new_y, new_y, new_w))
    return len(out)


class WidthAware(unittest.TestCase):
    def test_same_width_drops_old(self):
        out = run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(0.02,0.01,0.16,0.01,{w:1})])")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['y1'], 0.01)

    def test_thin_old_covered_dropped(self):
        self.assertEqual(kept(-0.06, 0.25, 0, 1), 1)

    def test_thin_old_sticking_out_kept(self):
        self.assertEqual(kept(-0.09, 0.25, 0, 1), 2)

    def test_thick_old_not_dropped_by_thin_new(self):
        self.assertEqual(kept(0, 1, 0, 0.25), 2)

    def test_half_width_boundaries(self):
        self.assertEqual(kept(0, 0.5, 0.02, 1), 1)
        self.assertEqual(kept(0, 0.5, 0.07, 1), 2)

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

    def test_bad_width_treated_as_one(self):
        self.assertEqual(kept(0, "'x'", 0, -2), 1)


class Pipeline(unittest.TestCase):
    def test_thin_band_survives_full_pipeline(self):
        # 太い新しい跡からはみ出す細い帯は、dedupe → dedupeSplit → dedupeNear を通しても残る
        out = run("(()=>{let v=[s(0,0,0.14,0,{w:1}),s(0,0.05,0.14,0.05,{w:1})];v=r.dedupe(v);v=r.dedupeSplit(v);v=r.dedupeNear(v);return v})()")
        self.assertEqual(sorted(round(s['y1'], 6) for s in out), [-0.075, 0.05])


class Forbidden(unittest.TestCase):
    def test_no_forbidden_words(self):
        words = [chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + '20' + chr(0x25)]
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in words:
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
