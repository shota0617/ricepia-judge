import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'
AREAS = ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']


class KomeBanashiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'komebanashi.js').read_text()
        cls.ids = re.findall(r"\{ id: '([\w-]+)', area: '([\w*]+)'", cls.src)

    def test_ids_unique_and_areas_valid(self):
        ids = [i for i, _ in self.ids]
        self.assertEqual(len(ids), len(set(ids)))
        areas = json.loads((GO / 'areas.json').read_text())['areas']
        valid = {a['id'] for a in areas} | {'*'}
        for i, a in self.ids:
            self.assertIn(a, valid, i)

    def test_each_main_area_has_stories_and_wildcard_exists(self):
        for a in AREAS:
            self.assertGreaterEqual(sum(1 for _, x in self.ids if x == a), 2, a)
        self.assertGreaterEqual(sum(1 for _, x in self.ids if x == '*'), 1)

    def test_every_story_has_src_and_pages(self):
        for m in re.finditer(r"\{ id: '([\w-]+)'.*?src: \w+ \}", self.src, re.S):
            self.assertIn('pages: [', m.group(0), m.group(1))
        self.assertEqual(len(re.findall(r"src: \w+ \}", self.src)), len(self.ids))

    def test_no_decorative_emoji_in_pages(self):
        for line in self.src.splitlines():
            if 'pages:' in line:
                for ch in DECO:
                    self.assertNotIn(ch, line)

    def test_game_hooks_in_arrival_talk(self):
        game = (GO / 'game.js').read_text()
        self.assertIn('...komeBanashi(g)]', game)
        self.assertIn('komeSeen', game)
        self.assertIn('komebanashi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_area_month_and_rotation(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_KOMEBANASHI;"
              "const a = K.pick('kira', 10, []); const b = K.pick('kira', 10, a.seen);"
              "let s = []; const got = []; for (let i = 0; i < 12; i++) { const r = K.pick('sakushima', 1, s); s = r.seen; got.push(r.item.id); }"
              "const w = K.pick('okazaki', 5, []); const n = K.pick(null, 5, []);"
              "console.log(JSON.stringify({ a: a.item.id, b: b.item.id, got, w: w.item.area, n: n.item.area, none: K.LIST.filter(x => x.area === 'sakushima').length }));") % str(GO / 'komebanashi.js')
        out = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(out['a'], 'kogane-aki')   # 10月は 稲穂の 話を 先に
        self.assertNotEqual(out['a'], out['b'])      # 同じ話を 続けない
        self.assertEqual(out['got'][:4], out['got'][4:8])   # ひとめぐり したら 最初から
        self.assertEqual(out['w'], '*')              # となりの 市は どこでも の 話
        self.assertEqual(out['n'], '*')


if __name__ == '__main__':
    unittest.main()
