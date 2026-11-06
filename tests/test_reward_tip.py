import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'

# サイクル12：到達カード（ごほうび窓）の「💡 名物の一言」。実コードの spotTip を切り出して Node で動かす。
RUN = r"""
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const window = {}; new Function('window', d.meibutsu)(window);
const MEIBUTSU = window.NISHIO_MEIBUTSU, AREA_TIP = window.NISHIO_AREA_TIP;
const spotMeibutsu = new Function('MEIBUTSU', 'return ' + d.sm)(MEIBUTSU);
const spotTip = new Function('spotMeibutsu', 'AREA_TIP', 'return ' + d.st)(spotMeibutsu, AREA_TIP);
console.log(JSON.stringify(d.spots.map(s => spotTip(s))));
"""


@unittest.skipUnless(shutil.which('node'), 'node がない')
class RewardTipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.game = (GO / 'game.js').read_text(encoding='utf-8')
        sm = re.search(r"^const spotMeibutsu = (.+);$", cls.game, re.M).group(1)
        st = re.search(r"^const spotTip = (.+);$", cls.game, re.M).group(1)
        raw = json.loads((GO / 'spots.json').read_text(encoding='utf-8'))['spots']
        cls.spots = [dict(s, id='f-' + s['id'], featured=True) for s in raw if not s.get('shop')]
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run(['node', '-e', RUN], text=True, capture_output=True, cwd=tmp, timeout=60, input=json.dumps({
                'meibutsu': (GO / 'meibutsu.js').read_text(encoding='utf-8'), 'sm': sm, 'st': st, 'spots': cls.spots}))
        assert r.returncode == 0, r.stderr
        cls.tips = json.loads(r.stdout)

    def test_coverage_and_no_empty_lie(self):
        have = [t for t in self.tips if t]
        self.assertGreater(len(have), 40)   # 西尾・一色・吉良・幡豆・佐久島と、名物ゆかりの場所
        self.assertTrue(all(isinstance(t, str) for t in self.tips))

    def test_known_spots(self):
        by = {s['id']: t for s, t in zip(self.spots, self.tips)}
        self.assertIn('特許庁', by['f-kojuin'])
        self.assertIn('一色', by['f-isshiki-sakana'])
        # となりまちで、名物ゆかりでも地区の一言でもない所は、出さない（空）
        empties = [s['id'] for s, t in zip(self.spots, self.tips) if not t]
        self.assertTrue(empties)

    def test_voice_rules(self):
        src = (GO / 'meibutsu.js').read_text(encoding='utf-8')
        tips = re.findall(r"tip: '([^']+)'", src) + re.findall(r"^  \w+: '([^']+)',$", src.split('NISHIO_AREA_TIP')[1], re.M)
        self.assertGreaterEqual(len(tips), 9)
        for t in tips:
            self.assertNotIn('ぼく', t)
            self.assertNotIn('だに', t)   # 遠州弁
            self.assertNotIn('20%', t)
            self.assertLessEqual(len(t), 40)   # 1行

    def test_no_stopping_card(self):
        # 運営者の声（2026-11-06）「ゲームが止まるカードは廃止」：ごほうびは 浮き文字と 上の1行だけ
        g = self.game
        i = g.index('function showReward(')
        body = g[i:g.index('\n}\n', i)]
        self.assertNotIn("classList.add('show')", body)
        self.assertNotIn('innerHTML', body)
        self.assertIn('floatText', body)
        self.assertIn('toast(', body)
        self.assertIn('rewardBusy', g)
        self.assertNotIn("setTimeout(() => endingWhenFree(key), 900)", g)   # 殿堂入りの 記録は 自動で 開かない（バッジから）

if __name__ == '__main__':
    unittest.main()
