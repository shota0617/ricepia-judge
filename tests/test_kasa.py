import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class KasaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'kasa.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, where: '\w+')?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 5)

    def test_no_decoration_in_words(self):
        words = [s for _, _, s in self.items] + re.findall(r"END = '([^']+)'", self.src)
        for say in words:
            self.assertFalse(any(c in say for c in DECO), say)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_KASA.pick(', px)
        self.assertIn("wxKind() === 'rain'", px)
        self.assertIn('kasaStep(hx, by, u, now)', px)
        self.assertIn('kasa.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_KASA;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '' }, o);"
              "const ids = (o) => K.candidates(c(o)).map(x => x.id).sort();"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), sea: ids({ town: '一色町', near: 'k' }), kira: ids({ town: '吉良町' }),"
              "nishio: ids({ town: '西尾町' }), hazu: ids({ town: '東幡豆町', near: 'k' }), out: ids({ city: '蒲郡市', town: '一色町' }),"
              "notSame: K.pick(c({ town: '西尾町' }), 'tencha', () => 0), other: K.pick(c({ town: '一色町', near: 'k' }), 'chochin', () => 0), none: K.pick(c({ city: '蒲郡市' }), '') }));") % str(GO / 'kasa.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['chochin'])
        self.assertEqual(o['sea'], ['asari', 'chochin'])           # アサリは 海が まわりに ある 所だけ
        self.assertEqual(o['kira'], ['inaho'])
        self.assertEqual(o['nishio'], ['tencha'])
        self.assertEqual(o['hazu'], ['asari', 'carnation'])
        self.assertEqual(o['out'], [])                             # 西尾市の 外では ささない
        self.assertEqual(o['notSame']['id'], 'tencha')             # 候補が 1つしか ない ときは 同じ ものでも よい
        self.assertEqual(o['other']['id'], 'asari')                # 前と ちがう ものを えらぶ
        self.assertIsNone(o['none'])


if __name__ == '__main__':
    unittest.main()
