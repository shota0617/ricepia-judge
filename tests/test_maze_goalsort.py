import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'nishio-go' / 'game.js'

# game.js の実コード（dist・MAZE_NEAR・dNS/dEW・vertFirst・goalSort）をそのまま切り出し、Node で実際に並べて確かめる。
HARNESS = r"""
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const { distSrc, nearSrc, sortSrc, cases } = input;
const out = cases.map(c => {
  const me = { lat: 34.85, lng: 137.06 };
  const mazeVert = c.maze;
  const k = 111320, cosL = Math.cos(me.lat * Math.PI / 180);
  const pts = c.pts.map(([id, north, east]) => ({ id, lat: me.lat + north / k, lng: me.lng + east / (k * cosL) }));
  const f = new Function('me', 'mazeVert', distSrc + '\n' + nearSrc + '\n' + sortSrc + '\nreturn { goalSort, vertFirst };');
  const { goalSort, vertFirst } = f(me, mazeVert);
  return { order: pts.slice().sort(goalSort).map(p => p.id), vert: pts.filter(vertFirst).map(p => p.id) };
});
console.log(JSON.stringify(out));
"""


def extract(src):
    dist = re.search(r"function dist\(a, b\) \{.*?\n\}\n", src, re.S)
    near = re.search(r"^const MAZE_NEAR_MIN = \d+, MAZE_NEAR = \d+;$", src, re.M)
    sort = re.search(r"^  const dNS = .*?\n(?=  const far = )", src, re.S | re.M)
    return dist.group(0), near.group(0), sort.group(0)


class MazeGoalSortStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = GAME.read_text()

    def test_near_bounds(self):
        m = re.search(r"const MAZE_NEAR_MIN = (\d+), MAZE_NEAR = (\d+);", self.src)
        self.assertTrue(m)
        self.assertEqual((int(m.group(1)), int(m.group(2))), (350, 900))

    def test_vertfirst_definition(self):
        self.assertIn("const vertFirst = x => mazeVert && dist(me, x) <= MAZE_NEAR && dNS(x) >= dEW(x);", self.src)

    def test_goalsort_definition(self):
        self.assertIn("(a, b) => ((vertFirst(a) ? 0 : 1) - (vertFirst(b) ? 0 : 1)) || dist(me, a) - dist(me, b)", self.src)
        self.assertRegex(self.src, r"const goalSort = mazeVert\n\s+\? .*\n\s+: \(a, b\) => dist\(me, a\) - dist\(me, b\);")

    def test_alts_use_goalsort_in_maze(self):
        self.assertIn("const alts = (mazeVert ? rest.sort(goalSort) : rest).slice(0, 2)", self.src)

    def test_wide_pool_is_nearest_only(self):
        self.assertIn("mazeVert && !five ? [cands.slice().sort(goalSort)[0]] : cands", self.src)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class MazeGoalSortDynamicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        dist, near, sort = extract(GAME.read_text())
        cases = [
            # 0: めいろ。縦（遠め）が横（近め）より先、同じ向きの中は近い順
            {'maze': True, 'pts': [['e_near', 0, 300], ['n_far', 800, 100], ['n_near', 500, 100], ['e_mid', 50, 600]]},
            # 1: めいろ。縦が MAZE_NEAR の外にあるときは縦優先が効かず近い順
            {'maze': True, 'pts': [['n_out', 1500, 10], ['e_in', 0, 700], ['e_in2', 100, 800]]},
            # 2: めいろ。横しかないときは近い順
            {'maze': True, 'pts': [['e3', 20, 800], ['e1', 10, 400], ['e2', 30, 600]]},
            # 3: めいろ以外。縦横に関係なく近い順
            {'maze': False, 'pts': [['n_far', 800, 100], ['e_near', 0, 300], ['n_near', 500, 100], ['e_mid', 50, 600]]},
            # 4: 南北が東西とほぼ同じ（わずかに縦）なら縦として、近い順より先
            {'maze': True, 'pts': [['e', 0, 400], ['diag', 300, 299]]},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run(['node', '-e', HARNESS], input=json.dumps(
                {'distSrc': dist, 'nearSrc': near, 'sortSrc': sort, 'cases': cases}),
                capture_output=True, text=True, cwd=tmp, timeout=60)
        if r.returncode:
            raise RuntimeError(r.stderr)
        cls.out = json.loads(r.stdout)

    def test_vertical_first_then_near(self):
        self.assertEqual(self.out[0]['order'], ['n_near', 'n_far', 'e_near', 'e_mid'])
        self.assertEqual(self.out[0]['vert'], ['n_far', 'n_near'])

    def test_vertical_outside_maze_near_falls_back_to_near(self):
        self.assertEqual(self.out[1]['vert'], [])
        self.assertEqual(self.out[1]['order'], ['e_in', 'e_in2', 'n_out'])

    def test_horizontal_only_is_nearest_first(self):
        self.assertEqual(self.out[2]['vert'], [])
        self.assertEqual(self.out[2]['order'], ['e1', 'e2', 'e3'])

    def test_not_maze_is_nearest_first(self):
        self.assertEqual(self.out[3]['vert'], [])
        self.assertEqual(self.out[3]['order'], ['e_near', 'n_near', 'e_mid', 'n_far'])

    def test_slightly_vertical_counts_as_vertical(self):
        self.assertEqual(self.out[4]['order'][0], 'diag')


if __name__ == '__main__':
    unittest.main()
