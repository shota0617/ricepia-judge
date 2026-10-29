import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'
IDS = ['ichibo', 'tsumi', 'tencha', 'kiri']


class ChatsumiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'chatsumi.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)',(?: months: \[[\d, ]+\],)? say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], IDS)
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('稲荷山茶園公園から茶畑を一望', '茶摘みは4月末〜5月', 'てん茶', '生産量が日本有数', '矢作川の川霧', '温暖な気候'):
            self.assertIn(word, brief)
        for _, _, t in self.items:
            self.assertNotIn('100', t)   # スポットの 説明にしか ない 数字は 使わない

    def test_place_exists_in_spots(self):
        spots = json.loads((GO / 'spots.json').read_text())
        names = [s['name'] for s in (spots if isinstance(spots, list) else spots['spots'])]
        place = re.search(r"PLACE = '([^']+)'", self.src).group(1)
        self.assertTrue(any(place in n for n in names))

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_CHATSUMI', px)
        self.assertIn('S.near(G.spots', px)
        self.assertIn('chatsumiStep(hx, by, u, now);', px)
        self.assertIn('|| jokamachi.cur || chatsumi.cur) { c.cur = null', px)   # ちゃせきは 譲る
        for scene in IDS:
            self.assertIn("id === '%s'" % scene if scene != 'kiri' else '川霧と 土：', px)
        self.assertIn('chatsumi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_place_and_month(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_CHATSUMI;"
              "const spots = [{ name: '稲荷山茶園公園', lat: 34.88184, lng: 137.041995 }];"
              "const ids = (month) => [0, 0.2, 0.4, 0.6, 0.8, 0.99].map(r => K.pick({ city: '西尾市', near: true, month }, '', () => r).id);"
              "console.log(JSON.stringify({ at: K.near(spots, 34.88184, 137.041995), far: K.near(spots, 34.9, 137.1), none: K.near(null, 34.8, 137.0),"
              "may: ids(5), oct: ids(10), notSame: K.pick({ city: '西尾市', near: true, month: 10 }, 'tencha').id,"
              "out: K.pick({ city: '蒲郡市', near: true, month: 5 }), nowhere: K.pick({ city: '西尾市', near: false, month: 5 }), nul: K.pick(null), still: K.STILL }));") % str(GO / 'chatsumi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertTrue(o['at'])
        self.assertFalse(o['far'])
        self.assertFalse(o['none'])
        self.assertIn('tsumi', o['may'])
        self.assertNotIn('tsumi', o['oct'])   # 茶摘みは 4〜5月だけ
        self.assertNotEqual(o['notSame'], 'tencha')
        for k in ('out', 'nowhere', 'nul'):
            self.assertIsNone(o[k], k)
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
