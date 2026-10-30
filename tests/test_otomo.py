import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class OtomoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'otomo.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, months: \[[\d, ]+\])?(?:, where: '\w+')?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_short_and_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        for i, _, t in self.items:
            self.assertLessEqual(len(t), 16, i)
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_OTOMO.pick(', px)
        self.assertIn('riceSay(o.say', px)
        self.assertIn('otomo.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_month_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_OTOMO;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '', month: 6 }, o);"
              "const ids = (o) => { const s = new Set(); for (let i = 0; i < 20; i++) { const r = K.pick(c(o), '', () => i / 20); if (r) s.add(r.id); } return [...s].sort(); };"
              "const tea = K.pick(c({ town: '西尾町', month: 4 }), '', () => 0), tea6 = K.pick(c({ town: '西尾町' }), '', () => 0);"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), sea: ids({ town: '一色町', near: 'kk' }),"
              "kiraSum: ids({ town: '吉良町' }), kiraAut: ids({ town: '吉良町', month: 10 }), nishio: ids({ town: '西尾町' }),"
              "tea: tea.say, tea6: tea6.say, out: K.pick(c({ city: '蒲郡市', town: '一色町' }), ''),"
              "again: K.pick(c({ town: '一色町' }), 'unagi', () => 0).id }));") % str(GO / 'otomo.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['ebisen', 'unagi'])        # 海が まわりに なければ アサリは 出ない
        self.assertEqual(o['sea'], ['asari', 'ebisen', 'unagi'])
        self.assertEqual(o['kiraSum'], [])                         # 吉良は 稲穂の 季節（9〜10月）だけ
        self.assertEqual(o['kiraAut'], ['inaho'])
        self.assertEqual(o['nishio'], ['tencha'])
        self.assertIn('茶摘み', o['tea'])                          # 4月は 茶摘みの 葉
        self.assertNotIn('茶摘み', o['tea6'])
        self.assertIsNone(o['out'])                                # 西尾市の 外では 出ない
        self.assertEqual(o['again'], 'ebisen')                     # まえと 同じ おともを つづけない


if __name__ == '__main__':
    unittest.main()
