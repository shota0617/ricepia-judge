# 第4弾サイクル32：穏やかな光の永続化（閉じても残る光・寄り道の保持）
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


GAME = read('nishio-go/game.js')

NODE = r"""
const src = require('fs').readFileSync(process.argv[1], 'utf8');
const a = src.indexOf('const GLOW = '), d = src.indexOf('let treasureMk');
const dist = (p, q) => Math.hypot(p.lat - q.lat, p.lng - q.lng) * 111000;
const code = src.slice(a, d);
const at = (id, dm, extra) => Object.assign({ id, name: id, kind: 'spot', lat: 34.8 + dm / 111000, lng: 137.0, zone: 'z' }, extra || {});
function mk(S, spots) {
  const env = { saves: 0 };
  const f = new Function('S', 'spots', 'env', 'dist', 'track', 'esc', 'fmtM', 'areaZone', 'mazeNow', 'me', 'treasureMarker',
    'const save = () => { env.saves++; };' + code +
    ';return { glow, glowMergeNear, glowCleanSaved, glowCleanOne, glowArrive, glowCheckin, glowRestore, glowArm, treasure, treasureSpawn, treasureRestore, treasureCheckin, treasureArm, env };');
  return f(S, spots, env, dist, () => {}, s => s, m => m + 'm', t => t.zone || '', () => true, { lat: 34.8, lng: 137.0 }, () => {});
}
const out = {};
// 純関数
const G0 = mk({ visits: {} }, []);
const o = (id) => ({ id, name: id, lat: 34.8, lng: 137.0 });
const m1 = G0.glowMergeNear([o('a'), o('b')], [o('b'), o('c'), { id: '', lat: 1, lng: 1 }, { id: 'x', lat: NaN, lng: 1 }, null, o('goal'), o('d'), o('e'), o('f'), o('g')], 6, 'goal');
out.merge = m1.map(x => x.id);
out.mergeBad = G0.glowMergeNear(null, undefined, 6).length;
out.mergeDet = JSON.stringify(G0.glowMergeNear([o('a')], [o('b')], 6)) === JSON.stringify(G0.glowMergeNear([o('a')], [o('b')], 6));
const byId = { ok: at('ok', 10), vis: at('vis', 20), shop: at('shop', 30, { shop: true }), npc: at('npc', 40, { kind: 'npc' }), bad: at('bad', 50, { lat: NaN }) };
const cl = G0.glowCleanSaved([{ id: 'ok', name: 'OLD', lat: 0, lng: 0 }, { id: 'ghost' }, { id: 'vis' }, { id: 'shop' }, { id: 'npc' }, { id: 'bad' }, { id: 'ok' }], byId, { vis: { last: 1 } });
out.clean = cl; out.cleanOne = G0.glowCleanOne({ id: 'vis' }, byId, { vis: 1 });
// 同期と復元
const goal = at('goal', 0), spots = [goal, at('a', 100), at('b', 200), at('c', 300), at('t', 400), at('g2', 1500), at('n1', 1600), at('n2', 1700), at('n3', 1800), at('g3', 3000), at('m1', 3100), at('m2', 3200)];
const S1 = { visits: {}, guide: { id: 'zzz' } };
const A = mk(S1, spots);
A.glow.goal = { id: 'goal', name: 'goal', lat: goal.lat, lng: goal.lng };
let lines = [];
A.glowArrive('goal', lines);
out.saves1 = A.env.saves;
out.syncGoal = S1.glowGoal; out.syncNear = S1.glowNear.map(x => x.id);
A.glowCheckin('a', []);
out.saves2 = A.env.saves;
out.afterCheckin = S1.glowNear.map(x => x.id);
A.treasureSpawn('');
out.saves3 = A.env.saves;
out.syncTre = S1.treasureSpot && S1.treasureSpot.id;
// 閉じて開き直す
const saved = JSON.parse(JSON.stringify(S1));
const S2 = Object.assign({ visits: {}, guide: { id: 'zzz' } }, saved);
const B = mk(S2, spots);
B.glowRestore(); B.treasureRestore();
out.restoredNear = B.glow.near && B.glow.near.list.map(x => x.id);
out.restoredTre = B.treasure.cur && B.treasure.cur.id;
// 訪問済みは戻らない
const S3 = Object.assign({}, JSON.parse(JSON.stringify(saved)), { visits: { b: { last: 1 }, [out.syncTre]: { last: 1 } }, guide: null });
const C = mk(S3, spots); C.glowRestore(); C.treasureRestore();
out.visitedNear = C.glow.near && C.glow.near.list.map(x => x.id);
out.visitedTre = C.treasure.cur;
// 行き先と重なるお宝は戻らず湧かせ直し
const S4 = Object.assign({}, JSON.parse(JSON.stringify(saved)), { visits: {}, guide: { id: out.syncTre } });
const D = mk(S4, spots); D.glowRestore(); D.treasureRestore();
out.overlapRestore = D.treasure.cur; D.treasureArm(); out.overlapRespawn = D.treasure.cur && D.treasure.cur.id;
// 壊れたセーブ
const E = mk({ visits: {}, glowGoal: 5, glowNear: 'x', treasureSpot: [], treasureLast: 7 }, spots);
E.glowRestore(); E.treasureRestore();
out.broken = [E.glow.goal, E.glow.near, E.treasure.cur, E.treasure.last];
// 寄り道の保持（3＋3→6、重複なし）
const S5 = { visits: {} };
const F = mk(S5, spots);
F.glowArrive('goal', []);
const first = S5.glowNear.map(x => x.id);
F.glowArrive('g2', []);
out.first = first; out.second = S5.glowNear.map(x => x.id);
// 上限いっぱいのときの到着：新しい候補は落ち、案内も出ない（Codex指摘の回帰）
const S6 = { visits: {} };
const H = mk(S6, spots);
H.glowArrive('goal', []); H.glowArrive('g2', []);
const lines3 = []; H.glowArrive('g3', lines3);
out.capNear = S6.glowNear.map(x => x.id); out.capLines = lines3;
console.log(JSON.stringify(out));
"""


