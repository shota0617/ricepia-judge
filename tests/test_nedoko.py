import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class NedokoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'nedoko.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: [^,]+(?:, months: \[[\d, ]+\])?(?:, where: '\w+')?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 7)
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_every_kind_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _ in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_NEDOKO.pick(', px)
        self.assertIn("nedokoStep(hx, by, u, now, mood === 'sleepy')", px)
        self.assertIn('nedoko.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town_month_and_sea(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_NEDOKO;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', near: '', month: 6 }, o);"
              "const ids = (o) => { const s = new Set(); for (let i = 0; i < 20; i++) { const r = K.pick(c(o), '', () => i / 20); if (r) s.add(r.id); } return [...s].sort(); };"
              "console.log(JSON.stringify({ isshiki: ids({ town: '一色町' }), sea: ids({ town: '一色町', near: 'kk' }), kira: ids({ town: '吉良町' }),"
              "nishio: ids({ town: '西尾町' }), nishio4: ids({ town: '西尾町', month: 4 }), hazu: ids({ town: '東幡豆町' }),"
              "out: K.pick(c({ city: '蒲郡市', town: '一色町' }), ''), again: K.pick(c({ town: '一色町' }), 'ebisen', () => 0).id }));") % str(GO / 'nedoko.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['isshiki'], ['chochin', 'ebisen'])
        self.assertEqual(o['sea'], ['asari', 'chochin', 'ebisen'])
        self.assertEqual(o['kira'], ['inaho'])
        self.assertEqual(o['nishio'], ['chawan'])            # てん茶の 葉は 4〜5月だけ
        self.assertEqual(o['nishio4'], ['chawan', 'tencha'])  # 4月は 茶の葉の ふとんも 出る
        self.assertEqual(o['hazu'], ['carnation'])
        self.assertIsNone(o['out'])                          # 西尾市の 外では 敷かない
        self.assertEqual(o['again'], 'chochin')              # まえと 同じ ものを つづけない


if __name__ == '__main__':
    unittest.main()
