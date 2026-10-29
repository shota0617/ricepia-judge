import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'
IDS = ['ushitora', 'yuseki', 'shijo', 'rokuman', 'konoe', 'shokoso', 'gion', 'koto']


class JokamachiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'jokamachi.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', at: (\[[^\]]*\]|ALL), say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], IDS)
        for i, _, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('足利義氏', '西条城', '大給松平家6万石', '本丸丑寅櫓', '鍮石門', '旧近衛邸', '尚古荘', '西尾祇園祭', '三河の小京都'):
            self.assertIn(word, brief)

    def test_places_exist_in_spots(self):
        spots = json.loads((GO / 'spots.json').read_text())
        names = [s['name'] for s in (spots if isinstance(spots, list) else spots['spots'])]
        for m in re.findall(r"match: '([^']+)' }", self.src):
            self.assertTrue(any(m in n for n in names), m)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_JOKAMACHI', px)
        self.assertIn('S.pick({ city: here.city, near: S.nearKeys(G.spots', px)
        self.assertIn('jokamachiStep(hx, by, u, now);', px)
        self.assertIn('|| jokamachi.cur || chatsumi.cur) { c.cur = null', px)   # ちゃせきは 譲る
        for scene in IDS:
            self.assertIn("id === '%s'" % scene if scene != 'koto' else '三河の小京都：', px)
        self.assertIn('jokamachi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_place(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_JOKAMACHI;"
              "const spots = [{ name: '西尾市歴史公園（西尾城跡）', lat: 34.866111, lng: 137.0475 }, { name: '旧近衛邸', lat: 34.866653, lng: 137.048111 }, { name: '尚古荘', lat: 34.865402, lng: 137.049225 }];"
              "const ids = (near, l) => { const r = K.pick({ city: '西尾市', near }, l); return r && r.id; };"
              "const all = (near) => [0, 0.2, 0.4, 0.6, 0.8, 0.99].map(r => K.pick({ city: '西尾市', near }, '', () => r).id);"
              "console.log(JSON.stringify({ atCastle: K.nearKeys(spots, 34.866111, 137.0475), far: K.nearKeys(spots, 34.9, 137.1), none: K.nearKeys(null, 34.8, 137.0),"
              "castle: all(['castle']), konoe: all(['konoe']), shoko: all(['shokoso']), notSame: ids(['castle'], 'gion'), out: K.pick({ city: '蒲郡市', near: ['castle'] }),"
              "nowhere: K.pick({ city: '西尾市', near: [] }), nul: K.pick(null), still: K.STILL }));") % str(GO / 'jokamachi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertIn('castle', o['atCastle'])
        self.assertEqual(o['far'], [])
        self.assertEqual(o['none'], [])
        self.assertTrue({'ushitora', 'yuseki', 'shijo'} <= set(o['castle']))
        self.assertNotIn('konoe', o['castle'])
        self.assertNotIn('shokoso', o['castle'])
        self.assertIn('konoe', o['konoe'])
        self.assertNotIn('ushitora', o['konoe'])
        self.assertIn('shokoso', o['shoko'])
        self.assertNotEqual(o['notSame'], 'gion')
        for k in ('out', 'nowhere', 'nul'):
            self.assertIsNone(o[k], k)
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
