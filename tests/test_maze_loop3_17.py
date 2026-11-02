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

    def test_constants(self):
        self.assertEqual(self.run_js('return { ...MZ_CHASE };'), {'stepMs': 6000, 'pts': 25, 'rainMs': 4000})

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

    def test_cloud_follows_corridor_bfs_one_cell_per_6s(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(1000); cell(1, 9); mzChaseTick(2000);   // 雲は (1,1)・かおりちゃんは (1,9)
          const log = [];
          for (let now = 3000; now <= 2000 + 6000 * 4; now += 500) { mzChaseTick(now); log.push([now, mzChase.cx, mzChase.cy]); }
          const steps = log.filter((p, i) => i && (p[1] !== log[i - 1][1] || p[2] !== log[i - 1][2]));
          return { steps, wallOk: log.every(p => p[1] !== 5 || p[2] === 10 || p[2] === 0 || p[2] === 11) };""")
        self.assertEqual([s[0] for s in r['steps']], [8000, 14000, 20000, 26000])
        self.assertEqual([s[1:] for s in r['steps']], [[1, 2], [1, 3], [1, 4], [1, 5]])

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

    def test_caught_when_same_cell_with_rain(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 2); mzChaseTick(10);   // 雲 (1,1)
          adv(110, 6110);   // 雲が (1,2) へ：同じ マス
          const c1 = mzChase.caught, said1 = said.slice();
          const fx0 = mzFx.length; adv(6200, 7000);
          const raining = mzFx.length > fx0, still = mzChase.cx;
          adv(6200, 10300);
          return { c1, said1, raining, still, gone: mzChase.cx, caught: mzChase.caught, pts };""")
        self.assertTrue(r['c1'])
        self.assertEqual(r['said1'], ['☔ 夕立に つかまった… でも だいじょうぶ、つづけられるよ'])
        self.assertTrue(r['raining'])
        self.assertEqual(r['still'], 1)
        self.assertEqual((r['gone'], r['caught'], r['pts']), (-1, True, 0))

    def test_caught_when_rice_walks_into_cloud(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(2, 1); mzChaseTick(10); cell(1, 1); mzChaseTick(20);
          return { caught: mzChase.caught, live: mzChaseLive() };""")
        self.assertEqual((r['caught'], r['live']), (True, False))

    def test_no_bonus_after_caught(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 2); mzChaseTick(10); adv(110, 6110);
          mzRt.gid = 'g1';
          const a = mzChaseGoal('g1');
          mzRt.gid = 'g2'; mzRt.prev = { id: 'g1', chase: !mzRt.warp && mzChaseLive() };
          const b = mzChaseGoal('g1');
          return { a, b, pts, paidCalls };""")
        self.assertEqual((r['a'], r['b'], r['pts'], r['paidCalls']), (None, None, 0, 0))

    def test_escape_gives_25pt_once_with_gold_tag(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 9); mzChaseTick(10);
          const a = mzChaseGoal('g1'), b = mzChaseGoal('g1');
          const wonAt = mzChaseWon;
          // ゴールが かわったあと（prev から）
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 9); mzChaseTick(10);
          mzRt.prev = { id: 'g1', chase: mzChaseLive() }; mzRt.gid = 'g2'; mzChaseReset();
          const c = mzChaseGoal('g1'), d = mzChaseGoal('g1');
          return { a, b, c, d, pts, paidCalls, wonSet: wonAt > 0 };""")
        self.assertEqual(r['a'], {'pts': 25})
        self.assertIsNone(r['b'])
        self.assertEqual(r['c'], {'pts': 25})
        self.assertIsNone(r['d'])
        self.assertEqual((r['pts'], r['paidCalls']), (50, 2))
        self.assertTrue(r['wonSet'])

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

    def test_distance_counts_corridor_steps(self):
        r = self.run_js("""
          mzChaseReset(); cell(1, 1); mzChaseTick(0); cell(1, 5); mzChaseTick(10);
          return { d: mzChase.dist };""")
        self.assertEqual(r['d'], 4)

    def test_game_function_public_list_and_hook(self):
        self.assertIn('mzDino, mzChase,', GAME)   # 公開リストへの追加漏れを防ぐ
        i = GAME.index('function mzChase(')
        src = GAME[GAME.index('const MZ_CHASE_PTS'):GAME.index('\n}\n', i) + 3]
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 0; }, save = () => { saved++; }, track = (k, v) => tracked.push([k, v]), toast = m => toasts.push(m);
          """ + src + """
          const a = mzChase();
          return { a, S, saved, tracked, toasts };""")
        self.assertEqual(r['a'], {'pts': 25})
        self.assertEqual((r['S']['points'], r['S']['chaseGot'], r['saved']), (30, 1, 1))
        self.assertEqual(r['tracked'], [['maze_chase', {}]])
        self.assertIn('MZ.chaseGoal(id)', GAME)
        self.assertLess(GAME.index('if (!gl || gl.sec <= 3) return 0;'), GAME.index('MZ.chaseGoal(id)'))
        self.assertIn('chaseGoal: id => mzChaseGoal(id)', PIXEL)
        self.assertIn('chase: () => ({', PIXEL)

    def test_draw_order_look_and_tag(self):
        self.assertIn('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzSightRing(ox, oy, T, now); drawMzPulse(ox, oy, T, now); drawMzChase(ox, oy, T, now); drawMzEnergyRing(', PIXEL)   # もやの あと
        self.assertLess(PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzSightRing(ox, oy, T, now); drawMzPulse(ox, oy, T, now); drawMzChase('), PIXEL.index('\n  updateTraffic(dt, now, tx0'))
        self.assertNotIn('drawMzChaseTag(w, dpr, now);', PIXEL)   # 常時描画しない（サイクル25）
        d = PIXEL[PIXEL.index('function drawMzChase('):PIXEL.index('function drawMzChaseTag(')]
        for c in ('#ff8c1a', '80,170,235', '255,224,102', '170,120,235', '#3fb56b'):
            self.assertNotIn(c, d)
        for t in ('ellipse', 'arc(', 'Math.sin(now'):
            self.assertIn(t, d)
        h = PIXEL[PIXEL.index('function drawMzChaseTag('):PIXEL.index('// びゅんパネル')]
        for t in ('⛈️ 夕立雲が 追いかけてくる！', 'あと${mzChase.dist}マス', '⛈️ 夕立から にげきった！ +${MZ_CHASE.pts}pt かおりちゃん、はやかったね！', 'mzViewShelfY', 'mzQuest.sx >= 0', 'mzCache.cx >= 0', 'mzDino.sx >= 0', 'mzChase.caught', 'w - gap * 2', '6000'):
            self.assertIn(t, h)

    def test_record_row_matches_stat_pi(self):
        self.assertIn('chaseGot: 0', GAME)
        self.assertIn('S.chaseGot = (S.chaseGot || 0) + 1', GAME)
        self.assertIn("['夕立から にげきった', S.chaseGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index('].map(([k, v, u], i)')]
        self.assertEqual(pi.count(',') + 1, len(re.findall(r"\['[^']+', ", rows)))
        self.assertEqual(pi.count(",") + 1, 21)

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
