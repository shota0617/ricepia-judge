import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class MonosashiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'monosashi.js').read_text()

    def test_say_is_plain_and_uses_only_brief_numbers(self):
        said = ''.join(re.findall(r"'([^']*だに[^']*)'", self.src))
        for ch in DECO:
            self.assertNotIn(ch, said)
        self.assertIn('LEN_M = 180', self.src)   # ブリーフ 5：黄金堤の 長さ180m
        self.assertEqual(set(re.findall(r'\d+', said)), {'1', '180'})   # 1本 と 180m だけ

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_MONOSASHI', px)
        self.assertIn("monosashiStep(hx, by, u, now, mood === 'sleepy');", px)
        self.assertIn('dd * TILE_M', px)
        self.assertIn('西尾', px[px.index('function monosashiStep'):px.index('function monosashiStep') + 900])   # 西尾市の 中だけ
        self.assertIn('monosashi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_add_gauge_say_clean(self):
        js = ("global.window = {}; require(%r); const M = window.NISHIO_MONOSASHI;"
              "console.log(JSON.stringify({ a: M.add(0, 100), b: M.add(100, 100), c: M.add(170, 400), g: M.gauge(450),"
              "bad: [M.clean('x'), M.clean(-5), M.clean(null), M.clean(Infinity), M.clean('90')], neg: M.add(50, -30),"
              "s1: M.say(1), s3: M.say(3), key: M.KEY }));") % str(GO / 'monosashi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['a'], {'total': 100, 'born': 0})
        self.assertEqual(o['b'], {'total': 200, 'born': 1})   # 180mを こえた
        self.assertEqual(o['c']['born'], 3)   # 170→570：180・360・540
        self.assertEqual(o['g']['n'], 2)
        self.assertAlmostEqual(o['g']['frac'], 90 / 180)
        self.assertEqual(o['bad'], [0, 0, 0, 0, 90])
        self.assertEqual(o['neg'], {'total': 50, 'born': 0})   # へる ことは ない
        self.assertIn('おなじ', o['s1'])
        self.assertEqual(o['s3'], '黄金堤 3本ぶん ころがったに。1本は 180mだに')
        self.assertEqual(o['key'], 'nsg_monosashi')


if __name__ == '__main__':
    unittest.main()
