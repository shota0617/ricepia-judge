import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class HoridashiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'horidashi.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: '[^']+', say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual({i for i, _, _ in self.items}, {'asari', 'shijimi', 'uminina'})
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_higata_shells(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        self.assertIn('干潟：アサリ、ヤマトシジミ、ウミニナ', brief)
        for _, name, _ in self.items:
            self.assertIn(name, brief)

    def test_every_shell_has_16x16_sprite(self):
        px = (GO / 'pixel.js').read_text()
        rows = px[px.index('const CRITTER_ROWS'):px.index('const critterSprites')]
        for i, _, _ in self.items:
            m = re.search(r"^  %s: \[(.*)\],?$" % i, rows, re.M)
            self.assertIsNotNone(m, i)
            r = re.findall(r"'([^']*)'", m.group(1))
            self.assertEqual(len(r), 16, i)
            self.assertTrue(all(len(x) == 16 for x in r), i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_HORIDASHI', px)
        self.assertIn('horidashiStep(hx, by, u, now)', px)
        self.assertIn('horidashi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_HORIDASHI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: 'k' }, o);"
              "const ids = (o) => new Set([0, 0.4, 0.99].map(r => { const x = K.pick(c(o), '', () => r); return x && x.id; }));"
              "console.log(JSON.stringify({ isshiki: [...ids({ town: '一色町' })], hazu: [...ids({ town: '東幡豆町' })],"
              "kira: K.pick(c({ town: '吉良町' })), land: K.pick(c({ town: '一色町', near: 'a' })),"
              "out: K.pick(c({ city: '蒲郡市', town: '一色町' })), none: K.pick(null),"
              "again: K.pick(c({ town: '一色町' }), 'asari', () => 0).id, still: K.STILL, dig: K.DIG, cycle: K.CYCLE }));") % str(GO / 'horidashi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(set(o['isshiki']), {'asari', 'shijimi', 'uminina'})
        self.assertEqual(o['hazu'], ['asari'])     # 幡豆は アサリだけ
        self.assertIsNone(o['kira'])               # 吉良は ゆあみ（ワイキキビーチ）
        self.assertIsNone(o['land'])               # 海べでない 所では 出ない
        self.assertIsNone(o['out'])                # 西尾市の 外では 出ない
        self.assertIsNone(o['none'])
        self.assertNotEqual(o['again'], 'asari')   # 前と 同じ 貝は つづけない
        self.assertLess(o['still'], 12)
        self.assertLess(o['dig'], o['cycle'])


if __name__ == '__main__':
    unittest.main()