class Cycle32Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run(['node', '-e', NODE, os.path.join(ROOT, 'nishio-go/game.js')], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.d = json.loads(r.stdout)

    def test_merge(self):
        self.assertEqual(self.d['merge'], ['a', 'b', 'c', 'd', 'e', 'f'])
        self.assertEqual(self.d['mergeBad'], 0)
        self.assertTrue(self.d['mergeDet'])

    def test_clean(self):
        self.assertEqual(self.d['clean'], [{'id': 'ok', 'name': 'ok', 'lat': self.d['clean'][0]['lat'], 'lng': 137.0}])
        self.assertNotEqual(self.d['clean'][0]['lat'], 0)
        self.assertIsNone(self.d['cleanOne'])

    def test_sync(self):
        self.assertEqual(self.d['syncGoal'], None)
        self.assertEqual(self.d['syncNear'], ['a', 'b', 'c'])
        self.assertEqual(self.d['afterCheckin'], ['b', 'c'])
        self.assertIsNotNone(self.d['syncTre'])
        self.assertGreaterEqual(self.d['saves1'], 1)
        self.assertGreater(self.d['saves2'], self.d['saves1'])
        self.assertGreater(self.d['saves3'], self.d['saves2'])

    def test_cap_announce(self):
        self.assertEqual(self.d['capNear'], ['a', 'b', 'c', 'n1', 'n2', 'n3'])
        self.assertEqual(self.d['capLines'], [])

    def test_reopen(self):
        self.assertEqual(self.d['restoredNear'], ['b', 'c'])
        self.assertEqual(self.d['restoredTre'], self.d['syncTre'])
        self.assertEqual(self.d['visitedNear'], ['c'])
        self.assertIsNone(self.d['visitedTre'])
        self.assertIsNone(self.d['overlapRestore'])
        self.assertNotEqual(self.d['overlapRespawn'], self.d['syncTre'])
        self.assertEqual(self.d['broken'], [None, None, None, ''])

    def test_near_accumulates(self):
        self.assertEqual(self.d['first'], ['a', 'b', 'c'])
        self.assertEqual(self.d['second'], ['a', 'b', 'c', 'n1', 'n2', 'n3'])

    def test_static(self):
        self.assertIn('nearCap: 6', re.search(r'const GLOW = \{[^}]*\}', GAME).group(0))
        fs = re.search(r'function freshState\(\) \{.*?\n\}', GAME, re.S).group(0)
        for k in ("glowGoal: null", "glowNear: []", "treasureSpot: null", "treasureLast: ''"):
            self.assertIn(k, fs)
        i = GAME.index('glowRestore(); treasureRestore();')
        self.assertLess(i, GAME.index('treasureArm();   // 名所が'))

    def test_no_forbidden_words(self):
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%'):
            self.assertNotIn(w, added)
