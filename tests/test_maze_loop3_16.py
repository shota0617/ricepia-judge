# 第3弾サイクル16：迷路の中のきょうりゅうの足跡たどり（Jurassic World Alive の「恐竜との遭遇」）
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
    a = PIXEL.index('const MZ_FRUIT = ')
    b = PIXEL.index('const MZ_PIECE = ')
    c = PIXEL.index('const MZ_VIEW = ')
    d = PIXEL.index('const MZ_CACHE = ')
    e = PIXEL.index('const MZ_QUEST = ')
    f = PIXEL.index('const MZ_DINO = ')
    return (PIXEL[a:PIXEL.index('function drawMzFruit(')]
            + PIXEL[b:PIXEL.index('function drawMzPieceArt(')]
            + PIXEL[c:PIXEL.index('function drawMzView(')]
            + PIXEL[d:PIXEL.index('function drawMzCache(')]
            + PIXEL[e:PIXEL.index('function drawMzQuest(')]
            + PIXEL[f:PIXEL.index('function drawMzDino(')])


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
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; }, mzPiece: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; }, mzView: () => { pts += 15; return { pts: 15 }; }, mzCache: () => { pts += 20; return { pts: 20 }; }, mzQuest: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; }, mzDino: () => { pts += 20; return { pts: 20 }; } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle16DinoTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_pick_far_and_avoids_others(self):
        r = self.run_js("""
          const seen = new Set(); let near = 0, clash = 0;
          for (let i = 0; i < 400; i++) {
            mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset(); mzQuestReset(); mzDinoReset(); mzDino.sx = 1; mzDino.sy = 1;
            mzFruit.cx = 6; mzFruit.cy = 6; mzPiece.cx = 2; mzPiece.cy = 8; mzView.cx = 8; mzView.cy = 8; mzCache.cx = 9; mzCache.cy = 7; mzQuest.cx = 7; mzQuest.cy = 7;
            const c = mzDinoPick(); if (!c) continue; seen.add(c.join(','));
            if (Math.abs(c[0] - 1) + Math.abs(c[1] - 1) < 10) near++;
            if ([[6, 6], [2, 8], [8, 8], [9, 7], [7, 7]].some(p => p[0] === c[0] && p[1] === c[1])) clash++;
          }
          return { cells: [...seen], near, clash };""")
        self.assertGreater(len(r['cells']), 5)
        self.assertEqual((r['near'], r['clash']), (0, 0))
        bad = {'10,10', '5,3', '6,3', '7,3', '8,3', '9,3', '3,3', '4,3', '1,1'}
        for c in r['cells']:
            self.assertNotIn(c, bad)

    def test_trail_follows_corridor_and_excludes_ends(self):
        r = self.run_js("""
          mzDinoReset(); rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzDinoTick(1000);
          const tr = mzDino.trail, path = mzDinoPath(mzDino.sx, mzDino.sy, mzDino.cx, mzDino.cy);
          let adj = true;
          for (let i = 1; i < path.length; i++) if (Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]) !== 1) adj = false;
          const onPath = tr.every(c => path.some(p => p[0] === c[0] && p[1] === c[1]));
          const ends = tr.some(c => (c[0] === 1 && c[1] === 1) || (c[0] === mzDino.cx && c[1] === mzDino.cy));
          const evenOnly = tr.every(c => path.findIndex(p => p[0] === c[0] && p[1] === c[1]) % 2 === 0);
          return { n: tr.length, len: path.length, adj, onPath, ends, evenOnly, start: path[0], last: path[path.length - 1], dino: [mzDino.cx, mzDino.cy], none: mzDinoPath(1, 1, 0, 0) };""")
        self.assertGreater(r['n'], 3)
        self.assertGreaterEqual(r['len'], 11)
        self.assertTrue(r['adj'] and r['onPath'] and r['evenOnly'])
        self.assertFalse(r['ends'])
        self.assertEqual(r['start'], [1, 1])
        self.assertEqual(r['last'], r['dino'])
        self.assertEqual(r['none'], [])

    def test_meeting_gives_20pt_and_clears_trail(self):
        r = self.run_js("""
          mzDinoReset(); rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzDinoTick(1000);
          rp.x = (mzDino.cx + 0.5) * MZ_K; rp.y = (mzDino.cy + 0.5) * MZ_K;
          const before = pts; mzDinoTick(2000);
          return { gain: pts - before, found: mzDino.found, foundAt: mzDino.foundAt, trail: mzDino.trail.length, said: said.slice(), sounds, cx: mzDino.cx };""")
        self.assertEqual(r['gain'], 20)
        self.assertTrue(r['found'])
        self.assertEqual((r['foundAt'], r['trail'], r['sounds'], r['cx']), (2000, 0, 1, -1))
        self.assertEqual(r['said'], ['🦕 きょうりゅうと であった！ +20pt'])

    def test_no_more_after_meeting(self):
        r = self.run_js("""
          mzDinoReset(); rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzDinoTick(1000);
          rp.x = (mzDino.cx + 0.5) * MZ_K; rp.y = (mzDino.cy + 0.5) * MZ_K; mzDinoTick(2000);
          rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzDino.next = 0; mzDinoTick(5000); mzDinoTick(9000);
          return { cx: mzDino.cx, pts, trail: mzDino.trail.length };""")
        self.assertEqual((r['cx'], r['pts'], r['trail']), (-1, 20, 0))

    def test_trail_does_not_block_other_bonuses(self):
        r = self.run_js("""
          mzFruitReset(); mzDinoReset(); rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzDinoTick(1000);
          const c = mzDino.trail[0];
          mzFruit.cx = c[0]; mzFruit.cy = c[1];
          return { ok: mzFruitOk(c[0], c[1]) };""")
        self.assertTrue(r['ok'])

    def test_fruit_ok_avoids_dino_cell(self):
        r = self.run_js("""
          mzFruitReset(); mzDinoReset(); mzDino.cx = 4; mzDino.cy = 4;
          return { ok: mzFruitOk(4, 4), other: mzFruitOk(4, 5) };""")
        self.assertFalse(r['ok'])
        self.assertTrue(r['other'])

    def test_reset_initial_values(self):
        r = self.run_js("""
          mzDinoTick(1000); mzDino.found = true; mzDino.foundAt = 5; mzDino.trail = [[2, 2]]; mzDinoReset();
          return { ...mzDino };""")
        self.assertEqual(r, {'cx': -1, 'cy': -1, 'sx': -1, 'sy': -1, 'trail': [], 'found': False, 'foundAt': 0, 'next': 0})
        self.assertIn('if (!mazeOn() && mzDino.sx >= 0) mzDinoReset();', PIXEL)
        self.assertIn('mzDinoReset();   // きょうりゅうの あしあとも 迷路（ゴール）ごとに はじめから', PIXEL)
        self.assertIn('mzQuestTick(now); mzDinoTick(now);', PIXEL)
        self.assertEqual(self.run_js("return { ...MZ_DINO };"), {'min': 10, 'reach': 18, 'pts': 20})

    def test_game_function_and_public_list(self):
        self.assertIn('mzQuest, mzDino,', GAME)   # 公開リストへの追加漏れを防ぐ
        i = GAME.index('function mzDino(')
        src = GAME[GAME.index('const MZ_DINO_PTS'):GAME.index('\n}\n', i) + 3]
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 2; }, save = () => { saved++; }, track = (k, v) => tracked.push([k, v]), toast = m => toasts.push(m);
          """ + src + """
          const a = mzDino();
          return { a, S, saved, tracked, toasts };""")
        self.assertEqual(r['a'], {'pts': 20})
        self.assertEqual((r['S']['points'], r['S']['dinoGot'], r['saved']), (25, 1, 1))
        self.assertEqual(r['tracked'], [['maze_dino', {}]])
        self.assertEqual(r['toasts'], ['⭐ レベル2！'])

    def test_draw_order_look_and_tag(self):
        self.assertLess(PIXEL.index('drawMzDino(ox, oy, T, now);'), PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); }'))
        self.assertIn('drawMzQuest(ox, oy, T, now); drawMzDino(ox, oy, T, now);', PIXEL)
        self.assertIn('drawMzQuestTag(w, dpr, now); drawMzDinoTag(w, dpr, now);', PIXEL)
        d = PIXEL[PIXEL.index('function drawMzDino('):PIXEL.index('function drawMzDinoTag(')]
        for c in ('#ff8c1a', '80,170,235', '255,224,102', '170,120,235'):
            self.assertNotIn(c, d)
        for t in ('🦕', 'ellipse', 'Math.sin(now'):
            self.assertIn(t, d)
        h = PIXEL[PIXEL.index('function drawMzDinoTag('):PIXEL.index('// びゅんパネル')]
        for t in ('🦕 きょうりゅうの あしあとを たどろう！', 'あしあと ', '🦕 きょうりゅうと であった！ かおりちゃんも びっくり！', 'mzViewShelfY', 'mzQuest.sx >= 0', 'mzCache.cx >= 0', 'w - gap * 2', '6000'):
            self.assertIn(t, h)

    def test_record_row_matches_stat_pi(self):
        self.assertIn('dinoGot: 0', GAME)
        self.assertIn('S.dinoGot = (S.dinoGot || 0) + 1', GAME)
        self.assertIn("['きょうりゅうと であった', S.dinoGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index('].map(([k, v, u], i)')]
        self.assertEqual(pi.count(',') + 1, len(re.findall(r"\['[^']+', ", rows)))   # きろくの行と数が合う
        self.assertEqual(pi.count(',') + 1, 14)

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
