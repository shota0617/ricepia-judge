# にしおサイクル135：はじめての ゴールまでは さんぽエネルギーの 見せ方（満タンの 演出・ゲージ・オーラ・星屑・金の わ）を 出さない（最初の 1分）
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
ENERGY = PIXEL[PIXEL.index('const MZ_ENERGY = '):PIXEL.index('function mzEnergyTick(')]
GUARD = 'if (cubeFirstGoal()) return;   // にしおサイクル135'


def run(goals):
    ls = "const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);" % (json.dumps(goals), json.dumps(goals))
    code = ("const MZ_K = 3;let dirty = false, pts = 0, said = [], sounds = 0, calls = 0;"
            "const rp = { x: 4.5, y: 4.5 }, roll = { happyT: 0 };const mzFx = [];"
            "const grainSound = () => { sounds++; };const floatText = s => said.push(s);"
            "const G = { mzEnergy: () => { pts += 20; calls++; return { pts: 20 }; } };"
            + ls + FIRST + '\n' + ENERGY + grab_fn('mzEnergyTick') +
            "mzEnergyTick(0);for (let i = 0; i < 36; i++) { rp.x = (2 + i % 2 + 0.5) * MZ_K; rp.y = 1.5 * MZ_K; mzEnergyTick(1000 + i); }"
            "console.log(JSON.stringify({ said: said.length, sounds, fx: mzFx.length, happy: roll.happyT, t0: mzEnergy.burstT0,"
            " pts, calls, bursts: mzEnergy.bursts, steps: mzEnergy.steps }))")
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class FirstMinute(unittest.TestCase):
    def test_silent_record_before_first_goal(self):
        for g in (None, '0'):
            self.assertEqual(run(g), {'said': 0, 'sounds': 0, 'fx': 0, 'happy': 0, 't0': 0,
                                      'pts': 20, 'calls': 1, 'bursts': 1, 'steps': 0}, g)

    def test_full_show_after_first_goal(self):
        r = run('3')
        self.assertEqual((r['said'], r['sounds'], r['fx'], r['happy'], r['pts'], r['bursts']), (1, 1, 24, 1.2, 20, 1))
        self.assertGreater(r['t0'], 0)

    def test_draw_guards(self):
        for fn in ('drawMzEnergyBar', 'drawMzEnergyAura', 'drawMzEnergyStars', 'drawMzEnergyRing'):
            lines = grab_fn(fn).split('\n')
            self.assertTrue(lines[1].strip().startswith(GUARD), fn)

    def test_tick_marker(self):
        self.assertIn(GUARD, grab_fn('mzEnergyTick'))


if __name__ == '__main__':
    unittest.main()
