# にしおサイクル134：はじめての ゴールまでは カラス・かかし・ばねを 湧かせない（最初の 1分）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIXEL = (ROOT / 'nishio-go' / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


FIRST = PIXEL[PIXEL.index('const cubeFirstGoal = '):PIXEL.index('\n', PIXEL.index('const cubeFirstGoal = '))]
COMMON = ("const MZ_K = 3;let dirty = false;const G = { toast() {} };const rp = { x: 4.5, y: 4.5 };"
          "const mapCovered = () => false;const howtoEl = { hidden: true };const sightBusy = () => false;"
          "const mzType = () => 1;const mzGrainAt = () => false;const riceSay = () => {};const grainSound = () => {};")


def run(kind, goals):
    ls = "const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);" % (json.dumps(goals), json.dumps(goals))
    if kind == 'Spring':
        code = (COMMON + ls + "const MZ_SPRING_MS = 12000;const mzScare = { on: false };"
                "const mzSpring = { cx: 0, cy: 0, on: false, t0: 0, until: 0, next: 0, last: 0, got: 0 };"
                + FIRST + '\n' + grab_fn('mzSpringTick') +
                "let now = 1000;for (let i = 0; i < 6 && !mzSpring.on; i++) { mzSpringTick(now); now += 600; }"
                "console.log(JSON.stringify({ n: mzSpring.on ? 1 : 0 }))")
    else:
        code = (COMMON + ls + "const MZ_SCARE_MS = 9000;const mzScare = { on: false, cx: 0, cy: 0, t0: 0, until: 0, next: 0, told: false, got: 0 };"
                "const mzCrow = { list: [], next: 0, last: 0, shoo: 0 };"
                "const mzCrowOn = () => true;const mzHelpOn = () => false;const mzCrowSpawn = () => ({ cx: 9, cy: 9, nx: 9, ny: 9, t: 0, dx: 0, dy: 0 });"
                "const mzCrowStep = () => [0, 0];const mzCrowShoo = () => {};const mzFx = [];"
                + FIRST + '\n' + grab_fn('mzScareTick') + '\n' + grab_fn('mzCrowTick') +
                "let now = 1000;for (let i = 0; i < 8; i++) { mzCrowTick(now); now += 600; }"
                "console.log(JSON.stringify({ n: mzCrow.list.length, scare: mzScare.on ? 1 : 0 }))")
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class FirstMinute(unittest.TestCase):
    def test_no_crow_scare_before_first_goal(self):
        for g in (None, '0'):
            self.assertEqual(run('Crow', g), {'n': 0, 'scare': 0}, g)

    def test_crow_scare_after_first_goal(self):
        r = run('Crow', '1')
        self.assertGreater(r['n'], 0)
        self.assertEqual(r['scare'], 1)

    def test_no_spring_before_first_goal(self):
        for g in (None, '0'):
            self.assertEqual(run('Spring', g)['n'], 0, g)

    def test_spring_after_first_goal(self):
        self.assertEqual(run('Spring', '1')['n'], 1)

    def test_marker_comment(self):
        for fn in ('mzCrowTick', 'mzSpringTick'):
            self.assertIn('if (cubeFirstGoal()) return;   // にしおサイクル134', grab_fn(fn), fn)


if __name__ == '__main__':
    unittest.main()
