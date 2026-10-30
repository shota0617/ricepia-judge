import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class KawabeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'kawabe.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], ['yahagi', 'medaka', 'uo', 'misago', 'ishigame'])
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)
            self.assertIsNone(re.search(r'[0-9０-９]', t), i)   # 数は ブリーフに 無い（II類は 文字）

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for w in ('矢作川は西尾市で三河湾に注ぐ', 'メダカ（絶滅危惧II類）', 'イチモンジタナゴ', 'アカザ', 'ミサゴ', 'ニホンイシガメ（水田や畑を餌場・産卵場に使う）'):
            self.assertIn(w, brief)
        say = {i[0]: i[2] for i in self.items}
        self.assertIn('三河湾', say['yahagi'])
        self.assertIn('絶滅危惧II類', say['medaka'])
        self.assertIn('イチモンジタナゴ', say['uo'])
        self.assertIn('水田や 畑を えさ場や 産卵場', say['ishigame'])

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_KAWABE', px)
        self.assertIn('kawabeStep(hx, by, u, now);', px)
        self.assertIn('S.pick(c, m.last)', px)
        self.assertIn('mangekyo.cur || kawabe.cur) { c.cur = null', px)   # ちゃせきは 譲る
        for scene in ('yahagi', 'medaka', 'uo', 'misago'):
            self.assertIn("id === '%s'" % scene, px)
        for k in ('medaka', 'akaza', 'misago', 'ishigame', 'sakana'):
            self.assertRegex(px, r'\n  %s: \[' % k)   # 絵は 生きもの手帳の 16×16 を 共用
        self.assertIn('kawabe.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_water_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_KAWABE;"
              "const c = (o) => Object.assign({ city: '西尾市', land: 'a', near: 'aia' }, o);"
              "const id = (o, l) => { const r = K.pick(c(o), l); return r && r.id; };"
              "console.log(JSON.stringify({ a: id({}), self: id({ land: 'i', near: 'aaa' }), notSame: id({}, 'medaka'), dry: id({ near: 'aaa' }),"
              "sea: id({ near: 'aik' }), out: id({ city: '蒲郡市' }), none: K.pick(null),"
              "seq: [0, 0.3, 0.5, 0.7, 0.99].map(r => K.pick(c({}), '', () => r).id), still: K.STILL }));") % str(GO / 'kawabe.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertIsNotNone(o['a'])
        self.assertIsNotNone(o['self'])
        self.assertNotEqual(o['notSame'], 'medaka')
        for k in ('dry', 'sea', 'out', 'none'):
            self.assertIsNone(o[k], k)
        self.assertEqual(o['seq'], ['yahagi', 'medaka', 'uo', 'misago', 'ishigame'])
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
