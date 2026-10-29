import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class YuamiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'yuami.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, where: '\w+')?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual({i for i, _, _ in self.items}, {'onsen', 'beach'})
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_places(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for _, name, _ in self.items:
            self.assertIn(name, brief)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn("y.cur.id === 'onsen'", px)
        self.assertIn('// ビーチ：波の しま', px)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_YUAMI.pick(', px)
        self.assertIn('yuamiStep(hx, by, u, now)', px)
        self.assertIn('yuami.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_YUAMI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '' }, o);"
              "const id = (o) => { const r = K.pick(c(o)); return r && r.id; };"
              "console.log(JSON.stringify({ kira: id({ town: '吉良町' }), sea: id({ town: '吉良町', near: 'kk' }),"
              "isshiki: id({ town: '一色町', near: 'k' }), nishio: id({ town: '西尾町' }),"
              "out: id({ city: '蒲郡市', town: '吉良町' }), none: K.pick(null), still: K.STILL }));") % str(GO / 'yuami.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['kira'], 'onsen')      # 海べでない 吉良は 温泉
        self.assertEqual(o['sea'], 'beach')       # 海べの 吉良は ワイキキビーチ
        self.assertIsNone(o['isshiki'])           # 吉良の 外では 出ない
        self.assertIsNone(o['nishio'])
        self.assertIsNone(o['out'])               # 西尾市の 外では 出ない
        self.assertIsNone(o['none'])
        self.assertLess(o['still'], 12)           # ねむる より 前に 出る


if __name__ == '__main__':
    unittest.main()
