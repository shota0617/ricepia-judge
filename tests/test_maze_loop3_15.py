# 第3弾サイクル15：迷路の中のどうぐクエスト（Orna: GPS RPG の「装備クエスト」）
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
    return (PIXEL[a:PIXEL.index('function drawMzFruit(')]
            + PIXEL[b:PIXEL.index('function drawMzPieceArt(')]
            + PIXEL[c:PIXEL.index('function drawMzView(')]
            + PIXEL[d:PIXEL.index('function drawMzCache(')]
            + PIXEL[e:PIXEL.index('function drawMzQuest(')])


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
const G = { mzFruit: () => { pts += 10; return { pts: 10 }; }, mzPiece: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; }, mzView: () => { pts += 15; return { pts: 15 }; }, mzCache: () => { pts += 20; return { pts: 20 }; }, mzQuest: done => { const p = 5 + (done ? 15 : 0); pts += p; return { pts: p }; } };
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle15QuestTests(unittest.TestCase):
    def run_js(self, body):
        return node(PRE + block() + '\n' + body)

    def test_pick_far_from_start_and_avoids_others(self):
        r = self.run_js("""
          const seen = new Set(); let near = 0, clash = 0;
          for (let i = 0; i < 400; i++) {
            mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset(); mzQuestReset(); mzQuest.sx = 1; mzQuest.sy = 1;
            mzFruit.cx = 6; mzFruit.cy = 6; mzPiece.cx = 2; mzPiece.cy = 8; mzView.cx = 8; mzView.cy = 8; mzCache.cx = 9; mzCache.cy = 7; mzQuest.last = [7, 7];
            const c = mzQuestPick(); if (!c) continue; seen.add(c.join(','));
            if (Math.abs(c[0] - 1) + Math.abs(c[1] - 1) < 7) near++;
            if ([[6, 6], [2, 8], [8, 8], [9, 7], [7, 7]].some(p => p[0] === c[0] && p[1] === c[1])) clash++;
          }
          return { cells: [...seen], near, clash };""")
        self.assertGreater(len(r['cells']), 10)
        self.assertEqual((r['near'], r['clash']), (0, 0))
        bad = {'10,10', '5,3', '6,3', '7,3', '8,3', '9,3', '3,3', '4,3', '1,1'}
        for c in r['cells']:
            self.assertNotIn(c, bad)

    def test_fixed_order_and_points(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset(); mzQuestReset();
          const log = [], names = [];
          rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzQuestTick(1000);
          for (let i = 0; i < 3; i++) {
            if (mzQuest.cx < 0) { mzQuest.next = 0; mzQuestTick(2000 + i * 1000); }
            names.push(QUEST_TOOLS[mzQuest.got].name);
            rp.x = (mzQuest.cx + 0.5) * MZ_K; rp.y = (mzQuest.cy + 0.5) * MZ_K;
            const before = pts; mzQuestTick(2100 + i * 1000); log.push(pts - before);
            rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K;
          }
          return { log, names, got: mzQuest.got, said: said.slice(), doneAt: mzQuest.doneAt, sounds, order: QUEST_TOOLS.map(o => o.name) };""")
        self.assertEqual(r['order'], ['くわ', 'かま', 'みの'])
        self.assertEqual(r['names'], ['くわ', 'かま', 'みの'])
        self.assertEqual(r['log'], [5, 5, 20])
        self.assertEqual(r['got'], 3)
        self.assertEqual(r['said'], ['⛏️ くわ ゲット！ +5pt', '🌾 かま ゲット！ +5pt', '🎉 どうぐ そろった！ +20pt'])
        self.assertEqual((r['doneAt'], r['sounds']), (4100, 3))

    def test_no_more_after_three(self):
        r = self.run_js("""
          mzFruitReset(); mzPieceReset(); mzViewReset(); mzCacheReset(); mzQuestReset();
          rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K; mzQuestTick(1000);
          for (let i = 0; i < 3; i++) {
            if (mzQuest.cx < 0) { mzQuest.next = 0; mzQuestTick(2000 + i); }
            rp.x = (mzQuest.cx + 0.5) * MZ_K; rp.y = (mzQuest.cy + 0.5) * MZ_K; mzQuestTick(3000 + i);
            rp.x = 1.5 * MZ_K; rp.y = 1.5 * MZ_K;
          }
          mzQuest.next = 0; mzQuestTick(9000); mzQuestTick(12000);
          return { cx: mzQuest.cx, got: mzQuest.got, pts };""")
        self.assertEqual((r['cx'], r['got'], r['pts']), (-1, 3, 30))   # 1迷路で最大 +30pt

    def test_fruit_ok_avoids_quest_cell(self):
        r = self.run_js("""
          mzFruitReset(); mzQuestReset(); mzQuest.cx = 4; mzQuest.cy = 4;
          return { ok: mzFruitOk(4, 4), other: mzFruitOk(4, 5) };""")
        self.assertFalse(r['ok'])
        self.assertTrue(r['other'])

    def test_reset_initial_values(self):
        r = self.run_js("""
          mzQuestTick(1000); mzQuest.got = 2; mzQuest.last = [3, 3]; mzQuest.doneAt = 5; mzQuestReset();
          return { ...mzQuest };""")
        self.assertEqual(r, {'got': 0, 'cx': -1, 'cy': -1, 'sx': -1, 'sy': -1, 'last': None, 'next': 0, 'doneAt': 0})
        self.assertIn('if (!mazeOn() && mzQuest.sx >= 0) mzQuestReset();', PIXEL)
        self.assertIn('mzQuestReset();   // どうぐクエストも 迷路（ゴール）ごとに はじめから', PIXEL)
        self.assertIn('mzCacheTick(now); mzQuestTick(now);', PIXEL)

    def test_constants(self):
        self.assertEqual(self.run_js("return { ...MZ_QUEST };"), {'min': 8, 'reach': 18, 'pts': 5, 'done': 15})
        self.assertEqual(self.run_js("return QUEST_TOOLS;"), [
            {'name': 'くわ', 'emoji': '⛏️', 'color': '#8b5a2b'},
            {'name': 'かま', 'emoji': '🌾', 'color': '#2f7d32'},
            {'name': 'みの', 'emoji': '👒', 'color': '#d4a017'}])

    def test_game_function_and_public_list(self):
        self.assertIn('mzCache, mzQuest,', GAME)   # 公開リストへの追加漏れを防ぐ
        i = GAME.index('function mzQuest(')
        src = GAME[GAME.index('const MZ_QUEST_PTS'):GAME.index('\n}\n', i) + 3]
        r = node("""
          let S = { points: 5, total: 5 }, saved = 0, tracked = [], toasts = [];
          const gainPoints = n => { S.points += n; S.total += n; return 0; }, save = () => { saved++; }, track = (k, v) => tracked.push([k, v]), toast = m => toasts.push(m);
          """ + src + """
          const a = mzQuest(false), b = mzQuest(true);
          return { a, b, S, saved, tracked };""")
        self.assertEqual((r['a'], r['b']), ({'pts': 5}, {'pts': 20}))
        self.assertEqual((r['S']['points'], r['S']['questGot'], r['saved']), (30, 1, 2))
        self.assertEqual(r['tracked'], [['maze_quest', {'done': False}], ['maze_quest', {'done': True}]])

    def test_draw_order_look_and_tag(self):
        self.assertLess(PIXEL.index('drawMzQuest(ox, oy, T, now);'), PIXEL.index('drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); }'))
        self.assertIn('drawMzCache(ox, oy, T, now); drawMzQuest(ox, oy, T, now);', PIXEL)
        self.assertIn('drawMzCacheHint(w, dpr, now); drawMzQuestTag(w, dpr, now);', PIXEL)
        d = PIXEL[PIXEL.index('function drawMzQuest('):PIXEL.index('function drawMzQuestTag(')]
        for c in ('#ff8c1a', '80,170,235', '255,224,102', '170,120,235'):
            self.assertNotIn(c, d)
        h = PIXEL[PIXEL.index('function drawMzQuestTag('):PIXEL.index('// びゅんパネル')]
        for t in ('🧰 どうぐクエスト ', "'✓'", "'◎'", "'◯'", '🎉 どうぐ そろった！ かおりちゃんの どうぐセット 完成！', 'mzViewShelfY', 'mzCache.cx >= 0', 'w - gap * 2', '6000'):
            self.assertIn(t, h)

    def test_record_row_matches_stat_pi(self):
        self.assertIn('questGot: 0', GAME)
        self.assertIn('S.questGot = (S.questGot || 0) + 1', GAME)
        self.assertIn("['どうぐクエスト', S.questGot || 0, '回']", GAME)
        pi = GAME[GAME.index('const STAT_PI = ['):GAME.index('];', GAME.index('const STAT_PI = ['))]
        rows = GAME[GAME.index("$('stats').innerHTML = ["):GAME.index('].map(([k, v, u], i)')]
        self.assertEqual(pi.count(',') + 1, len(re.findall(r"\['[^']+', ", rows)))   # きろくの行と数が合う
        self.assertEqual(pi.count(',') + 1, 13)

    def test_no_forbidden_words_in_diff(self):
        words = ('ぼく', 'だに', '約20%')   # このリスト自身は検査から除く
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in out.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in words:
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
