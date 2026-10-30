import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class OtedamaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'otedama.js').read_text()
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
        self.assertIn('NISHIO_OTEDAMA.pick(', px)
        self.assertIn('otedamaStep(hx, by, u, now)', px)
        html = (ROOT / 'nishio-go.html').read_text()
        self.assertIn('otedama.js', html)

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_month_and_sea(self):
        js = ("global.window = {}; require(%r); const O = window.NISHIO_OTEDAMA;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '', month: 7 }, o);"
              "const ids = (o) => O.candidates(c(o)).map(x => x.id).sort();"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), sea: ids({ town: '一色町', near: 'k' }), kira: ids({ town: '吉良町' }),"
              "nishio: ids({ town: '西尾町' }), nishio4: ids({ town: '西尾町', month: 4 }), hazu: ids({ town: '東幡豆町' }),"
              "out: ids({ city: '蒲郡市', town: '一色町' }), notSame: O.pick(c({ town: '西尾町' }), 'chawan', () => 0), none: O.pick(c({ city: '蒲郡市', town: '西尾町' }), '') }));") % str(GO / 'otedama.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['chochin', 'ebisen', 'unagi'])
        self.assertEqual(o['sea'], ['asari', 'chochin', 'ebisen', 'unagi'])    # アサリは 海が まわりに ある 所だけ
        self.assertEqual(o['kira'], ['inaho'])
        self.assertEqual(o['nishio'], ['chawan'])                  # てん茶の 葉は 4〜5月だけ
        self.assertEqual(o['nishio4'], ['chawan', 'tencha'])
        self.assertEqual(o['hazu'], ['carnation'])
        self.assertEqual(o['out'], [])                             # 西尾市の 外では ほうらない
        self.assertEqual(o['notSame']['id'], 'chawan')             # 候補が 1つしか ない ときは 同じ ものでも よい
        self.assertIsNone(o['none'])


if __name__ == '__main__':
    unittest.main()
