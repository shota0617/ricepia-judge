import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'
IDS = ['yamanami', 'skyline', 'carnation', 'hana']


class HazusanpoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'hazusanpo.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], IDS)
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)
            self.assertIsNone(re.search(r'\d', t), i)   # ブリーフに ない 数字・月は 使わない

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('三ヶ根山（幡豆地区の山並み・スカイライン）', 'カーネーション（花き産地）', 'あじさい', 'ひまわり畑'):
            self.assertIn(word, brief)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_HAZUSANPO', px)
        self.assertIn('S.pick(c, m.last)', px)
        self.assertIn('hazusanpoStep(hx, by, u, now);', px)
        for scene in IDS:
            self.assertIn("id === '%s'" % scene if scene != 'hana' else 'あじさいと ひまわり畑：', px)
        self.assertIn('hazusanpo.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_HAZUSANPO;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '東幡豆町', near: 'aaa' }, o);"
              "const id = (o, l) => { const r = K.pick(c(o), l); return r && r.id; };"
              "console.log(JSON.stringify({ a: id({}), west: id({ town: '西幡豆町' }), notSame: id({}, 'hana'), sea: id({ near: 'aak' }),"
              "isshiki: id({ town: '一色町' }), kira: id({ town: '吉良町' }), nishio: id({ town: '西尾町' }), out: id({ city: '蒲郡市' }), none: K.pick(null),"
              "seq: [0, 0.3, 0.6, 0.99].map(r => K.pick(c({}), '', () => r).id), still: K.STILL }));") % str(GO / 'hazusanpo.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertIsNotNone(o['a'])
        self.assertIsNotNone(o['west'])
        self.assertNotEqual(o['notSame'], 'hana')
        for k in ('sea', 'isshiki', 'kira', 'nishio', 'out', 'none'):
            self.assertIsNone(o[k], k)
        self.assertEqual(o['seq'], IDS)
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
