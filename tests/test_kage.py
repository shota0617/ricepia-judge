import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class KageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'kage.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, months: \[[\d, ]+\])?(?:, where: '\w+')?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 8)

    def test_no_decoration_in_words(self):
        for _, _, say in self.items:
            self.assertFalse(any(c in say for c in DECO), say)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_KAGE.next(', px)
        self.assertIn('kageDraw(hx, hcy', px)
        self.assertIn('kage.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_next_cycles_by_town_sea_and_month(self):
        js = ("global.window = {}; require(%r); const M = window.NISHIO_KAGE;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '', month: 7 }, o);"
              "const nx = (o, last) => { const d = M.next(c(o), last); return d && d.id; };"
              "console.log(JSON.stringify({ a: nx({ town: '一色町' }, ''), b: nx({ town: '一色町' }, 'unagi'), c: nx({ town: '一色町' }, 'chochin'),"
              "sea: nx({ town: '一色町', near: 'k' }, 'chochin'), kira: nx({ town: '吉良町' }, 'inaho'), n7: nx({ town: '西尾町' }, ''),"
              "n4: nx({ town: '西尾町', month: 4 }, 'tencha'), out: nx({ city: '蒲郡市', town: '一色町' }, ''), none: nx({}, 'chawan'),"
              "still: M.STILL, each: M.EACH }));") % str(GO / 'kage.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['a'], 'unagi')
        self.assertEqual(o['b'], 'ebisen')
        self.assertEqual(o['c'], 'unagi')
        self.assertEqual(o['sea'], 'asari')
        self.assertEqual(o['kira'], 'inaho')
        self.assertEqual(o['n7'], 'chawan')
        self.assertEqual(o['n4'], 'chawan')
        self.assertIsNone(o['out'])
        self.assertEqual(o['none'], 'chawan')   # 町名が 空でも 西尾市の 中なら 西尾地区あつかい
        self.assertGreater(o['each'], o['still'])


if __name__ == '__main__':
    unittest.main()
