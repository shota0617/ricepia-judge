# 第4弾サイクル26：総点検（期限で焦らせる仕組みと自動の宣伝トーストを外す）
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
const a = src.indexOf('const GLOW = '), b = src.indexOf('function glowArm');
const c = src.indexOf('function glowArm'), d = src.indexOf('let treasureMk');
const dist = (p, q) => Math.hypot(p.lat - q.lat, p.lng - q.lng) * 111000;
let S = { visits: {}, treasureGot: undefined }, spots = [], tracked = [];
const track = () => {}, save = () => {}, esc = s => s, fmtM = m => Math.round(m) + 'm', areaZone = t => t.zone || '', mazeNow = () => true, me = { lat: 34.8, lng: 137.0 };
const treasureMarker = () => {};
eval(src.slice(a, b) + src.slice(c, d) + ';globalThis.G = { glow, glowArm, glowArrive, glowCheckin, glowHtml, treasure, treasureArm, treasureCheckin, treasureHtml, setSpots: v => { spots = v; }, setGuide: v => { S.guide = v; } };');
const at = (id, dm, zone) => ({ id, name: id, kind: 'spot', lat: 34.8 + dm / 111000, lng: 137.0, zone });
const out = {};
const goal = at('goal', 0, 'z'), all = [goal, at('a', 100, 'z'), at('b', 200, 'z')];
G.setSpots(all);
// 光るゴール：旧形式（until が過去）でも 着けば +20、寄り道 +10
G.glow.goal = { id: 'goal', name: 'goal', until: Date.now() - 86400000 };
let lines = [];
out.goal = G.glowArrive('goal', lines); out.lines = lines;
G.glow.near.until = Date.now() - 86400000;
out.near = G.glowCheckin('a', []); out.nearAgain = G.glowCheckin('a', []);
out.glowHtml = G.glowHtml();
// glowArm は 既存の光るゴールを 維持
G.glow.goal = { id: 'goal', name: 'goal' };
G.glowArm({ id: 'goal', kind: 'spot', alts: [at('b', 200, 'z')] });
out.kept = G.glow.goal.id === 'goal' && !('until' in G.glow.goal);
// お宝：時間が たっても 同じ場所で +15
G.treasure.cur = { id: 'a', name: 'a', lat: 34.8, lng: 137.0, until: 1 };
out.tHtml = G.treasureHtml(); out.t = G.treasureCheckin('a', []);
console.log(JSON.stringify(out));
"""


class Cycle26Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run(['node', '-e', NODE, os.path.join(ROOT, 'nishio-go/game.js')], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.d = json.loads(r.stdout)

    def test_no_deadline_consts(self):
        glow = re.search(r'const GLOW = \{[^}]*\}', GAME).group(0)
        tre = re.search(r'const TREASURE = \{[^}]*\}', GAME).group(0)
        for k in ('goalMs', 'nearMs'):
            self.assertNotIn(k, glow)
        self.assertNotIn('lifeMs', tre)
        self.assertIn('goalPts: 20', glow)
        self.assertIn('pts: 15', tre)

    def test_glow_arrives_late(self):
        self.assertEqual(self.d['goal'], 20)
        self.assertIn('✨ 近くの 寄り道が 光るよ：a・b', self.d['lines'])
        self.assertEqual(self.d['near'], 10)
        self.assertEqual(self.d['nearAgain'], 0)
        self.assertTrue(self.d['kept'])

    def test_treasure_stays(self):
        self.assertEqual(self.d['t'], 15)

    def test_no_minutes_left_text(self):
        for h in (self.d['glowHtml'], self.d['tHtml']):
            self.assertNotRegex(h, r'あと.*分')
        self.assertNotIn('glowLeft', GAME)
        self.assertNotIn('glowMin', GAME)

    def test_auto_toasts_removed(self):
        for w in ('今週は「', 'いま キラの時間！（', 'あしたも来ると', 'nsg_theme_wk', 'nsg_kira_day', 'nsg_tmr_day'):
            self.assertNotIn(w, GAME)
        self.assertIn('tomorrowItems', GAME)
        self.assertIn('weekTheme', GAME)
        self.assertIn('setTimeout(a2hsOffer, 4200)', GAME)

    def test_no_forbidden_words(self):
        r = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go'], capture_output=True, text=True, cwd=ROOT, check=True)
        added = '\n'.join(l for l in r.stdout.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
