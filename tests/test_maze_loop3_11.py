# 第3弾サイクル11：迷路の中のくだものボーナス（ミズ・パックマンの「迷路に出るフルーツ」）
import json
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
    a = PIXEL.index('const MZ_FRUIT = ')
    return PIXEL[a:PIXEL.index('function drawMzFruit(')]


# 12x12 マスの区域。外わくは壁、(5,3) は参道、(6,3) は金の米つぶ、(7,3) はパネル、(8,3) は生きもの、(3,3)-(4,3) の間は生け垣の戸、
# ごはんつぶの列は (9,3)、ゴールは (10,10)。スタートは (1,1)
PRE = r"""
const MZ_R = 12, MZ_K = 3, MZ_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let dirty = false, pts = 0, said = [], fx = [], sounds = 0;
const rp = { x: 1.5 * MZ_K, y: 1.5 * MZ_K }, roll = { happyT: 0 };
const t = new Uint8Array(MZ_R * MZ_R);
for (let y = 1; y < MZ_R - 1; y++) for (let x = 1; x < MZ_R - 1; x++) t[y * MZ_R + x] = 1;
const a = { x0: 0, y0: 0, t };
const mzArea = (x, y) => (x >= 0 && x < MZ_R && y >= 0 && y < MZ_R ? a : null);
const mzType = (x, y) => { const q = mzArea(x, y); return q ? q.t[y * MZ_R + x] : -1; };
const mzOpen = () => true;
const mzSpotCell = (x, y) => x === 5 && y === 3;
const mzGrainAt = (x, y) => x === 6 && y === 3;
const mzPadAt = (x, y) => (x === 7 && y === 3 ? 2 : -1);
const mzLineSet = () => [{ dots: [[9.5 * MZ_K, 3.5 * MZ_K]] }];
const mzCritDrawn = [[8, 3, 'kaeru']];
const mzGate = new Map([['3,3r', 1]]);
const mzRt = { path: [[1, 1], [10, 10]] };
const mzFx = [];
const grainSound = () => { sounds++; };
const floatText = s => said.push(s);
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle11FruitTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_placement_avoids_walls_goal_start_and_other_things(self):
        r = self.run_js("""
          const seen = new Set();
          for (let i = 0; i < 400; i++) { mzFruitReset(); mzFruit.sx = 1; mzFruit.sy = 1; const c = mzFruitPick(); if (c) seen.add(c.join(',')); }
          return { cells: [...seen], ok: [mzFruitOk(0, 0), mzFruitOk(10, 10), mzFruitOk(5, 3), mzFruitOk(6, 3), mzFruitOk(7, 3), mzFruitOk(8, 3), mzFruitOk(9, 3), mzFruitOk(3, 3), mzFruitOk(4, 3), mzFruitOk(2, 8)] };""")
        self.assertGreater(len(r['cells']), 10)
        bad = {'10,10', '5,3', '6,3', '7,3', '8,3', '9,3', '3,3', '4,3', '1,1'}
        for c in r['cells']:
            x, y = map(int, c.split(','))
            self.assertNotIn(c, bad)
            self.assertTrue(1 <= x <= 10 and 1 <= y <= 10, c)   # 外わく（壁）には出ない
        self.assertEqual(r['ok'], [False] * 9 + [True])   # 壁・ゴール・参道・米つぶ・パネル・生きもの・ごはんつぶ・戸の両がわは不可

    def test_far_from_start(self):
        r = self.run_js("""
          const ds = [];
          for (let i = 0; i < 300; i++) { mzFruitReset(); mzFruit.sx = 1; mzFruit.sy = 1; const c = mzFruitPick(); if (c) ds.push(Math.abs(c[0] - 1) + Math.abs(c[1] - 1)); }
          return { n: ds.length, min: Math.min(...ds) };""")
        self.assertGreater(r['n'], 250)
        self.assertGreaterEqual(r['min'], 5)   # スタート直後には出ない

    def test_reach_gives_10pt_and_decrements(self):
        r = self.run_js("""
          mzFruitReset(); let now = 1000; mzFruitTick(now);
          const first = mzFruit.cx >= 0, left0 = mzFruit.left;
          rp.x = (mzFruit.cx + 0.5) * MZ_K; rp.y = (mzFruit.cy + 0.5) * MZ_K;
          mzFruitTick(now + 10);
          return { first, left0, left: mzFruit.left, pts, said, moved: mzFruit.cx < 0, sounds };""")
        self.assertTrue(r['first'])
        self.assertEqual((r['left0'], r['left'], r['pts']), (3, 2, 10))
        self.assertEqual(r['said'], ['🍊 くだものゲット！ +10pt（あと 2こ）'])
        self.assertTrue(r['moved'])   # 取った瞬間に消え、次の場所には少しあとに湧く

    def test_ends_after_three(self):
        r = self.run_js("""
          mzFruitReset(); let now = 1000; const got = [], at = [];
          for (let i = 0; i < 6; i++) {
            now += 600; mzFruitTick(now);   // 湧く
            if (mzFruit.cx < 0) { got.push(null); continue; }
            at.push([mzFruit.cx, mzFruit.cy]);
            rp.x = (mzFruit.cx + 0.5) * MZ_K; rp.y = (mzFruit.cy + 0.5) * MZ_K; mzFruitTick(now + 1);
            got.push(pts);
            rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K;
          }
          return { got, pts, left: mzFruit.left, again: mzFruit.cx, at };""")
        self.assertEqual(r['pts'], 30)
        self.assertEqual(r['left'], 0)
        self.assertEqual(r['got'][:3], [10, 20, 30])
        self.assertEqual(r['got'][3:], [None, None, None])   # 4回目は出ない
        self.assertEqual(r['again'], -1)
        self.assertEqual(len(r['at']), 3)

    def test_respawn_somewhere_else(self):
        r = self.run_js("""
          mzFruitReset(); mzFruitTick(1000); const first = [mzFruit.cx, mzFruit.cy];
          rp.x = (first[0] + 0.5) * MZ_K; rp.y = (first[1] + 0.5) * MZ_K; mzFruitTick(1010);
          const same = [];
          for (let i = 0; i < 100; i++) { mzFruit.next = 0; mzFruitTick(2000 + i); if (mzFruit.cx >= 0) { same.push(mzFruit.cx === first[0] && mzFruit.cy === first[1]); mzFruit.cx = mzFruit.cy = -1; } }
          return { n: same.length, same: same.some(Boolean) };""")
        self.assertGreater(r['n'], 50)
        self.assertFalse(r['same'])   # 取った所には すぐ戻らない

    def test_state_gone_when_leaving_maze(self):
        # 迷路を出る（mazeOn が偽）・ゴールが変わる と状態は初期化。セーブには入れない
        r = self.run_js("""
          mzFruitReset(); mzFruitTick(1000); mzFruit.left = 1;
          const had = mzFruit.cx >= 0; mzFruitReset();
          return { had, state: { ...mzFruit } };""")
        self.assertTrue(r['had'])
        self.assertEqual((r['state']['left'], r['state']['cx'], r['state']['sx']), (3, -1, -1))
        self.assertIn('else if (mzFruit.sx >= 0) mzFruitReset();', PIXEL)   # 迷路が終わったら捨てる
        self.assertIn('mzFruitReset();   // くだものは 迷路（ゴール）ごとに はじめから', PIXEL)
        a = GAME.index('function mzFruit()')
        fn = GAME[a:GAME.index('}\n', GAME.index('return { pts: MZ_FRUIT_PTS }', a))]
        self.assertNotIn('S.mzFruit', fn)   # 状態はセーブに出さない
        self.assertIn('gainPoints(MZ_FRUIT_PTS)', fn)
        self.assertIn('save();', fn)

    def test_points_added_and_saved_in_game(self):
        i = GAME.index('function mzFruit()')
        src = GAME[GAME.index('const MZ_FRUIT_PTS'):GAME.index('\n}\n', i) + 3]
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 0; }, save = () => { saved++; }, track = k => tracked.push(k), toast = m => toasts.push(m);
          """ + src + """
          const r = mzFruit();
          return { r, S, saved, tracked };""")
        self.assertEqual(r['r'], {'pts': 10})
        self.assertEqual((r['S']['points'], r['S']['total'], r['saved']), (15, 15, 1))
        self.assertIn('mzGrain, mzFruit,', GAME)   # pixel.js から呼べる

    def test_drawn_and_distinct_from_goal_ring(self):
        self.assertIn('drawMzFruit(ox, oy, T, now);', PIXEL)
        d = PIXEL[PIXEL.index('function drawMzFruit('):PIXEL.index('// びゅんパネル（運営者の声')]
        self.assertIn('#ff8c1a', d)      # オレンジ
        self.assertIn('#2f7d32', d)      # はっぱ
        self.assertNotIn('255,230,80', d)   # ゴールの金の輪の色は使わない

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
