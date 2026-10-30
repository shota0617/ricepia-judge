import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class ChasetsuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'chasetsu.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: NIS, (?:months: \[[\d, ]+\], )?say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual({i for i, _, _ in self.items}, {'matcha', 'shincha'})
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('石臼で挽いて自分で点てる', '新茶', '茶摘みは4月末〜5月'):
            self.assertIn(word, brief)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_CHASETSU', px)
        self.assertIn('C.pick(f,', px)
        self.assertIn('chasetsuStep(hx, by, u, now)', px)
        self.assertIn('chasetsu.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_month(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_CHASETSU;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '西尾町' }, o);"
              "const id = (o, m) => { const r = K.pick(c(o), m); return r && r.id; };"
              "console.log(JSON.stringify({ apr: id({}, 4), may: id({}, 5), oct: id({}, 10),"
              "isshiki: id({ town: '一色町' }, 4), kira: id({ town: '吉良町' }, 10), hazu: id({ town: '東幡豆町' }, 5),"
              "out: id({ city: '蒲郡市' }, 4), none: K.pick(null, 4), still: K.STILL }));") % str(GO / 'chasetsu.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual((o['apr'], o['may'], o['oct']), ('shincha', 'shincha', 'matcha'))
        self.assertIsNone(o['isshiki'])
        self.assertIsNone(o['kira'])
        self.assertIsNone(o['hazu'])
        self.assertIsNone(o['out'])
        self.assertIsNone(o['none'])
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
