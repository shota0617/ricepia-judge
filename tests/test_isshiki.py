import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class IsshikiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'isshiki.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], ['ebisen', 'unagi2', 'yoman', 'sakana'])
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('全国生産の約2割', '明治27年', '三河一色さかな広場', 'えびせんべい焼き体験'):
            self.assertIn(word, brief)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_ISSHIKI', px)
        self.assertIn('S.pick(c, m.last)', px)
        self.assertIn('isshikiStep(hx, by, u, now);', px)
        for scene in ('ebisen', 'unagi2', 'yoman', 'sakana'):
            self.assertIn("m.cur.id === '%s'" % scene if scene != 'sakana' else 'さかな広場：', px)
        self.assertIn('isshiki.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_ISSHIKI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '一色町', near: 'aaa' }, o);"
              "const id = (o, l) => { const r = K.pick(c(o), l); return r && r.id; };"
              "console.log(JSON.stringify({ a: id({}), notSame: id({}, 'yoman'), sea: id({ near: 'aak' }), saku: id({ town: '一色町佐久島' }),"
              "kira: id({ town: '吉良町' }), nishio: id({ town: '西尾町' }), out: id({ city: '蒲郡市' }), none: K.pick(null),"
              "seq: [0, 0.3, 0.6, 0.99].map(r => K.pick(c({}), '', () => r).id), still: K.STILL }));") % str(GO / 'isshiki.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertIsNotNone(o['a'])
        self.assertNotEqual(o['notSame'], 'yoman')
        for k in ('sea', 'saku', 'kira', 'nishio', 'out', 'none'):
            self.assertIsNone(o[k], k)
        self.assertEqual(o['seq'], ['ebisen', 'unagi2', 'yoman', 'sakana'])
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
