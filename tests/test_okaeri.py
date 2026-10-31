import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class OkaeriTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'okaeri.js').read_text()

    def test_say_is_plain(self):
        for ch in DECO:
            self.assertNotIn(ch, self.src.split('(function')[1])

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn("okaeriStep(hx, by, u, now, mood === 'sleepy');", px)
        body = px[px.index('function okaeriStep'):px.index('function okaeriStep') + 1800]
        self.assertIn('西尾', body)   # 西尾市の 中だけ
        self.assertIn('NISHIO_YOUKOSO', body)   # 名物は ようこそと 共用
        self.assertIn('okaeri.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_days_and_say(self):
        js = ("global.window = {}; require(%r); const M = window.NISHIO_OKAERI;"
              "const t = (y, m, d, h) => new Date(y, m, d, h).getTime();"
              "console.log(JSON.stringify({ same: M.days(t(2026,9,29,8), t(2026,9,29,23)), next: M.days(t(2026,9,28,23), t(2026,9,29,1)),"
              "three: M.days(t(2026,9,26,10), t(2026,9,29,9)), first: M.days(0, t(2026,9,29,9)), fut: M.days(t(2026,9,30,9), t(2026,9,29,9)),"
              "bad: [M.clean('x'), M.clean(-1), M.clean(null)], s1: M.say(1, '一色', 'うなぎ'), s3: M.say(3, '吉良', '稲穂'), s40: M.say(40, '西尾', '抹茶わん'), key: M.KEY }));") % str(GO / 'okaeri.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual((o['same'], o['next'], o['three'], o['first'], o['fut']), (0, 1, 3, 0, 0))
        self.assertEqual(o['bad'], [0, 0, 0])
        self.assertEqual(o['s1'], 'おかえり。きのうぶりだね。一色の うなぎも 待っとったよ')
        self.assertEqual(o['s3'], 'おかえり。3日ぶりだね。吉良の 稲穂も 待っとったよ')
        self.assertEqual(o['s40'], 'おかえり。ひさしぶりだね。西尾の 抹茶わんも 待っとったよ')
        self.assertEqual(o['key'], 'nsg_okaeri')


if __name__ == '__main__':
    unittest.main()
