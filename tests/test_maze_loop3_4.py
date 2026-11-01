# 第3弾サイクル4：時限の光るゴールと寄り道ボーナス（P1 光るゴール・P4 寄り道ボーナス）
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


GAME = read('nishio-go/game.js')
PIXEL = read('nishio-go/pixel.js')
CSS = read('nishio-go/style.css')

# game.js から GLOW の部品（定数・えらび方・時間判定・ボーナス加算）だけ取り出して動かす簡易シミュレーション
NODE_GLOW = r"""
const src = require('fs').readFileSync(process.argv[1], 'utf8');
const a = src.indexOf('const GLOW = '), b = src.indexOf('function glowArm');
const c = src.indexOf('function glowArrive'), d = src.indexOf('setInterval(() => { if (glow.goal');
const dist = (p, q) => Math.hypot(p.lat - q.lat, p.lng - q.lng) * 111000;
let S = { visits: {} }, spots = [], tracked = [];
const track = n => tracked.push(n), areaZone = t => t.zone || '', mazeNow = () => true, me = { lat: 34.8, lng: 137.0 };
eval(src.slice(a, b) + src.slice(c, d) + ';globalThis.G = { GLOW, glow, glowLeft, glowMin, glowPickGoal, glowPickNear, glowArrive, glowCheckin, glowHtml, setSpots: v => { spots = v; }, setVisits: v => { S.visits = v; } };');
const esc = s => s;
const at = (id, dm, zone, extra) => ({ id, name: id, kind: 'spot', lat: 34.8 + dm / 111000, lng: 137.0, zone, ...extra });
const out = {};
// 光るゴール：いちばん遠い名所（人は光らせない）
out.pick = G.glowPickGoal(me, [at('near', 100), { ...at('man', 5000), kind: 'npc' }, at('far', 800), at('mid', 400)]).id;
out.pickNone = G.glowPickGoal(me, [{ ...at('man', 5000), kind: 'npc' }]);
out.pickNoMe = G.glowPickGoal(null, [at('a', 1)]);
// 寄り道：同じ地区・未訪問・近い順・3つまで（ゴール自身と当店はのぞく）
const goal = at('goal', 0, 'nishio');
const all = [goal, at('a', 300, 'nishio'), at('b', 100, 'nishio'), at('c', 200, 'isshiki'), at('d', 400, 'nishio'), at('e', 500, 'nishio'), at('v', 50, 'nishio'), at('shop', 60, 'nishio', { shop: true }), at('far', 3000, 'nishio')];
out.near = G.glowPickNear(goal, all, { v: { n: 1 } }, areaZone).map(x => x.id);
// 到着：光るゴールなら +20、寄り道の一覧ができる
G.setSpots(all); G.setVisits({ v: { n: 1 } });
G.glow.goal = { id: 'goal', name: 'goal', until: Date.now() + 60000 };
let lines = [];
out.arrive = G.glowArrive('goal', lines); out.arriveLines = lines;
out.nearAfter = G.glow.near.list.map(x => x.id); out.goalAfter = G.glow.goal;
out.html = G.glowHtml();
// 寄り道にチェックイン：+10・同じ所は1回だけ
lines = [];
out.hit = G.glowCheckin('b', lines); out.hitLines = lines; out.hitAgain = G.glowCheckin('b', []); out.hitOther = G.glowCheckin('zzz', []);
// 時間切れ：光りは消える（ボーナスなし・表示なし）
G.glow.near.until = Date.now() - 1; out.expired = G.glowCheckin('a', []); out.expiredHtml = G.glowHtml();
// 光るゴールの時間切れ：着いても +20 なし。寄り道は光る
G.glow.goal = { id: 'goal', name: 'goal', until: Date.now() - 1 };
lines = []; out.lateArrive = G.glowArrive('goal', lines);
// 候補なし：寄り道なし
G.setSpots([goal]); G.glow.goal = null; lines = []; out.lonely = G.glowArrive('goal', lines); out.lonelyLines = lines; out.lonelyNear = G.glow.near;
out.consts = [G.GLOW.goalPts, G.GLOW.nearPts, G.GLOW.goalMs, G.GLOW.nearMs, G.GLOW.nearMax];
console.log(JSON.stringify(out));
"""


class GlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run(['node', '-e', NODE_GLOW, os.path.join(ROOT, 'nishio-go/game.js')], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.d = json.loads(r.stdout)

    def test_node_check(self):
        for f in ('game.js', 'pixel.js'):
            r = subprocess.run(['node', '--check', os.path.join(ROOT, 'nishio-go', f)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_consts(self):
        self.assertEqual(self.d['consts'], [20, 10, 600000, 300000, 3])

    def test_goal_is_farthest_spot(self):
        self.assertEqual(self.d['pick'], 'far')
        self.assertIsNone(self.d['pickNone'])
        self.assertIsNone(self.d['pickNoMe'])

    def test_near_picks_same_area_unvisited_by_distance(self):
        self.assertEqual(self.d['near'], ['b', 'a', 'd'])

    def test_goal_arrival_adds_bonus_and_lights_detours(self):
        self.assertEqual(self.d['arrive'], 20)
        self.assertEqual(self.d['arriveLines'][0], '✨ 光るゴール！ +20')
        self.assertIn('✨ 近くの 寄り道が 5分 光るよ：', self.d['arriveLines'][1])
        self.assertIsNone(self.d['goalAfter'])
        self.assertEqual(self.d['nearAfter'], ['b', 'a', 'd'])
        self.assertIn('あと5分', self.d['html'])
        self.assertIn('光る 寄り道', self.d['html'])

    def test_detour_checkin_bonus_once(self):
        self.assertEqual(self.d['hit'], 10)
        self.assertEqual(self.d['hitLines'], ['✨ 光る 寄り道 +10'])
        self.assertEqual(self.d['hitAgain'], 0)
        self.assertEqual(self.d['hitOther'], 0)

    def test_expired_glow_disappears(self):
        self.assertEqual(self.d['expired'], 0)
        self.assertEqual(self.d['expiredHtml'], '')
        self.assertEqual(self.d['lateArrive'], 0)

    def test_no_candidates_works_as_before(self):
        self.assertEqual(self.d['lonely'], 0)
        self.assertEqual(self.d['lonelyLines'], [])
        self.assertIsNone(self.d['lonelyNear'])

    def test_wired_into_game(self):
        self.assertIn('total += glowArrive(id, lines);', GAME)
        self.assertIn('total += glowCheckin(s.id, lines);', GAME)
        self.assertIn('glowArm(S.guide);', GAME)
        self.assertIn('glowHtml()', GAME)
        self.assertIn('get glowGoal()', GAME)
        self.assertNotIn('S.glow', GAME)   # セーブには入れない

    def test_map_marker_and_style(self):
        self.assertIn('G.glowGoal', PIXEL)
        self.assertIn('G.glowNear', PIXEL)
        self.assertIn('.guide .chip.glow', CSS)
        self.assertIn('prefers-reduced-motion', CSS)


if __name__ == '__main__':
    unittest.main()
