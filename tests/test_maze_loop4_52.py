# 第4弾サイクル52：コロコロの跡の間引きを長手方向でも判断する（参考ゲーム：Train Valley）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;const s=(a,b,c,d,o)=>Object.assign({x1:a,y1:b,x2:c,y2:d},o||{});console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def kept(new):
    return len(run("r.dedupeNear([s(0,0,0.14,0,{w:1}),s(%s,{w:1})])" % new))


class Longitudinal(unittest.TestCase):
    def test_exact_drops_old(self):
        self.assertEqual(kept("0,0,0.14,0"), 1)

    def test_shift_002_drops_old(self):
        self.assertEqual(kept("0.02,0.01,0.16,0.01"), 1)

    def test_shift_003_kept(self):
        self.assertEqual(kept("0.03,0,0.17,0"), 2)

    def test_shift_006_kept(self):
        self.assertEqual(kept("0.06,0,0.20,0"), 2)

    def test_short_new_kept(self):
        self.assertEqual(kept("0.035,0,0.105,0"), 2)

    def test_long_new_drops_old(self):
        self.assertEqual(kept("-0.07,0,0.21,0"), 1)

    def test_dropped_middle_does_not_chain(self):
        # B is dropped by C (shift 0.02). A would be covered by B but not by C
        # (longitudinal shift 0.04), so A must survive: dropped items never drop others.
        out = run("r.dedupeNear([s(-0.01,0,0.13,0),s(0.01,0,0.15,0),s(0.03,0,0.17,0)])")
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['x1'], -0.01)
        self.assertEqual(out[1]['x1'], 0.03)

    def test_side_apart_kept(self):
        self.assertEqual(kept("0,0.1,0.14,0.1"), 2)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeNear(%s)" % v), [])

    def test_invalid_items_kept(self):
        out = run("r.dedupeNear([null,s(0,0,0.14,0),s('a',0,1,0),s(NaN,0,1,0),s(0,0,0,0),s(0.02,0,0.16,0),7])")
        self.assertEqual(len(out), 6)
        self.assertEqual(out[0], None)
        self.assertEqual(out[-1], 7)

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=[s(0,0,0.14,0),s(0.06,0,0.2,0)];const j=JSON.stringify(a);r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===2})()"), True)


class NoBannedWords(unittest.TestCase):
    def test_added_lines_clean(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20' + chr(0x25)):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
