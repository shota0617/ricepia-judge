# 第4弾サイクル43：狭い地区の境の色を平均で溶け合わせる（参考ゲーム：Chicory）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
A, B, C = '0,0,0', '100,200,254', '200,100,0'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def smooth(v):
    return run("r.smoothColors(%s)" % json.dumps(v))


class Overlap(unittest.TestCase):
    def test_average(self):
        self.assertEqual(smooth([A, B, C]), ['25,50,64', '88,138,159', '113,150,159'])

    def test_single_boundary_unchanged(self):
        self.assertEqual(smooth([A, A, A, B, B, B]), [A, A, '25,50,64', '50,100,127', '75,150,191', B])

    def test_distant_boundaries_unchanged(self):
        out = smooth([A, A, A, B, B, B, B, C, C, C])
        self.assertEqual(out, [A, A, '25,50,64', '50,100,127', '75,150,191', B, '125,175,191', '150,150,127', '175,125,64', C])

    def test_edge_cases(self):
        self.assertEqual(smooth(['1,2,3'] * 3), ['1,2,3'] * 3)
        for v in ('null', '"x"', '5', '{}'):
            self.assertEqual(run("r.smoothColors(%s)" % v), [])
        self.assertEqual(smooth(['x', 'x', 'y']), ['x', 'x', 'y'])
        self.assertEqual(run("r.smoothColors([null,'0,0,0',7])"), [None, '0,0,0', 7])

    def test_input_unchanged(self):
        self.assertEqual(run("(()=>{const a=['0,0,0','100,200,254','200,100,0'];r.smoothColors(a);return a})()"), [A, B, C])


class Diff(unittest.TestCase):
    def test_no_forbidden(self):
        d = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307C) + chr(12367), chr(12384) + chr(12395), chr(32004) + '20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
