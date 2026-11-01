# 第3弾サイクル14：迷路の中のかくし宝箱（Geocaching の「手がかりだけで隠された宝を探す」）
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
    d = PIXEL.index('const MZ_CACHE = ')
    return (PIXEL[a:PIXEL.index('function drawMzFruit(')]
            + PIXEL[b:PIXEL.index('function drawMzPieceArt(')]
            + PIXEL[c:PIXEL.index('function drawMzView(')]
            + PIXEL[d:PIXEL.index('function drawMzCache(')])


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
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; }, mzPiece: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; }, mzView: () => { pts += 15; return { pts: 15 }; }, mzCache: () => { pts += 20; return { pts: 20 }; } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle14CacheTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_pick_far_from_start_and_avoids_everything(self):
        r = self.run_js("""
          const seen = new Set(); let near = 0, clash = 0;
          for (let i = 0; i < 400; i++) {
            mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset(); mzCache.sx = 1; mzCache.sy = 1;
            mzFruit.cx = 6; mzFruit.cy = 6; mzPiece.cx = 2; mzPiece.cy = 8; mzView.cx = 8; mzView.cy = 8;
            const c = mzCachePick(); if (!c) continue; seen.add(c.join(','));
            if (Math.abs(c[0] - 1) + Math.abs(c[1] - 1) < 7) near++;
            if ((c[0] === 6 && c[1] === 6) || (c[0] === 2 && c[1] === 8) || (c[0] === 8 && c[1] === 8)) clash++;
          }
          return { cells: [...seen], near, clash };""")
        self.assertGreater(len(r['cells']), 10)
        self.assertEqual((r['near'], r['clash']), (0, 0))
        bad = {'10,10', '5,3', '6,3', '7,3', '8,3', '9,3', '3,3', '4,3', '1,1'}
        for c in r['cells']:
            self.assertNotIn(c, bad)

    def test_bfs_distance(self):
        r = self.run_js("""
          mzCacheReset(); mzCache.cx = 5; mzCache.cy = 1;
          const d1 = mzCacheDist(1, 1), d0 = mzCacheDist(5, 1), d2 = mzCacheDist(8, 4);
          mzCache.cx = 20; mzCache.cy = 20;
          return { d1, d0, d2, out: mzCacheDist(1, 1) };""")
        self.assertEqual((r['d1'], r['d0'], r['d2'], r['out']), (4, 0, 6, -1))

    def test_warm_and_cold(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset();
          mzCache.sx = 1; mzCache.sy = 1; mzCache.cx = 9; mzCache.cy = 1; mzCache.next = 1e9;
          const w = [];
          for (const [x, y] of [[1, 1], [2, 1], [3, 1], [2, 1], [1, 1]]) { rp.x = (x + 0.5) * MZ_K; rp.y = (y + 0.5) * MZ_K; mzCacheTick(1000); w.push([mzCache.dist, mzCache.warm]); }
          return { w };""")
        self.assertEqual(r['w'], [[8, 0], [7, 1], [6, 1], [7, -1], [8, -1]])

    def test_reach_gives_20pt_and_done(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset(); rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzCacheTick(1000);
          const first = mzCache.cx >= 0;
          rp.x = (mzCache.cx + 0.5) * MZ_K; rp.y = (mzCache.cy + 0.5) * MZ_K;
          mzCacheTick(1010);
          const after = { done: mzCache.done, cx: mzCache.cx, dist: mzCache.dist, pts, said: said.slice(), sounds };
          mzCache.next = 0; mzCacheTick(3000);
          return { first, after, cxLater: mzCache.cx };""")
        self.assertTrue(r['first'])
        a = r['after']
        self.assertEqual((a['done'], a['cx'], a['dist'], a['pts'], a['sounds']), (True, -1, -1, 20, 1))
        self.assertEqual(a['said'], ['📦 かくし宝箱 はっけん！ +20pt'])
        self.assertEqual(r['cxLater'], -1)   # 1回見つけたらもう出ない

    def test_fruit_ok_avoids_cache_cell(self):
        r = self.run_js("""
          mzFruitReset(); mzCacheReset(); mzCache.cx = 4; mzCache.cy = 4;
          return { ok: mzFruitOk(4, 4), other: mzFruitOk(4, 5) };""")
        self.assertFalse(r['ok'])
        self.assertTrue(r['other'])

    def test_reset_initial_values(self):
        r = self.run_js("""
          mzCacheTick(1000); mzCache.done = true; mzCache.dist = 5; mzCache.prev = 6; mzCache.warm = 1; mzCacheReset();
          return { ...mzCache };""")
        self.assertEqual(r, {'done': False, 'cx': -1, 'cy': -1, 'sx': -1, 'sy': -1, 'next': 0, 'dist': -1, 'prev': -1, 'warm': 0})
        self.assertIn('if (!mazeOn() && mzCache.sx >= 0) mzCacheReset();', PIXEL)
        self.assertIn('mzCacheReset();   // かくし宝箱も 迷路（ゴール）ごとに はじめから', PIXEL)
        self.assertIn('mzViewTick(now); mzCacheTick(now);', PIXEL)

    def test_constants(self):
        self.assertEqual(self.run_js("return { ...MZ_CACHE };"), {'min': 8, 'reach': 18, 'pts': 20, 'show': 3})

    def test_game_function_and_public_list(self):
        self.assertIn('mzPiece, mzView, mzCache,', GAME)   # 公開リストへの追加漏れを防ぐ
        i = GAME.index('function mzCache(')
        src = GAME[GAME.index('const MZ_CACHE_PTS'):GAME.index('\n}\n', i) + 3]
        self.assertNotIn('S.mzCache', src)   # セーブ形式は増やさない
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 0; }, save = () => { saved++; }, track = (k, v) => tracked.push([k, v]), toast = m => toasts.push(m);
          """ + src + """
          return { a: mzCache(), S, saved, tracked };""")
        self.assertEqual(r['a'], {'pts': 20})
        self.assertEqual((r['S']['points'], r['saved'], r['tracked']), (25, 1, [['maze_cache', {}]]))

    def test_draw_order_and_look(self):
        self.assertLess(PIXEL.index('drawMzCache(ox, oy, T, now);'), PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); }'))
        self.assertLess(PIXEL.index('drawMzView(ox, oy, T, now); drawMzCache('), PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); }'))
        self.assertIn('drawMzViewClearTag(w, dpr, now); drawMzCacheHint(w, dpr, now);', PIXEL)
        d = PIXEL[PIXEL.index('function drawMzCache('):PIXEL.index('function drawMzCacheHint(')]
        self.assertIn('170,120,235', d)   # うすい紫
        self.assertIn('MZ_CACHE.show', d)   # 3歩以内だけ
        for c in ('#ff8c1a', '80,170,235', '255,224,102'):
            self.assertNotIn(c, d)
        h = PIXEL[PIXEL.index('function drawMzCacheHint('):PIXEL.index('// びゅんパネル')]
        for t in ('あつい！ ちかづいてるよ', 'つめたい… はなれちゃった', 'おなじくらいだよ', 'まだ みつからないよ', 'mzViewShelfY'):
            self.assertIn(t, h)

    def test_outside_reset_and_discovery_count(self):
        # Codex指摘への対応：転がすブロックの外にもリセットがあること（内側だけだと転がすをやめたときに残る）
        self.assertIn('if (!mazeOn() && mzCache.sx >= 0) mzCacheReset();   // かくし宝箱も 同じく はじめから', PIXEL)
        # 発見の記録：ポイントだけでなく保存される発見回数ときろくの行があること
        self.assertIn('cacheGot: 0', GAME)
        self.assertIn('S.cacheGot = (S.cacheGot || 0) + 1', GAME)
        self.assertIn("['かくし宝箱はっけん', S.cacheGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        self.assertEqual(pi.count(',') + 1, 14)   # きろく14行と対応（サイクル16できょうりゅう行が増えた。サイクル15でどうぐクエスト行が増えた）
        h = PIXEL[PIXEL.index('function drawMzCacheHint('):PIXEL.index('// びゅんパネル')]
        self.assertIn('w - gap * 2', h)   # 狭い画面では札を画面内に収める

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
