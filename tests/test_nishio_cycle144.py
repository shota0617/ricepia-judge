# にしおサイクル144：F1 はじめてのゴールを近く（120〜200m）＋解放のゲートを「はじめてのさんぽ（3ゴールまで）」へ
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
KORO = (GO / 'korostyle.js').read_text(encoding='utf-8')


def node(code):
    return subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout


def line_of(src, head):
    i = src.index(head)
    return src[i:src.index('\n', i)]


class Gate(unittest.TestCase):
    def test_pixel_predicates_threshold_3(self):
        for name in ('cubeFirstGoal', 'chaseFirstGoal', 'rescueFirstGoal'):
            ln = line_of(PIXEL, 'const %s = ' % name).split('//')[0]
            out = [json.loads(node("const lsGet = () => %d;%s;console.log(JSON.stringify(%s()))" % (g, ln, name))) for g in (0, 1, 2, 3, 4)]
            self.assertEqual(out, [True, True, True, False, False], name)
        ln = line_of(PIXEL, 'function quietNumText(').split('//')[0]
        out = [json.loads(node("const G = { demo: true }, QUIET_NUM = /\\d/, lsGet = () => '%d';%s;console.log(JSON.stringify(quietNumText('+1')))" % (g, ln))) for g in (0, 1, 2, 3)]
        self.assertEqual(out, [True, True, True, False])

    def test_no_threshold_1_left(self):
        for src in (PIXEL, GAME, KORO):
            for m in re.finditer(r"[^\n]*nsg_mzgoals[^\n]*", src):
                self.assertNotRegex(m.group(0).split('//')[0], r">= 1\)|goalsDone\(\) < 1")

    def test_game_three_places_and_koro(self):
        self.assertEqual(len(re.findall(r"nsg_mzgoals', 0\) >= 3", GAME)), 3)
        self.assertIn('goalsDone() < 3', KORO)


class FirstGoalNear(unittest.TestCase):
    def test_constants_and_branch(self):
        self.assertIn('const MAZE_NEAR_MIN = 350, MAZE_NEAR = 900;', GAME)
        self.assertIn('const FIRST_MIN = 120, FIRST_MAX = 200;', GAME)
        self.assertRegex(GAME, r"first1 = mazeNear && store\.get\('nsg_mzgoals', 0\) < 1")
        self.assertIn('range = first1 ? FIRST_MAX : mazeNear ? MAZE_NEAR', GAME)
        self.assertIn('first1 ? (tooNearOk ? 0 : FIRST_MIN)', GAME)
        self.assertIn('const five = mazeNear;', GAME)

    def test_fallback_in_decideGuide(self):
        self.assertIn("decideGuide0(from, false, true)", GAME)

    def test_real_function_picks(self):
        i = GAME.index('function decideGuide0(')
        body = GAME[i:GAME.index('\n}\n', i) + 2]
        j = GAME.index('function decideGuide(')
        dg = GAME[j:GAME.index('\n}\n', j) + 2]
        def run(goals, dists, guides=0):
            code = """
const FIRST_MIN = 120, FIRST_MAX = 200, MAZE_NEAR_MIN = 350, MAZE_NEAR = 900, GUIDE_RANGE = { walk: 2000, play: 3000 };
const demo = true, mazeNow = () => true, window = {}, store = { get: (k, d) => k === 'nsg_mzgoals' ? %d : d };
const me = { lat: 0, lng: 0 }, dist = (a, b) => Math.abs(a.lat - b.lat) * 111320, S = { guideDone: [], visits: {}, guides: %d };
const spots = %s.map((d, i) => ({ id: 's' + i, name: 'n' + i, lat: d / 111320, lng: 0, featured: true, cat: 'shrine' }));
const mzNoPathIds = () => [], guideRadius = () => 40, weatherNow = () => null, KO = null, upcomingEvents = () => [], placeNpcs = () => [];
const ISLAND_SPOTS = new Set(), CATS = {}, firstClause = t => '', evSpotId = e => '';
%s
%s
const g = decideGuide(null);
console.log(JSON.stringify(g && { id: g.id, d: Math.round(dist(me, g)), alts: g.alts && g.alts.map(a => a.id) }));
""" % (goals, guides, json.dumps(dists), body, dg)
            return json.loads(node(code))
        self.assertEqual(run(0, [500, 150])['id'], 's1')            # はじめて：150m 側
        r = run(0, [500, 180, 150])
        self.assertEqual((r['id'], r['alts']), ('s2', []))   # 候補は 近い 1つ（ダミーは 注目スポットのみ）
        self.assertEqual(run(1, [500, 150, 1500])['id'], 's0')
        self.assertEqual(run(0, [80, 500])['id'], 's0')             # 帯に 無ければ 60m まで ゆるめる
        self.assertEqual(run(0, [30, 500])['id'], 's1')             # それも 無ければ 従来の 広い 範囲


if __name__ == '__main__':
    unittest.main()
