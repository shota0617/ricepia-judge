import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'

# 地図のめいろ 第2弾 サイクル1〜5 の修正の回帰テスト。実コードの該当行を正規表現で切り出し、Node で動かす。
# （サイクル1・2 の「縦・近さ」の並びそのものは test_maze_goalsort.py が見ている。ここは各サイクルの追加分だけ）
RUN = r"""
const { fn, args, cases } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const f = new Function(...args, fn);
console.log(JSON.stringify(cases.map(c => f(...args.map(a => c[a])))));
"""


def node(fn, args, cases):
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run(['node', '-e', RUN], input=json.dumps({'fn': fn, 'args': args, 'cases': cases}),
                           capture_output=True, text=True, cwd=tmp, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def grab(src, pattern):
    m = re.search(pattern, src, re.M)
    assert m, pattern
    return m.group(1)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle1ParkOnlyVerticalTests(unittest.TestCase):
    """サイクル1（#473）：縦に公園しかないときは、横の神社・お寺より縦の公園（game.js の ord）"""

    @classmethod
    def setUpClass(cls):
        expr = grab((GO / 'game.js').read_text(), r"^  const ord = (.*);$")
        # 実コードの式のまま。top3 は 3件に切るだけ（縦の絞りは別テストの範囲）にして、ordAll の絞り込みだけを見る
        fn = 'const top3 = l => l.slice(0, 3); const vertFirst = x => x.v; return (%s).map(s => s.id);' % expr
        P, T = 'park', 'shrine'
        cases = [
            # 0: めいろ。縦は公園だけ、横に神社 → 縦の公園（修正前は神社だけに絞られ [shrine_e]）
            {'mazeVert': True, 'ordAll': [{'id': 'park_n', 'cat': P, 'v': True}, {'id': 'shrine_e', 'cat': T, 'v': False}]},
            # 1: めいろ。縦に神社もある → 公園は外して神社
            {'mazeVert': True, 'ordAll': [{'id': 'park_n', 'cat': P, 'v': True}, {'id': 'shrine_n', 'cat': T, 'v': True}, {'id': 'shrine_e', 'cat': T, 'v': False}]},
            # 2: めいろ以外。縦でも公園は後回し（神社だけ）
            {'mazeVert': False, 'ordAll': [{'id': 'park_n', 'cat': P, 'v': True}, {'id': 'shrine_e', 'cat': T, 'v': False}]},
            # 3: めいろ。縦が何もない（横に公園と神社）→ 神社だけ
            {'mazeVert': True, 'ordAll': [{'id': 'park_e', 'cat': P, 'v': False}, {'id': 'shrine_e', 'cat': T, 'v': False}]},
            # 4: めいろ。公園しかない → そのまま
            {'mazeVert': True, 'ordAll': [{'id': 'park_n', 'cat': P, 'v': True}, {'id': 'park_e', 'cat': P, 'v': False}]},
        ]
        cls.out = node(fn, ['mazeVert', 'ordAll'], cases)

    def test_vertical_park_beats_horizontal_shrine(self):
        self.assertEqual(self.out[0], ['park_n', 'shrine_e'])

    def test_vertical_shrine_still_beats_park(self):
        self.assertEqual(self.out[1], ['shrine_n', 'shrine_e'])

    def test_not_maze_unchanged(self):
        self.assertEqual(self.out[2], ['shrine_e'])

    def test_no_vertical_unchanged(self):
        self.assertEqual(self.out[3], ['shrine_e'])

    def test_parks_only_unchanged(self):
        self.assertEqual(self.out[4], ['park_n', 'park_e'])


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle2RainRoofNearOnlyTests(unittest.TestCase):
    """サイクル2（#474）：めいろでは雨の屋根優先は MAZE_NEAR 以内だけ（game.js の let c = ...）"""

    @classmethod
    def setUpClass(cls):
        src = (GO / 'game.js').read_text()
        expr = grab(src, r"^  let c = (.*);$")
        near = grab(src, r"^(const MAZE_NEAR_MIN = \d+, MAZE_NEAR = \d+;)$")
        fn = near + '\nconst dist = (a, x) => x.d; const me = null;\nconst c = %s;\nreturn c ? c.id : null;' % expr
        far, close = {'id': 'roof_far', 'weather': True, 'd': 2500}, {'id': 'roof_near', 'weather': True, 'd': 500}
        other = {'id': 'other', 'd': 300}
        ref = {'id': 'ref', 'refer': True, 'd': 2500}
        cases = [
            {'mazeVert': True, 'cands': [other, far]},      # 0: 遠い屋根は先にしない（修正前は roof_far）
            {'mazeVert': True, 'cands': [other, close]},    # 1: 近い屋根は先
            {'mazeVert': False, 'cands': [other, far]},     # 2: めいろ以外は遠くても屋根が先
            {'mazeVert': True, 'cands': [other, far, ref]}, # 3: 人のすすめは遠くても先
            {'mazeVert': True, 'cands': [other, {'id': 'edge', 'weather': True, 'd': 900}]},  # 4: ちょうど900mは近い側
        ]
        cls.out = node(fn, ['mazeVert', 'cands'], cases)

    def test_far_roof_not_preferred_in_maze(self):
        self.assertIsNone(self.out[0])

    def test_near_roof_preferred_in_maze(self):
        self.assertEqual(self.out[1], 'roof_near')

    def test_not_maze_roof_preferred_even_far(self):
        self.assertEqual(self.out[2], 'roof_far')

    def test_refer_still_wins(self):
        self.assertEqual(self.out[3], 'ref')

    def test_boundary_inclusive(self):
        self.assertEqual(self.out[4], 'edge')


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle3KomebanashiSeasonTests(unittest.TestCase):
    """サイクル3（#475）：月に合わない話は出さない。季節外れだけが残ったら、ひとめぐりして最初から（komebanashi.js の pick）"""

    @classmethod
    def setUpClass(cls):
        js = r"""
global.window = {}; require(%r);
const K = window.NISHIO_KOMEBANASHI, L = K.LIST;
const off = (x, m) => x.months && !x.months.includes(m);
const bad = [];
for (const area of [...new Set(L.map(x => x.area)), 'okazaki']) for (let m = 1; m <= 12; m++) {
  const pool = L.filter(x => x.area === area); const p = pool.length ? pool : L.filter(x => x.area === '*');
  if (!p.some(x => !off(x, m))) continue;   // 全部が季節外れの地区×月は対象外（そのときは何か出す）
  let s = [];
  for (let i = 0; i < 40; i++) { const r = K.pick(area, m, s); s = r.seen; if (off(r.item, m)) bad.push([area, m, r.item.id]); }
}
// 西尾・1月：てん茶(4,5月)・かき氷(5-9月)は季節外れ。ほかを全部話し終えた状態から
const inSeasonIds = L.filter(x => x.area === 'nishio' && !off(x, 1)).map(x => x.id);
const wrap = K.pick('nishio', 1, inSeasonIds);
// 西尾・5月：月の合う話(tencha, kakigori)が先に出る
const may = K.pick('nishio', 5, []);
// 月の話が一つもない地区(佐久島)は月に関係なく回る
let s = [], got = []; for (let i = 0; i < 8; i++) { const r = K.pick('sakushima', 1, s); s = r.seen; got.push(r.item.id); }
console.log(JSON.stringify({ bad, wrap: wrap.item.id, wrapSeen: wrap.seen, inSeasonIds, may: may.item.id, got }));
""" % str(GO / 'komebanashi.js')
        r = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True, cwd=tempfile.gettempdir())
        cls.out = json.loads(r.stdout)

    def test_never_off_season_story(self):
        self.assertEqual(self.out['bad'], [])

    def test_wraps_around_instead_of_off_season(self):
        # 修正前は、季節内を話し終えると残りの「季節外れ」(tencha / kakigori) が出た
        self.assertIn(self.out['wrap'], self.out['inSeasonIds'])
        self.assertNotIn(self.out['wrap'], ('tencha', 'kakigori'))
        self.assertEqual(self.out['wrapSeen'], [self.out['wrap']])   # 最初から回すので、話した記録はその1件だけ

    def test_in_season_story_first(self):
        self.assertIn(self.out['may'], ('tencha', 'kakigori'))

    def test_area_without_months_still_cycles(self):
        self.assertEqual(self.out['got'][:4], self.out['got'][4:8])
        self.assertEqual(len(set(self.out['got'][:4])), 4)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle4TubeReachTests(unittest.TestCase):
    """サイクル4（#476）：名所への道すじ終点は、筒（道すじ）がチェックイン半径に届くマス（pixel.js の tubeIn / inReachT）"""

    @classmethod
    def setUpClass(cls):
        cls.px = (GO / 'pixel.js').read_text()
        lines = [grab(cls.px, r"^  (const %s\b.*?;)(?:   //.*)?$" % n) for n in ('rch', 'inReach', 'tubeIn', 'inReachT')]
        cls.defs = '\n'.join(lines) + '\n'
        fn = ('const TILE_M = 8, MZ_K = 3, MZ_TUBE = 0.45; const G = { reachOf: () => 40, guideRadius: () => 40 };\n'
              'const mzCurves = (x, y) => curves[x + "," + y];\n' + cls.defs +
              'return { reach: inReach(cx, cy), tube: tubeIn(cx, cy), t: inReachT(cx, cy), rch };')
        # 目的地 p=(0,0) タイル座標。半径40m=5マス、near=4マス。マス(1,0) は角が近い（x=3..6 → 距離3）
        base = {'p': {'x': 0, 'y': 0}, 'cx': 1, 'cy': 0}
        far_curve = [[[5.5, 0.5], [6.5, 0.5]]]                  # 道すじは 5.95 より遠い → 半径(5)+筒(0.45) の外
        near_curve = [[[5.0, 0.5], [5.4, 0.5]]]                  # 5.4 <= 5.45 → 届く
        cases = [
            dict(base, g={'kind': 'spot'}, curves={'1,0': far_curve}),    # 0: 角は近いが道すじは遠い → 終点にしない
            dict(base, g={'kind': 'spot'}, curves={'1,0': near_curve}),   # 1: 道すじが届く → 終点
            dict(base, g={'kind': 'spot'}, curves={}),                    # 2: 区域が読めない(null) → 修正前どおり
            dict(base, g={'kind': 'npc'}, curves={'1,0': far_curve}),     # 3: 人は 道すじを見ない（話しかけられる近さ）
            dict(base, g={'kind': 'spot'}, curves={'1,0': far_curve}, cx=9),  # 4: 角も遠いマスは 当然 終点でない
        ]
        cls.out = node(fn, ['g', 'p', 'cx', 'cy', 'curves'], cases)

    def test_corner_near_but_path_far_is_not_goal(self):
        # 修正前の判定（inReach だけ）なら true になるケース
        self.assertTrue(self.out[0]['reach'])
        self.assertFalse(self.out[0]['tube'])
        self.assertFalse(self.out[0]['t'])

    def test_path_in_reach_is_goal(self):
        self.assertTrue(self.out[1]['t'])

    def test_unknown_curves_fall_back_to_reach(self):
        self.assertTrue(self.out[2]['t'])

    def test_npc_goal_ignores_tube(self):
        self.assertTrue(self.out[3]['t'])

    def test_far_cell_still_not_goal(self):
        self.assertFalse(self.out[4]['t'])

    def test_search_uses_tube_with_loose_fallback(self):
        px = self.px
        self.assertIn("if (inReachT(x, y)) { end = i; break; }", px)
        self.assertIn("if (loose < 0 && inReach(x, y)) loose = i;", px)
        self.assertIn("if (end < 0) end = loose;", px)   # 見つからない時は これまでの近さ（道すじなしにしない）
        self.assertIn("mzGateTry(a, b, gc, gr, inReachT, L)", px)


