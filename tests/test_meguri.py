import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class MeguriTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'meguri.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, months: \[[\d, ]+\])?(?:, where: '\w+')?, src: \w+ \}", cls.src)

    def test_items_parse(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 8)

    def test_no_decoration_in_words(self):
        words = re.findall(r"END = '([^']+)'", self.src) + re.findall(r"\+ '([^']+)';", self.src)
        self.assertTrue(words)
        for say in words:
            self.assertFalse(any(c in say for c in DECO), say)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_MEGURI.ring(', px)
        self.assertIn('nightLevel() >= 1', px)
        self.assertIn('meguriStep(hx, by, u, now)', px)
        self.assertIn('meguri.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_ring_by_town_sea_and_month(self):
        js = ("global.window = {}; require(%r); const M = window.NISHIO_MEGURI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '', month: 7 }, o);"
              "const ids = (o) => M.ring(c(o)).map(x => x.id);"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), sea: ids({ town: '一色町', near: 'k' }), kira: ids({ town: '吉良町' }),"
              "kiraSea: ids({ town: '吉良町', near: 'k' }), nishio7: ids({ town: '西尾町' }), nishio4: ids({ town: '西尾町', month: 4 }),"
              "hazu: ids({ town: '東幡豆町', near: 'k' }), out: ids({ city: '蒲郡市', town: '一色町' }), none: ids({}),"
              "say: M.say(M.ring(c({ town: '一色町' }))), max: M.MAX }));") % str(GO / 'meguri.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['chochin', 'unagi', 'ebisen'])
        self.assertEqual(o['sea'], ['chochin', 'unagi', 'ebisen', 'asari'])   # アサリは 海が まわりに ある 所だけ
        self.assertLessEqual(len(o['sea']), o['max'])
        self.assertEqual(o['kira'], ['inaho'])
        self.assertEqual(o['kiraSea'], ['inaho', 'asari'])
        self.assertEqual(o['nishio7'], ['chawan'])
        self.assertEqual(o['nishio4'], ['chawan', 'tencha'])        # 茶の葉は 4〜5月だけ
        self.assertEqual(o['hazu'], ['carnation', 'asari'])
        self.assertEqual(o['out'], [])                              # 西尾市の 外では 出さない
        self.assertEqual(o['none'], ['chawan'])                     # 町名が 分からない 西尾市の 中は 西尾地区あつかい（ごちそう・かさと 同じ）
        self.assertEqual(o['say'], '提灯とうなぎとえびせんべいと よるの さんぽだよ')


if __name__ == '__main__':
    unittest.main()
