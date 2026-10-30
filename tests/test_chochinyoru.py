import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class ChochinyoruTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'chochinyoru.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], ['tomoru', 'narabu', 'miage'])
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        self.assertIn('巨大な提灯で知られる', brief)
        self.assertIn('一色大提灯まつり', brief)
        for _, _, t in self.items:
            self.assertIsNone(re.search(r'[0-9０-９]', t))   # 日付・数は ブリーフに 無い

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_CHOCHINYORU', px)
        self.assertIn('S.pick(Object.assign(c, { night: true }), m.last)', px)
        self.assertIn('chochinyoruStep(hx, by, u, now);', px)
        self.assertIn('roll.idle > 12 || chochinyoru.cur', px)   # いっしきさんぽは 譲る
        self.assertIn('!n || chochinyoru.cur', px)               # めぐりの 輪も 休む
        for scene in ('tomoru', 'narabu'):
            self.assertIn("id === '%s'" % scene, px)
        self.assertIn('chochinyoru.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_night_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_CHOCHINYORU;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '一色町', near: 'aaa', night: true }, o);"
              "const id = (o, l) => { const r = K.pick(c(o), l); return r && r.id; };"
              "console.log(JSON.stringify({ a: id({}), notSame: id({}, 'narabu'), day: id({ night: false }), sea: id({ near: 'aak' }),"
              "saku: id({ town: '一色町佐久島' }), kira: id({ town: '吉良町' }), nishio: id({ town: '西尾町' }), out: id({ city: '蒲郡市' }),"
              "none: K.pick(null), seq: [0, 0.4, 0.99].map(r => K.pick(c({}), '', () => r).id), still: K.STILL }));") % str(GO / 'chochinyoru.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertIsNotNone(o['a'])
        self.assertNotEqual(o['notSame'], 'narabu')
        for k in ('day', 'sea', 'saku', 'kira', 'nishio', 'out', 'none'):
            self.assertIsNone(o[k], k)
        self.assertEqual(o['seq'], ['tomoru', 'narabu', 'miage'])
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
