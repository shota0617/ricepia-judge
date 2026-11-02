# 第3弾サイクル13：迷路の中の見晴らし台（A Short Hike の「頂上の見晴らし台」）
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
    b = PIXEL.index('const MZ_PIECE = ')
    c = PIXEL.index('const MZ_VIEW = ')
    return (PIXEL[a:PIXEL.index('function drawMzFruit(')]
            + PIXEL[b:PIXEL.index('function drawMzPieceArt(')]
            + PIXEL[c:PIXEL.index('function drawMzView(')])


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
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; }, mzPiece: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; }, mzView: () => { pts += 15; return { pts: 15 }; } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle13ViewTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_placement_avoids_everything(self):
        r = self.run_js("""
          const seen = new Set(); let clash = 0;
          for (let i = 0; i < 400; i++) {
            mzFruitReset(); mzPieceReset(); mzViewReset(); mzView.sx = 1; mzView.sy = 1;
            mzFruit.cx = 6; mzFruit.cy = 6; mzPiece.cx = 2; mzPiece.cy = 8;
            const c = mzViewPick(); if (c) { seen.add(c.join(',')); if ((c[0] === 6 && c[1] === 6) || (c[0] === 2 && c[1] === 8)) clash++; }
          }
          return { cells: [...seen], clash };""")
        self.assertGreater(len(r['cells']), 10)
        self.assertEqual(r['clash'], 0)   # みかん・ピースとは別のマス
        bad = {'10,10', '5,3', '6,3', '7,3', '8,3', '9,3', '3,3', '4,3', '1,1', '6,6', '2,8'}
        for c in r['cells']:
            x, y = map(int, c.split(','))
            self.assertNotIn(c, bad)
            self.assertTrue(1 <= x <= 10 and 1 <= y <= 10, c)

    def test_far_from_start(self):
        r = self.run_js("""
          const ds = [];
          for (let i = 0; i < 300; i++) { mzFruitReset(); mzPieceReset(); mzViewReset(); mzView.sx = 1; mzView.sy = 1; const c = mzViewPick(); if (c) ds.push(Math.abs(c[0] - 1) + Math.abs(c[1] - 1)); }
          return { n: ds.length, min: Math.min(...ds) };""")
        self.assertGreater(r['n'], 250)
        self.assertGreaterEqual(r['min'], 7)   # スタート直後には出ない

    def test_reach_gives_15pt_and_starts_clear(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzViewTick(1000);
          const first = mzView.cx >= 0;
          rp.x = (mzView.cx + 0.5) * MZ_K; rp.y = (mzView.cy + 0.5) * MZ_K;
          mzViewTick(1010);
          return { first, done: mzView.done, pts, said, pano: mzView.panoAt, clearUntil: mzView.clearUntil, clearNow: mzViewClear(1010), clearLate: mzViewClear(31010) };""")
        self.assertTrue(r['first'])
        self.assertEqual((r['done'], r['pts'], r['pano'], r['clearUntil']), (True, 15, 1010, 31010))
        self.assertEqual(r['said'], ['🔭 見晴らし台に ついた！ +15pt（30秒間 もやが 晴れるよ）'])
        self.assertTrue(r['clearNow'])
        self.assertFalse(r['clearLate'])   # 30秒で霧晴れは終わる

    def test_no_respawn_after_done(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzViewTick(1000);
          rp.x = (mzView.cx + 0.5) * MZ_K; rp.y = (mzView.cy + 0.5) * MZ_K; mzViewTick(1010);
          mzView.next = 0; mzViewTick(2000);
          return { cx: mzView.cx, done: mzView.done };""")
        self.assertEqual((r['cx'], r['done']), (-1, True))   # 1つの迷路で1回だけ

    def test_fruit_and_piece_avoid_view_cell(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzView.cx = 4; mzView.cy = 4;
          const ok = mzFruitOk(4, 4);
          let clash = 0; mzView.sx = 1; mzView.sy = 1;
          for (let i = 0; i < 200; i++) { mzPieceReset(); mzPiece.sx = 1; mzPiece.sy = 1; const c = mzPiecePick(); if (c && c[0] === 4 && c[1] === 4) clash++; }
          return { ok, clash };""")
        self.assertFalse(r['ok'])   # あとから出るみかん・ピースも見晴らし台をよける
        self.assertEqual(r['clash'], 0)
        self.assertIn('mzPiece, mzView,', GAME)   # game.js の公開APIにも mzView があること（Codex重大指摘の修正）

    def test_constants(self):
        r = self.run_js("return { ...MZ_VIEW };")
        self.assertEqual(r, {'min': 8, 'reach': 18, 'pts': 15, 'panoMs': 6000, 'clearMs': 30000})

    def test_state_reset(self):
        r = self.run_js("""
          mzViewReset(); mzViewTick(1000); mzView.done = true; mzView.panoAt = 5; mzView.clearUntil = 99999;
          const had = mzView.cx >= 0; mzViewReset();
          return { had, state: { ...mzView } };""")
        self.assertTrue(r['had'])
        s = r['state']
        self.assertEqual((s['done'], s['cx'], s['sx'], s['panoAt'], s['clearUntil']), (False, -1, -1, 0, 0))
        self.assertIn('if (!mazeOn() && mzView.sx >= 0) mzViewReset();', PIXEL)
        self.assertIn('mzViewReset();   // 見晴らし台も 迷路（ゴール）ごとに はじめから', PIXEL)
        a = GAME.index('function mzView(')
        fn = GAME[a:GAME.index('\n}\n', a)]
        self.assertNotIn('S.mzView', fn)   # セーブ形式は増やさない
        self.assertIn('gainPoints(MZ_VIEW_PTS)', fn)
        self.assertIn('save();', fn)

    def test_points_added_and_saved_in_game(self):
        i = GAME.index('function mzView(')
        src = GAME[GAME.index('const MZ_VIEW_PTS'):GAME.index('\n}\n', i) + 3]
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 0; }, save = () => { saved++; }, track = k => tracked.push(k), toast = m => toasts.push(m);
          """ + src + """
          return { a: mzView(), S, saved };""")
        self.assertEqual(r['a'], {'pts': 15})
        self.assertEqual((r['S']['points'], r['S']['total'], r['saved']), (20, 20, 1))
        self.assertIn('mzFruit, mzPiece,', GAME)

    def test_drawn_before_fog_and_panorama_below_shelf(self):
        self.assertIn('drawMzView(ox, oy, T, now);', PIXEL)
        self.assertLess(PIXEL.index('drawMzView(ox, oy, T, now);'), PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzChase(ox, oy, T, now); drawMzEnergyRing('))
        self.assertIn('drawMzShelf(w, dpr, now); drawMzViewPanorama(w, dpr, now); drawMzEnergyBar(', PIXEL)
        self.assertNotIn('drawMzViewClearTag(w, dpr, now);', PIXEL)   # 文章札は 常時描画しない（サイクル25）
        self.assertIn("if (!mzViewClear(now)) mzFogFill(mzFogCells(tx0, ty0, tx1, ty1, ox, oy, T, 'veil'), S);", PIXEL)
        d = PIXEL[PIXEL.index('function drawMzView('):PIXEL.index('function mzViewShelfY(')]
        self.assertIn('#234a6e', d)   # 望遠鏡
        self.assertIn('80,170,235', d)   # 水色の輪
        self.assertNotIn('#ff8c1a', d)   # みかんの色は使わない
        self.assertNotIn('255,224,102', d)   # ゴールの金の輪の色は使わない
        pano = PIXEL[PIXEL.index('function drawMzViewPanorama('):PIXEL.index('function drawMzViewClearTag(')]
        self.assertIn('drawMzPieceArt', pano)   # 海・田んぼ・町の3景色
        self.assertIn('MZ_VIEW.panoMs', pano)

    def test_reset_outside_roll_block(self):
        line = '  if (!mazeOn() && mzView.sx >= 0) mzViewReset();'
        self.assertIn(line, PIXEL)
        self.assertGreater(PIXEL.count('mzViewReset();'), 2)

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
