# 第3弾サイクル12：迷路の中の地図ピース集め（Carto の「地図のかけらを集めて1枚の絵にする」）
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
    return PIXEL[a:PIXEL.index('function drawMzFruit(')] + PIXEL[b:PIXEL.index('function drawMzPieceArt(')]


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
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; }, mzPiece: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle12PieceTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_placement_avoids_everything(self):
        r = self.run_js("""
          const seen = new Set(); let clash = 0;
          for (let i = 0; i < 400; i++) {
            mzFruitReset(); mzPieceReset(); mzFruit.sx = 1; mzFruit.sy = 1; mzPiece.sx = 1; mzPiece.sy = 1;
            mzFruit.cx = 6; mzFruit.cy = 6;
            const c = mzPiecePick(); if (c) { seen.add(c.join(',')); if (c[0] === 6 && c[1] === 6) clash++; }
          }
          return { cells: [...seen], clash };""")
        self.assertGreater(len(r['cells']), 10)
        self.assertEqual(r['clash'], 0)   # みかんとは別のマス
        bad = {'10,10', '5,3', '6,3', '7,3', '8,3', '9,3', '3,3', '4,3', '1,1'}
        for c in r['cells']:
            x, y = map(int, c.split(','))
            self.assertNotIn(c, bad)
            self.assertTrue(1 <= x <= 10 and 1 <= y <= 10, c)

    def test_fruit_avoids_piece_cell(self):
        r = self.run_js("mzPieceReset(); mzPiece.cx = 2; mzPiece.cy = 8; return [mzFruitOk(2, 8), mzFruitOk(2, 9)];")
        self.assertEqual(r, [False, True])

    def test_far_from_start(self):
        r = self.run_js("""
          const ds = [];
          for (let i = 0; i < 300; i++) { mzFruitReset(); mzPieceReset(); mzPiece.sx = 1; mzPiece.sy = 1; const c = mzPiecePick(); if (c) ds.push(Math.abs(c[0] - 1) + Math.abs(c[1] - 1)); }
          return { n: ds.length, min: Math.min(...ds) };""")
        self.assertGreater(r['n'], 250)
        self.assertGreaterEqual(r['min'], 4)   # スタート直後には出ない

    def test_reach_gives_5pt_and_counts(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzPieceTick(1000);
          const first = mzPiece.cx >= 0;
          rp.x = (mzPiece.cx + 0.5) * MZ_K; rp.y = (mzPiece.cy + 0.5) * MZ_K;
          mzPieceTick(1010);
          return { first, got: mzPiece.got, pts, said, moved: mzPiece.cx < 0, done: mzPiece.doneAt };""")
        self.assertTrue(r['first'])
        self.assertEqual((r['got'], r['pts'], r['done']), (1, 5, 0))
        self.assertEqual(r['said'], ['🗺️ 地図ピース ゲット！ +5pt（あと 2まい）'])
        self.assertTrue(r['moved'])

    def test_complete_after_three_with_bonus(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); let now = 1000; const got = [], at = [];
          for (let i = 0; i < 6; i++) {
            now += 600; mzPieceTick(now);
            if (mzPiece.cx < 0) { got.push(null); continue; }
            at.push([mzPiece.cx, mzPiece.cy]);
            rp.x = (mzPiece.cx + 0.5) * MZ_K; rp.y = (mzPiece.cy + 0.5) * MZ_K; mzPieceTick(now + 1);
            got.push(pts);
            rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K;
          }
          return { got, pts, n: mzPiece.got, again: mzPiece.cx, at, said, done: mzPiece.doneAt > 0 };""")
        self.assertEqual(r['got'][:3], [5, 10, 30])   # 3枚目は +5 と完成 +15
        self.assertEqual(r['got'][3:], [None, None, None])   # 4枚目は出ない
        self.assertEqual((r['pts'], r['n'], r['again'], len(r['at'])), (30, 3, -1, 3))
        self.assertTrue(r['done'])
        self.assertEqual(r['said'][-1], '🗺️ 地図完成！ +20pt')

    def test_respawn_elsewhere(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzPieceTick(1000); const first = [mzPiece.cx, mzPiece.cy];
          rp.x = (first[0] + 0.5) * MZ_K; rp.y = (first[1] + 0.5) * MZ_K; mzPieceTick(1010);
          const same = [];
          for (let i = 0; i < 100; i++) { mzPiece.next = 0; mzPiece.got = 1; mzPieceTick(2000 + i); if (mzPiece.cx >= 0) { same.push(mzPiece.cx === first[0] && mzPiece.cy === first[1]); mzPiece.cx = mzPiece.cy = -1; } }
          return { n: same.length, same: same.some(Boolean) };""")
        self.assertGreater(r['n'], 50)
        self.assertFalse(r['same'])

    def test_state_gone_when_leaving_maze(self):
        r = self.run_js("""
          mzPieceReset(); mzPieceTick(1000); mzPiece.got = 2; mzPiece.doneAt = 5;
          const had = mzPiece.cx >= 0; mzPieceReset();
          return { had, state: { ...mzPiece } };""")
        self.assertTrue(r['had'])
        s = r['state']
        self.assertEqual((s['got'], s['cx'], s['sx'], s['doneAt']), (0, -1, -1, 0))
        self.assertIn('if (!mazeOn() && mzPiece.sx >= 0) mzPieceReset();', PIXEL)
        self.assertIn('mzPieceReset();   // 地図ピースも 迷路（ゴール）ごとに はじめから', PIXEL)
        a = GAME.index('function mzPiece(')
        fn = GAME[a:GAME.index('\n}\n', a)]
        self.assertNotIn('S.mzPiece', fn)   # セーブ形式は増やさない
        self.assertIn('gainPoints(pts)', fn)
        self.assertIn('save();', fn)

    def test_points_added_and_saved_in_game(self):
        i = GAME.index('function mzPiece(')
        src = GAME[GAME.index('const MZ_PIECE_PTS'):GAME.index('\n}\n', i) + 3]
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 0; }, save = () => { saved++; }, track = k => tracked.push(k), toast = m => toasts.push(m);
          """ + src + """
          const a = mzPiece(false), b = mzPiece(true);
          return { a, b, S, saved };""")
        self.assertEqual((r['a'], r['b']), ({'pts': 5}, {'pts': 20}))
        self.assertEqual((r['S']['points'], r['S']['total'], r['saved']), (30, 30, 2))
        self.assertIn('mzFruit, mzPiece,', GAME)

    def test_drawn_before_fog_and_shelf_shown(self):
        self.assertIn('drawMzPiece(ox, oy, T, now); drawMzView(ox, oy, T, now); drawMzCache(ox, oy, T, now); drawMzQuest(ox, oy, T, now); drawMzDino(ox, oy, T, now); if (mzHelpOn())', PIXEL)   # もやより前（サイクル14でかくし宝箱が見晴らし台の後に描かれる）
        self.assertLess(PIXEL.index('drawMzPiece(ox, oy, T, now);'), PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzSightRing(ox, oy, T, now); drawMzPulse(ox, oy, T, now); drawMzChase(ox, oy, T, now); drawMzEnergyRing('))
        self.assertIn('drawMzShelf(w, dpr, now);', PIXEL)
        d = PIXEL[PIXEL.index('function drawMzPiece('):PIXEL.index('function drawMzShelf(')]
        self.assertIn('#fffaf0', d)
        self.assertNotIn('#ff8c1a', d)   # みかんの色は使わない
        self.assertNotIn('255,230,80', d)   # ゴールの金の輪の色は使わない

    def test_reset_outside_roll_block(self):
        # Codex指摘への対応：転がすブロックの外にも、めいろでなくなったら
        # はじめからに戻す行があること（ブロック内だけでは転がす停止時に届かない）
        line = '  if (!mazeOn() && mzPiece.sx >= 0) mzPieceReset();'
        self.assertIn(line, PIXEL)
        self.assertGreater(PIXEL.count('mzPieceReset();'), 2)

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
