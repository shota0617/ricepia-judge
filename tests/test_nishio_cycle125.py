# にしおサイクル125：はじめての ゴールまでは 金の キューブの かけらと 上の 空の 棚を 出さない（最初の 1分、意味の 分からない 4つの 空の 立方体を 見せない）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def run(goals):
    code = ("const MZ_K = 3, MZ_CUBE = { n: 4, min: 6, reach: 18, pts: 5, done: 20, bigMs: 6000 };let dirty = false;const G = {};const mzCubeReveal = () => {};"
            "const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);const mzCubePick = () => [7, 7];"
            "const rp = { x: 4.5, y: 4.5 };const mzCube = { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 };"
            % (json.dumps(goals), json.dumps(goals))
            + PIXEL[PIXEL.index('const cubeFirstGoal = '):PIXEL.index('function mzCubeTick(')] + grab_fn('mzCubeTick') +
            "let now = 1000;for (let i = 0; i < 6 && mzCube.cx < 0; i++) { mzCubeTick(now); now += 600; }console.log(JSON.stringify({ cx: mzCube.cx, sx: mzCube.sx }))")
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Cube(unittest.TestCase):
    def test_no_cube_before_first_goal(self):
        for g in (None, '0'):
            self.assertEqual(run(g), {'cx': -1, 'sx': 1}, g)   # スタートは おぼえる・かけらは 出ない

    def test_cube_after_first_goal(self):
        self.assertEqual(run('1'), {'cx': 7, 'sx': 1})

    def test_shelf_hidden_before_first_goal(self):
        shelf = grab_fn('drawMzCubeShelf')
        self.assertIn('|| cubeFirstGoal()) return;', shelf[:400])
        self.assertIn('mzCube.sx >= 0 && !cubeFirstGoal() ? mzCubeShelfH(dpr) : 0', grab_fn('mzViewShelfY'))   # 空の 棚の ぶんの すきまも あけない
        t = grab_fn('mzCubeTick')
        self.assertLess(t.index('mzCube.next = now + 500;'), t.index('if (cubeFirstGoal()) return;'))


if __name__ == '__main__':
    unittest.main()
