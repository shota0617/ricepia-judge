import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'
IDS = ['bijutsu', 'kyodai', 'nozoku']


class MangekyoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'mangekyo.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], IDS)
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)
            self.assertIsNone(re.search(r'\d', t), i)   # ブリーフに ない 数字は 使わない

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        self.assertIn('三河ガラス工芸美術館の巨大万華鏡', brief)

    def test_place_exists_in_spots(self):
        spots = json.loads((GO / 'spots.json').read_text())
        names = [s['name'] for s in (spots if isinstance(spots, list) else spots['spots'])]
        place = re.search(r"PLACE = '([^']+)'", self.src).group(1)
        self.assertTrue(any(place in n for n in names))

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_MANGEKYO', px)
        self.assertIn('S.near(G.spots', px)
        self.assertIn('mangekyoStep(hx, by, u, now);', px)
        self.assertIn('roll.idle > 12 || jokamachi.cur || chatsumi.cur || mangekyo.cur || kawabe.cur) { c.cur = null', px)   # ちゃせきは 譲る
        for scene in IDS[:2]:
            self.assertIn("id === '%s'" % scene, px)
        self.assertIn('mangekyo.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_place(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_MANGEKYO;"
              "const spots = [{ name: '三河工芸ガラス美術館', lat: 34.853231, lng: 137.024261 }];"
              "console.log(JSON.stringify({ at: K.near(spots, 34.853231, 137.024261), far: K.near(spots, 34.9, 137.1), none: K.near(null, 34.8, 137.0),"
              "seq: [0, 0.5, 0.99].map(r => K.pick({ city: '西尾市', near: true }, '', () => r).id),"
              "notSame: K.pick({ city: '西尾市', near: true }, 'kyodai').id,"
              "out: K.pick({ city: '蒲郡市', near: true }), nowhere: K.pick({ city: '西尾市', near: false }), nul: K.pick(null), still: K.STILL }));") % str(GO / 'mangekyo.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertTrue(o['at'])
        self.assertFalse(o['far'])
        self.assertFalse(o['none'])
        self.assertEqual(o['seq'], IDS)
        self.assertNotEqual(o['notSame'], 'kyodai')
        for k in ('out', 'nowhere', 'nul'):
            self.assertIsNone(o[k], k)
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
