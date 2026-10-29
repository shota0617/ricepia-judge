import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class GochisoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'gochiso.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, months: \[[\d, ]+\])?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 5)

    def test_no_decoration_in_words(self):
        for _, _, say in self.items:
            self.assertFalse(any(c in say for c in DECO), say)

    def test_every_dish_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_GOCHISO.pick(', px)
        self.assertIn('gochisoStep(hx, by, u, now)', px)
        self.assertIn('gochisoMunch(now)', px)
        html = (ROOT / 'nishio-go.html').read_text()
        self.assertIn('gochiso.js', html)

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_month(self):
        js = ("global.window = {}; require(%r); const G = window.NISHIO_GOCHISO;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', month: 7 }, o);"
              "const ids = (o) => { const s = new Set(); for (let i = 0; i < 20; i++) { const p = G.pick(c(o), '', () => i / 20); if (p) s.add(p.id); } return [...s].sort(); };"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), nishio7: ids({ town: '西尾町' }), nishio4: ids({ town: '西尾町', month: 4 }),"
              "nishio12: ids({ town: '西尾町', month: 12 }), kira: ids({ town: '吉良町' }), out: ids({ city: '蒲郡市', town: '一色町' }),"
              "notSame: G.pick(c({ town: '一色町' }), 'unadon', () => 0).id }));") % str(GO / 'gochiso.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['ebisen', 'unadon'])
        self.assertEqual(o['nishio7'], ['chasoba', 'kakigori', 'parfait'])
        self.assertEqual(o['nishio4'], ['chasoba'])                # パフェ・かき氷は 夏の あいだだけ
        self.assertEqual(o['nishio12'], ['chasoba'])
        self.assertEqual(o['kira'], [])
        self.assertEqual(o['out'], [])                             # 西尾市の 外では 食べない
        self.assertEqual(o['notSame'], 'ebisen')                   # 前と 同じ ものは つづけない


if __name__ == '__main__':
    unittest.main()
