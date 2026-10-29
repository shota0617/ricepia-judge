import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


class KoboreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'kobore.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, months: \[[\d, ]+\])?(?:, where: '\w+')?, src: \w+ \}", cls.src)

    def test_items_parse(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 5)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_KOBORE.pick(', px)
        self.assertIn('koboreStep(now, ox, oy, T, dpr)', px)
        html = (ROOT / 'nishio-go.html').read_text()
        self.assertIn('kobore.js', html)

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_month_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_KOBORE;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '', month: 7 }, o);"
              "const ids = (o) => K.candidates(c(o)).map(x => x.id).sort();"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), sea: ids({ town: '一色町', near: 'kk' }), kira: ids({ town: '吉良町' }),"
              "nishio: ids({ town: '西尾町' }), nishio4: ids({ town: '西尾町', month: 4 }), hazu: ids({ town: '東幡豆町' }), saku: ids({ town: '前島町', near: 'k' }),"
              "out: K.candidates(c({ city: '蒲郡市', town: '一色町' })), none: K.pick(c({ town: '西尾町' }), () => 0) }));") % str(GO / 'kobore.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['ebisen'])                 # 海が まわりに なければ アサリは こぼさない
        self.assertEqual(o['sea'], ['asari', 'ebisen'])
        self.assertEqual(o['kira'], ['inaho'])
        self.assertEqual(o['nishio'], [])                          # てん茶の 葉は 4〜5月だけ
        self.assertEqual(o['nishio4'], ['tencha'])
        self.assertEqual(o['hazu'], ['carnation'])
        self.assertEqual(o['out'], [])                             # 西尾市の 外では こぼさない
        self.assertIsNone(o['none'])


if __name__ == '__main__':
    unittest.main()
