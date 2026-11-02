# 第3弾サイクル18：迷路の中の さんぽエネルギー（Walkr の「歩くこと自体がエネルギーになる」）
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
GAME = (GO / 'game.js').read_text(encoding='utf-8')

RUN = r"""
const { fn } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(new Function(fn)()));
"""


def node(fn):
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run(['node', '-e', RUN], input=json.dumps({'fn': fn}), capture_output=True, text=True, cwd=tmp, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def block():
    a = PIXEL.index('const MZ_ENERGY = ')
    return PIXEL[a:PIXEL.index('function drawMzEnergyRing(')]


PRE = r"""
const MZ_K = 3;
let dirty = false, pts = 0, said = [], sounds = 0, calls = 0, ok = true;
const rp = { x: 1.5 * MZ_K, y: 1.5 * MZ_K }, roll = { happyT: 0 };
const mzFx = [];
const grainSound = () => { sounds++; };
const floatText = s => said.push(s);
const G = { mzEnergy: () => { if (!ok) return null; pts += 20; calls++; return { pts: 20 }; } };
const cell = (x, y) => { rp.x = (x + 0.5) * MZ_K; rp.y = (y + 0.5) * MZ_K; };
const walk = n => { for (let i = 0; i < n; i++) { cell(2 + i % 2, 1); mzEnergyTick(1000 + i); } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle18EnergyTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_constants(self):
        self.assertIn('const MZ_ENERGY = { need: 36, pts: 20 };', PIXEL)
        self.assertIn('const mzEnergy = { steps: 0, bursts: 0, burstT0: 0, lastCx: -1, lastCy: -1 };', PIXEL)

    def test_tick_wired_after_chase(self):
        self.assertIn('mzChaseTick(now); mzEnergyTick(now);', PIXEL)

    def test_public_api_connected(self):
        self.assertRegex(GAME, r'mzDino, mzChase, mzEnergy, mzShoo')
        self.assertIn('G.mzEnergy && G.mzEnergy()', PIXEL)
        self.assertIn("energy: () => ({ steps: mzEnergy.steps", PIXEL)
        self.assertIn("track('maze_energy'", GAME)
        self.assertIn('energyGot: 0', GAME)
        self.assertIn('S.energyGot = (S.energyGot || 0) + 1', GAME)

    def test_first_observation_not_counted_and_only_on_cell_change(self):
        r = self.run_js("mzEnergyTick(0); const a = mzEnergy.steps; mzEnergyTick(10); mzEnergyTick(20); const b = mzEnergy.steps; cell(2, 1); mzEnergyTick(30); const c = mzEnergy.steps; rp.x += 0.5; mzEnergyTick(40); return [a, b, c, mzEnergy.steps];")
        self.assertEqual(r, [0, 0, 1, 1])

    def test_full_gauge_pays_and_resets(self):
        r = self.run_js("mzEnergyTick(0); walk(36); return [mzEnergy.bursts, mzEnergy.steps, pts, calls, said, sounds, mzFx.length > 0, mzEnergy.burstT0];")
        self.assertEqual(r[:4], [1, 0, 20, 1])
        self.assertEqual(r[4], ['⚡ さんぽエネルギー 満タン！ +20pt'])
        self.assertEqual(r[5], 1)
        self.assertTrue(r[6])
        self.assertGreater(r[7], 0)

    def test_repeatable_and_guarded(self):
        r = self.run_js("mzEnergyTick(0); walk(72); const two = [mzEnergy.bursts, pts]; ok = false; walk(36); return [two, mzEnergy.bursts, mzEnergy.steps, pts];")
        self.assertEqual(r[0], [2, 40])
        self.assertEqual(r[1], 2)
        self.assertGreaterEqual(r[2], 36)   # 返値がなければバーストせず満タンのまま
        self.assertEqual(r[3], 40)
        self.assertIn('if (!r) return;', block())

    def test_bar_drawn_always_in_maze(self):
        h = PIXEL[PIXEL.index('function drawMzEnergyBar('):PIXEL.index('// びゅんパネル')]
        for t in ('⚡ ${', 'MZ_ENERGY.need', 'createLinearGradient', '#ffd84a', '#6fbf3a', 'mzViewShelfY', '1200'):
            self.assertIn(t, h)
        self.assertIn('drawMzViewPanorama(w, dpr, now); drawMzEnergyBar(w, dpr, now);', PIXEL)
        self.assertNotIn('さんぽエネルギー ${', h)   # 文章ラベルは 描かない（サイクル25）

    def test_burst_ring_around_hero(self):
        h = PIXEL[PIXEL.index('function drawMzEnergyRing('):PIXEL.index('function drawMzEnergyBar(')]
        self.assertIn('mzOn(rp.x, rp.y)', h)
        self.assertIn('ctx.arc(', h)
        self.assertIn('1200', h)
        self.assertIn('drawMzEnergyRing(ox, oy, T, now);', PIXEL)

    def test_reset_on_exit_and_carry_on_goal_change(self):
        self.assertIn('if (!mazeOn() && mzEnergy.lastCx >= 0) mzEnergyReset();', PIXEL)
        self.assertIn('    mzChaseReset();   // 夕立雲も 迷路（ゴール）ごとに はじめから\n    mzEnergyRebase();', PIXEL)
        self.assertIn('function mzEnergyRebase()', PIXEL)
        r = self.run_js("mzEnergyTick(0); walk(10); mzEnergyReset(); return [mzEnergy.steps, mzEnergy.lastCx, mzEnergy.bursts];")
        self.assertEqual(r, [0, -1, 0])
        r2 = self.run_js("mzEnergyTick(0); walk(10); mzEnergyRebase(); return [mzEnergy.steps, mzEnergy.lastCx];")
        self.assertEqual(r2, [10, -1])

    def test_record_row_matches_stat_pi(self):
        self.assertIn("['さんぽエネルギー満タン', S.energyGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index('].map(([k, v, u], i)')]
        self.assertEqual(pi.count(',') + 1, len(re.findall(r"\['[^']+', ", rows)))
        self.assertEqual(pi.count(',') + 1, 16)

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
