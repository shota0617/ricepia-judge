# 第3弾サイクル10：きらきらお宝（モンスターハンターNow の「近くに湧く」）。第4弾サイクル26で期限なしに変更
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


GAME = read('nishio-go/game.js')
CSS = read('nishio-go/style.css')

# game.js から TREASURE の部品だけ取り出して動かす簡易シミュレーション
NODE = r"""
const src = require('fs').readFileSync(process.argv[1], 'utf8');
const a = src.indexOf('const TREASURE = '), b = src.indexOf('let treasureMk');
const dist = (p, q) => Math.hypot(p.lat - q.lat, p.lng - q.lng) * 111000;
let S = { visits: {}, treasureGot: undefined }, spots = [], me = { lat: 34.8, lng: 137.0 };
const track = () => {}, save = () => {}, esc = s => s;
const fmtM = m => Math.round(m) + 'm';
const treasureMarker = () => {};
eval(src.slice(a, b) + ';globalThis.G = { TREASURE, treasure, treasurePick, treasureArm, treasureCheckin, treasureHtml, setSpots: v => { spots = v; }, setVisits: v => { S.visits = v; }, setGuide: v => { S.guide = v; }, got: () => S.treasureGot };');
const at = (id, dm, extra) => ({ id, name: id, kind: 'spot', lat: 34.8 + dm / 111000, lng: 137.0, ...extra });
const out = {};
const all = [at('far', 1500), at('near', 100), at('mid', 500), at('seen', 50), at('shop', 20, { shop: true }), at('man', 10, { kind: 'npc' }), at('out', 2500)];
out.pick = G.treasurePick(me, all, { seen: { n: 1 } }).id;
out.pickNone = G.treasurePick(me, [at('out', 2500), at('man', 10, { kind: 'npc' })], {});
out.pickNoMe = G.treasurePick(null, all, {});
out.consts = [G.TREASURE.pts, G.TREASURE.radiusM];
// 湧く・ゲット
G.setSpots(all); G.setVisits({ seen: { n: 1 } });
G.treasureArm();
out.armed = G.treasure.cur.id; out.noUntil = !('until' in G.treasure.cur);
out.html = G.treasureHtml();
let lines = [];
out.other = G.treasureCheckin('mid', lines);
out.hit = G.treasureCheckin('near', lines); out.hitLines = lines; out.got = G.got();
out.respawn = G.treasure.cur.id;
G.setVisits({ seen: { n: 1 }, near: { n: 1 } });
out.again = G.treasureCheckin('near', []);
// 期限なし：旧形式の until が過去でも、時間が たっても 同じ場所で +15・表示も残る
G.treasure.cur.until = Date.now() - 1;
const old = G.treasure.cur.id;
out.lateHtml = G.treasureHtml(); G.treasureArm(); out.stay = G.treasure.cur.id === old;
out.late = G.treasureCheckin(old, []);
out.afterLate = G.treasure.cur ? G.treasure.cur.id : null; out.old = old;
// 行き先の除外：行き先と同じ名所は選ばない（選び方・湧き直しの両方）
out.pickGuide = G.treasurePick(me, all, { seen: { n: 1 } }, '', 'near').id;
G.setSpots(all); G.setVisits({ seen: { n: 1 } });
G.treasure.cur = { id: 'near', name: 'near', lat: 34.8, lng: 137.0, until: Date.now() + 600000 }; G.treasure.last = '';
G.setGuide({ id: 'near', kind: 'spot' });
G.treasureArm(); out.guideConflict = G.treasure.cur.id;
G.setGuide(null);
// 行き先変更直後の重なり：行き先になったお宝にチェックインしても報酬なしで湧き直す
G.treasure.cur = { id: 'near', name: 'near', lat: 34.8, lng: 137.0, until: Date.now() + 600000 }; G.treasure.last = '';
G.setGuide({ id: 'near', kind: 'spot' });
out.guideHit = G.treasureCheckin('near', []); out.guideHitAfter = G.treasure.cur.id;
G.setGuide(null);
// 候補が1か所だけ：時間切れのあと、同じ場所にすぐ復活しない（別の候補が出るまで待つ）
G.setSpots([at('solo', 100)]); G.setVisits({});
G.treasure.cur = null; G.treasure.last = '';
G.treasureArm(); out.solo = G.treasure.cur.id;
G.setGuide({ id: 'solo', kind: 'spot' }); G.treasureArm(); out.soloAfter = G.treasure.cur; G.setGuide(null);
G.treasureArm(); out.soloAgain = G.treasure.cur;
console.log(JSON.stringify(out));
"""


class TreasureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run(['node', '-e', NODE, os.path.join(ROOT, 'nishio-go/game.js')], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.d = json.loads(r.stdout)

    def test_node_check(self):
        r = subprocess.run(['node', '--check', os.path.join(ROOT, 'nishio-go/game.js')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_consts(self):
        self.assertEqual(self.d['consts'], [15, 2000])

    def test_pick(self):
        self.assertEqual(self.d['pick'], 'near')   # 近い順・行った所と人と当店は除く
        self.assertIsNone(self.d['pickNone'])
        self.assertIsNone(self.d['pickNoMe'])

    def test_spawn_and_html(self):
        self.assertEqual(self.d['armed'], 'near')
        self.assertTrue(self.d['noUntil'])
        self.assertIn('🎁 きらきらお宝：near +15pt', self.d['html'])
        self.assertNotIn('あと', self.d['html'])

    def test_hit(self):
        self.assertEqual(self.d['other'], 0)
        self.assertEqual(self.d['hit'], 15)
        self.assertIn('🎁 きらきらお宝ゲット！ +15', self.d['hitLines'])
        self.assertEqual(self.d['got'], 1)   # 欠けていた S.treasureGot は 0 扱い
        self.assertEqual(self.d['again'], 0)

    def test_respawn_other_spot(self):
        self.assertNotEqual(self.d['respawn'], 'near')
        self.assertEqual(self.d['respawn'], 'mid')

    def test_no_deadline(self):
        self.assertIn('きらきらお宝', self.d['lateHtml'])
        self.assertTrue(self.d['stay'])
        self.assertEqual(self.d['late'], 15)   # 時間が たっても 同じ場所で +15
        self.assertNotEqual(self.d['afterLate'], self.d['old'])

    def test_guide_excluded(self):
        self.assertEqual(self.d['pickGuide'], 'mid')   # 行き先 near は選ばない
        self.assertEqual(self.d['guideConflict'], 'mid')   # 湧いたあと行き先が重なっても湧き直す
        self.assertEqual(self.d['guideHit'], 0)   # 行き先変更直後の重なりでも報酬なし
        self.assertEqual(self.d['guideHitAfter'], 'mid')

    def test_single_candidate_waits(self):
        self.assertEqual(self.d['solo'], 'solo')
        self.assertIsNone(self.d['soloAfter'])   # 行き先と重なって消え、すぐ復活しない
        self.assertIsNone(self.d['soloAgain'])   # 次のタイマーでも同じ場所に復活しない

    def test_wiring(self):
        for k in ('treasureCheckin(s.id, lines)', 'treasureHtml()', 'treasureGot: 0', 'S.treasureGot || 0', 'お宝ゲット'):
            self.assertIn(k, GAME)
        self.assertIn('treasure-mk', CSS)
        self.assertIn('prefers-reduced-motion', CSS[CSS.index('.treasure-mk'):])

    def test_no_forbidden_words(self):
        for w in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(w, GAME[GAME.index('const TREASURE'):GAME.index('function mazeGoal')])


if __name__ == '__main__':
    unittest.main()