class Cycle5SearchPadTests(unittest.TestCase):
    """サイクル5（#477）：mzRoute の探索パッドは [30, 60, 120]（動かすには地図全体が要るので静的に固定）"""

    @classmethod
    def setUpClass(cls):
        cls.px = (GO / 'pixel.js').read_text()
        cls.body = cls.px[cls.px.index('function mzRoute(now)'):]

    def test_pads_extend_to_120(self):
        self.assertIn("for (const pad of [30, 60, 120]) {", self.body)
        self.assertNotIn("for (const pad of [30, 60]) {", self.px)

    def test_pad_loop_keeps_size_cap_and_stop_rules(self):
        # 120 まで広げても、面積の上限(160000)と「30で遠すぎ→探さない／それ以外は打ち切り」は残す
        self.assertIn("if (W * (y1 - y0 + 1) > 160000) { if (pad === 30) { mzRt.path = null; return; } break; }", self.body)
        self.assertIn("if (end >= 0 || capped) break;", self.body)
        self.assertIn("if (h >= 60000) { capped = true; break; }", self.body)


if __name__ == '__main__':
    unittest.main()


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle11DeadEndRewardTests(unittest.TestCase):
    """サイクル11：金の米つぶがない行き止まりにも、かおりちゃんの三河弁ひとこと（pixel.js の mzDeadTick）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'pixel.js').read_text(encoding='utf-8')
        cls.lines = json.loads(grab(cls.src, r"^const MZ_DEAD_SAY = (\[.*\]);").replace("'", '"'))

    def test_lines_are_mikawa_and_not_boku(self):
        self.assertGreaterEqual(len(self.lines), 6)
        for t in self.lines:
            self.assertNotIn('ぼく', t)
            self.assertNotIn('だに', t)   # 遠州弁は混ぜない
            self.assertNotIn('20%', t)

    def test_line_is_stable_per_cell_and_in_pool(self):
        fn = grab(self.src, r"^(const mzDeadLine = .*);\s*//").replace('const mzDeadLine = ', 'const f = ') + '; return f(cx, cy);'
        cases = [{'cx': x, 'cy': y} for x in range(0, 50, 7) for y in range(0, 50, 5)]
        a = node('const MZ_DEAD_SAY = ' + json.dumps(self.lines, ensure_ascii=False) + ';' + fn, ['cx', 'cy'], cases)
        self.assertEqual(a, node('const MZ_DEAD_SAY = ' + json.dumps(self.lines, ensure_ascii=False) + ';' + fn, ['cx', 'cy'], cases))
        self.assertTrue(set(a) <= set(self.lines))
        self.assertGreater(len(set(a)), 3)

    def test_tick_is_wired_and_guards_repeats(self):
        self.assertRegex(self.src, r'mzTrailTick\(\); mzDeadTick\(\); mzGrainTick\(\);')
        body = grab(self.src, r'(?s)(function mzDeadTick\(\) \{.*?\n\})')
        for needle in ('mzDeadSeen.has(key)', 'MZ_DEAD_GAP', 'mzGrainAt(a, b)', 'mzIsDead(a, b)'):
            self.assertIn(needle, body)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle13TodayWalkReviewTests(unittest.TestCase):
    """サイクル13：きょうのさんぽの振り返り（game.js の kaoriWalkSay・todaySpotsHtml）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'game.js').read_text(encoding='utf-8')
        cls.say = grab(cls.src, r"^(const WALK_SAY = \{.*\};)")
        cls.fn = grab(cls.src, r"^(const kaoriWalkSay = .*);")
        cls.html = grab(cls.src, r"(?s)^(function todaySpotsHtml\(day\) \{.*?\n\})")

    def test_lines_are_mikawa_and_not_boku(self):
        pool = json.loads(node(self.say + 'return JSON.stringify(Object.values(WALK_SAY));', [], [{}])[0])
        self.assertEqual(len(pool), 5)
        for t in pool:
            for bad in ('ぼく', 'だに', '20%', '％'):
                self.assertNotIn(bad, t)

    def test_say_by_walk(self):
        body = self.say + self.fn + '; return kaoriWalkSay(w, n);'
        cases = [{'w': 0, 'n': 0}, {'w': 100, 'n': 1}, {'w': 1500, 'n': 2}, {'w': 4000, 'n': 2}, {'w': 100, 'n': 3}]
        out = node(body, ['w', 'n'], cases)
        self.assertEqual(len(set(out)), 5)

    def test_spots_list_with_area_and_empty(self):
        body = ("const spots = [{id:'a',name:'西尾城',area:'nishio'},{id:'b',name:'ふつうの公園'}];"
                "const DOT_AREA = {nishio:'西尾'}; const esc = x => x;" + self.html + "; return todaySpotsHtml(day);")
        out = node(body, ['day'], [{'day': {'spots': []}}, {'day': {}}, {'day': {'spots': ['a', 'b', 'zzz']}}])
        self.assertEqual(out[0], '')
        self.assertEqual(out[1], '')
        self.assertIn('西尾城</b> <small>西尾</small>', out[2])
        self.assertIn('<b>ふつうの公園</b></li>', out[2])
        self.assertEqual(out[2].count('<li>'), 2)

    def test_wired_into_card_without_touching_log_list(self):
        self.assertIn("${todaySpotsHtml(day)}", self.src)
        self.assertIn("kaoriWalkSay(walked, (day.spots || []).length)", self.src)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle14CollectionLeftTests(unittest.TestCase):
    """サイクル14：コレクションの「のこり」表示（game.js の leftLabel）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'game.js').read_text(encoding='utf-8')
        cls.fn = grab(cls.src, r"^(const leftLabel = .*);")

    def test_left_label(self):
        cases = [{'d': 0, 't': 12}, {'d': 5, 't': 12}, {'d': 11, 't': 12}, {'d': 12, 't': 12}, {'d': 0, 't': 0}, {'d': 3, 't': 0}]
        out = node(self.fn + '; return leftLabel(d, t);', ['d', 't'], cases)
        self.assertEqual(out, ['あと12', 'あと7', 'あと1', 'コンプ！', '', ''])

    def test_wired_into_critter_and_area(self):
        self.assertIn("leftLabel(got, CRITTERS.length)", self.src)
        self.assertIn("leftLabel(p.done, p.total)", self.src)
