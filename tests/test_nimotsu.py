import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class NimotsuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'nimotsu.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', area: '(\w+)', name: '([^']+)'(?:, months: \[[\d, ]+\])?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_areas_valid(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        valid = {a['id'] for a in json.loads((GO / 'areas.json').read_text())['areas']}
        for i, a, _, _ in self.items:
            self.assertIn(a, valid, i)
        for a in ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']:
            self.assertTrue([1 for _, x, _, _ in self.items if x == a], a)

    def test_say_is_plain(self):
        for i, _, _, t in self.items:
            self.assertLessEqual(len(t), 40, i)
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        game = (GO / 'game.js').read_text()
        self.assertIn('...komeNimotsu(g)]', game)
        self.assertIn('get nimotsu()', game)
        px = (GO / 'pixel.js').read_text()
        self.assertIn('drawNimotsu(hx, by, u, now', px)
        self.assertIn('nimotsu.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_and_current(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_NIMOTSU;"
              "const ids = (a, m) => { const s = new Set(); for (let i = 0; i < 20; i++) s.add(K.pick(a, m, '', () => i / 20).id); return [...s].sort(); };"
              "console.log(JSON.stringify({ tea: K.pick('nishio', 4, '', () => 0).id, tea6: K.pick('nishio', 6, '', () => 0).id,"
              "isshiki: ids('isshiki', 6), kiraAut: K.pick('kira', 10, '', () => 0).say, kira6: K.pick('kira', 6, '', () => 0).say,"
              "none: K.pick('okazaki', 6, ''), nul: K.pick(null, 6, ''), again: K.pick('isshiki', 6, 'unagi', () => 0).id,"
              "cur: K.current({ id: 'unagi', t: 1000 }, 2000), old: K.current({ id: 'unagi', t: 0 }, K.KEEP + 1), bad: K.current({ id: 'x', t: 1000 }, 2000), nothing: K.current(null, 1) }));") % str(GO / 'nimotsu.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['tea'], 'tencha')                       # 4月は 茶摘みの 葉
        self.assertEqual(o['tea6'], 'chawan')
        self.assertEqual(o['isshiki'], ['chochin', 'ebisen', 'unagi'])
        self.assertIn('金色', o['kiraAut'])                        # 9〜10月は 金色の 稲穂
        self.assertNotIn('金色', o['kira6'])
        self.assertIsNone(o['none'])                               # 地区の ない 所では 変わらない
        self.assertIsNone(o['nul'])
        self.assertNotEqual(o['again'], 'unagi')                   # 前と 同じ 持ち物を つづけない
        self.assertEqual(o['cur'], 'unagi')
        self.assertEqual(o['old'], '')                             # 1日たったら おろす
        self.assertEqual(o['bad'], '')
        self.assertEqual(o['nothing'], '')


if __name__ == '__main__':
    unittest.main()
