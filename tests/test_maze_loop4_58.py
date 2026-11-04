# 第4弾サイクル58：コロコロの跡の間引きを四隅まで保証する（参考ゲーム：Patchwork）
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


def tilt(cx, cy, deg, w, length=0.14):
    a = math.radians(deg)
    dx, dy = math.cos(a) * length / 2, math.sin(a) * length / 2
    return "s(%r,%r,%r,%r,{w:%r})" % (cx - dx, cy - dy, cx + dx, cy + dy, w)


def n(*items):
    return len(run("r.dedupeNear([%s])" % ",".join(items)))


OLD = "s(0,0,0.14,0,{w:1})"


class Corners(unittest.TestCase):
    def test_tilted_pair_short_keeps_old(self):
        self.assertEqual(n(OLD, tilt(0.03, 0, 15, 1.6), tilt(0.07, 0, 15, 1.6)), 3)

    def test_tilted_pair_long_drops_old(self):
        self.assertEqual(n(OLD, tilt(0.03, 0, 15, 1.6, 0.20), tilt(0.07, 0, 15, 1.6, 0.20)), 2)

    def test_parallel_cover_drops(self):
        self.assertEqual(n(OLD, "s(0,0,0.07,0,{w:1})", "s(0.07,0,0.14,0,{w:1})"), 2)

    def test_single_exact_drops(self):
        self.assertEqual(n(OLD, OLD), 1)

    def test_cycle57_thick_tilted_single_kept(self):
        self.assertEqual(n(OLD, tilt(0.07, 0, 25, 1.6, 0.14)), 2)

    def test_cycle57_pairs(self):
        self.assertEqual(n(OLD, tilt(0.07, -0.05, 25, 1), tilt(0.07, 0.05, -25, 1)), 3)
        self.assertEqual(n(OLD, tilt(0.07, -0.05, 10, 1.6), tilt(0.07, 0.05, -10, 1.6)), 2)

    def test_bad_input(self):
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.dedupeNear(%s)" % v), [])

    def test_invalid_items_kept(self):
        self.assertEqual(len(run("r.dedupeNear([null,s(0,0,0.14,0),s('a',0,1,0),s(0,0,0,0),7])")), 5)

    def test_input_unchanged(self):
        self.assertTrue(run("(()=>{const a=[s(0,0,0.14,0,{w:1}),s(0,-0.05,0.14,-0.05,{w:1}),s(0,0.05,0.14,0.05,{w:1})];const j=JSON.stringify(a);const o=r.dedupeNear(a);return JSON.stringify(a)===j&&a.length===3&&o.length===2})()"))

    def test_no_forbidden_words(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20' + chr(0x25)]
        diff = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for l in added:
            for w in words:
                self.assertNotIn(w, l)
