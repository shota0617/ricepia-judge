# 第4弾サイクル60：跡の単独落としの幅のゆるみを WIDTH_TOL に分ける（参考ゲーム：Gorogoa）
import json
import re
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


def near(new):
    return run("r.dedupeNear([%s,%s])" % (OLD, new))


class WidthTol(unittest.TestCase):
    def test_slightly_thin_keeps_old(self):
        self.assertEqual(len(near("s(0,0,0.14,0,{w:0.92,a:7})")), 2)

    def test_boundary_drops(self):
        out = near("s(0,0,0.14,0,{w:0.95,a:7})")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['w'], 0.95)

    def test_same_width_drops(self):
        self.assertEqual(len(near("s(0,0,0.14,0,{w:1,a:7})")), 1)

    def test_thin_keeps(self):
        self.assertEqual(len(near("s(0,0,0.14,0,{w:0.85,a:7})")), 2)

    def test_shifted_drops(self):
        self.assertEqual(len(near("s(0.02,0.01,0.16,0.01,{w:1,a:7})")), 1)

    def test_invalid_and_immutable(self):
        self.assertEqual(run("r.dedupeNear(5)"), [])
        self.assertEqual(run("r.dedupeNear([s(0,0,0,0),s('a',0,1,1)])"), [{'x1': 0, 'y1': 0, 'x2': 0, 'y2': 0}, {'x1': 'a', 'y1': 0, 'x2': 1, 'y2': 1}])
        self.assertEqual(run("(()=>{const a=[%s,s(0,0,0.14,0,{w:1})];const j=JSON.stringify(a);r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===2})()" % OLD), True)


class Source(unittest.TestCase):
    def test_constants(self):
        self.assertRegex(SRC, r"const NEAR_TOL = 0\.01, LONG_TOL = 0\.02, WIDTH_TOL = 0\.05;")

    def test_usage(self):
        self.assertIn("(c.w - k.w) <= WIDTH_TOL", SRC)
        self.assertIn("HALF * (k.w - c.w) + NEAR_TOL", SRC)
        self.assertIn("let reach = -HALF * c.w + NEAR_TOL;", SRC)
        self.assertIn("reach >= HALF * c.w - NEAR_TOL", SRC)
        self.assertIn("sd <= HALF * k.w + NEAR_TOL", SRC)


class Forbidden(unittest.TestCase):
    def test_no_forbidden(self):
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++')]
        bad = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), '約20' + chr(0x25)]
        for l in added:
            for b in bad:
                self.assertNotIn(b, l)


if __name__ == '__main__':
    unittest.main()
