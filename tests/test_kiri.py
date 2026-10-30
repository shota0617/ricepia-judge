import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class KiriTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'kiri.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: ([^,]+), say: '([^']+)', end: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], ['tencha', 'kawa'])
        for item in self.items:
            for t in item[3:5]:
                for ch in DECO:
                    self.assertNotIn(ch, t)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('矢作川の川霧', '西尾市で三河湾に注ぐ'):
            self.assertIn(word, brief)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_KIRI', px)
        self.assertIn('K.pick(c)', px)
        self.assertIn('kiriStep(hx, by, u, now);', px)
        self.assertIn('kiri.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_and_morning(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_KIRI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '西尾町', land: 'i', near: 'iii' }, o);"
              "const id = (o) => { const r = K.pick(c(o)); return r && r.id; };"
              "console.log(JSON.stringify({ nishio: id({}), near: id({ land: 'a', near: 'aai' }), isshiki: id({ town: '一色町' }),"
              "kira: id({ town: '吉良町' }), dry: id({ land: 'a', near: 'aaa' }), out: id({ city: '蒲郡市' }), nul: K.pick(null),"
              "h: [4, 5, 7, 8].map(K.morning) }));") % str(GO / 'kiri.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['nishio'], 'tencha')
        self.assertEqual(o['near'], 'tencha')
        self.assertEqual(o['isshiki'], 'kawa')
        self.assertEqual(o['kira'], 'kawa')
        for k in ('dry', 'out', 'nul'):
            self.assertIsNone(o[k], k)
        self.assertEqual(o['h'], [False, True, True, False])


if __name__ == '__main__':
    unittest.main()
