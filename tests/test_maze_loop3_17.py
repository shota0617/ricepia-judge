# 第3弾サイクル17：迷路の中の夕立雲の にげきりラン（Zombies, Run! の「追いかけてくる何かから逃げきる」）
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
    a = PIXEL.index('const MZ_CHASE = ')
    return PIXEL[a:PIXEL.index('function drawMzChase(')]


# 12x12 マスの区域。外わくは壁。(5,1)-(5,9) は縦の壁（(5,10) だけ通れる）で、左右は下でしかつながらない。スタートは (1,1)
PRE = r"""
const MZ_R = 12, MZ_K = 3, MZ_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let dirty = false, pts = 0, said = [], sounds = 0, paidCalls = 0, on = true;
const rp = { x: 1.5 * MZ_K, y: 1.5 * MZ_K }, roll = { happyT: 0 };
const t = new Uint8Array(MZ_R * MZ_R);
for (let y = 1; y < MZ_R - 1; y++) for (let x = 1; x < MZ_R - 1; x++) t[y * MZ_R + x] = 1;
for (let y = 1; y <= 9; y++) t[y * MZ_R + 5] = 0;
const mzType = (x, y) => (x >= 0 && x < MZ_R && y >= 0 && y < MZ_R ? t[y * MZ_R + x] : -1);
const mzOpen = () => true;
const mzFx = [];
const mazeOn = () => on;
const mzRt = { gid: 'g1', warp: false, prev: null };
const grainSound = () => { sounds++; };
const floatText = s => said.push(s);
const G = { mzChase: () => { pts += 25; paidCalls++; return { pts: 25 }; } };
const adv = (a, b) => { for (let n = a; n <= b; n += 100) mzChaseTick(n); };
const cell = (x, y) => { rp.x = (x + 0.5) * MZ_K; rp.y = (y + 0.5) * MZ_K; };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle17ChaseTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    def test_cloud_starts_at_start_cell_after_leaving(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(1000);
          const stay = [mzChase.cx, mzChase.cy];
          cell(1, 2); mzChaseTick(2000);
          return { stay, at: [mzChase.cx, mzChase.cy], start: [mzChase.sx, mzChase.sy], next: mzChase.next };""")
        self.assertEqual(r['stay'], [-1, -1])
        self.assertEqual(r['at'], [1, 1])
        self.assertEqual(r['start'], [1, 1])
        self.assertEqual(r['next'], 8000)

    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    def test_cloud_never_crosses_wall(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 2); mzChaseTick(10);
          cell(9, 1); let bad = 0, now = 10;
          for (let i = 0; i < 40; i++) { adv(now + 100, now + 6000); now += 6000; if (mzChase.cx >= 0 && mzType(mzChase.cx, mzChase.cy) !== 1) bad++; }
          const way = mzChaseWay(1, 1, 9, 1);
          return { bad, len: way.length, via: way.some(c => c[0] === 5 && c[1] === 10), through: way.some(c => c[0] === 5 && c[1] >= 1 && c[1] <= 9) };""")
        self.assertEqual(r['bad'], 0)
        self.assertTrue(r['via'])
        self.assertFalse(r['through'])
        self.assertEqual(r['len'], 8 + 9 + 9 + 1)

    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    def test_no_bonus_after_caught(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 2); mzChaseTick(10); adv(110, 6110);
          mzRt.gid = 'g1';
          const a = mzChaseGoal('g1');
          mzRt.gid = 'g2'; mzRt.prev = { id: 'g1', chase: !mzRt.warp && mzChaseLive() };
          const b = mzChaseGoal('g1');
          return { a, b, pts, paidCalls };""")
        self.assertEqual((r['a'], r['b'], r['pts'], r['paidCalls']), (None, None, 0, 0))

    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    def test_warp_gets_no_bonus(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 9); mzChaseTick(10); mzRt.warp = true;
          return { a: mzChaseGoal('g1'), pts };""")
        self.assertEqual((r['a'], r['pts']), (None, 0))

    def test_reset_initial_values(self):
        r = self.run_js("""
          cell(1, 1); mzChaseTick(0); cell(1, 2); mzChaseTick(10); mzChaseReset();
          return { ...mzChase };""")
        self.assertEqual(r, {'sx': -1, 'sy': -1, 'cx': -1, 'cy': -1, 'fx': -1, 'fy': -1, 'moveAt': 0, 'next': 0, 'last': 0, 'caught': False, 'caughtAt': 0, 'rainAt': 0, 'paid': False, 'dist': -1, 'dkey': ''})
        self.assertIn('if (!mazeOn() && mzChase.sx >= 0) mzChaseReset();', PIXEL)
        self.assertIn('mzChaseReset();   // 夕立雲も 迷路（ゴール）ごとに はじめから', PIXEL)
        self.assertIn('mzDinoTick(now); mzChaseTick(now);', PIXEL)
        # 転がすブロックの外（ブロック内の行とは別に）にも置く
        outer = [l for l in PIXEL.splitlines() if l.startswith('  if (!mazeOn() && mzChase.sx >= 0)')]
        self.assertEqual(len(outer), 1)

    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    # 第4弾サイクル67：追いかけない天気になったため、このテストは廃止
    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
