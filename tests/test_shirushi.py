import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class ShirushiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'shirushi.js').read_text()
        cls.areas = re.findall(r"\{ id: '(\w+)', name: '([^']+)', emblem: '(\w+)', color: '(#\w+)', src: \w+ \}", cls.src)

    def test_five_areas_match_youkoso(self):
        self.assertEqual([a[0] for a in self.areas], ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima'])
        yk = (GO / 'youkoso.js').read_text()
        for aid, _, emblem, _ in self.areas:
            self.assertIn("id: '%s', area: '%s'" % (emblem, aid), yk)   # 旗の 絵は ようこそと 同じ 地区の 名物

    def test_sprites_exist_and_say_is_plain(self):
        px = (GO / 'pixel.js').read_text()
        for a in self.areas:
            self.assertIn("kind === '%s'" % a[2], px, a[2])
        for ch in DECO:
            self.assertNotIn(ch, ''.join(re.findall(r"'([^']*だに[^']*)'", self.src)))

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_SHIRUSHI', px)
        self.assertIn("shirushiStep(hx, by, u, now, mood === 'sleepy');", px)
        self.assertIn('S.add(s.list, a)', px)
        self.assertIn('shirushi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_add_say_clean(self):
        js = ("global.window = {}; require(%r); const S = window.NISHIO_SHIRUSHI;"
              "const a = S.add([], 'kira'), b = S.add(a.list, 'kira'), c = S.add(['nishio', 'isshiki', 'kira', 'hazu'], 'sakushima'), d = S.add([], 'tokyo');"
              "console.log(JSON.stringify({ a, b, c, d, junk: S.clean(['hazu', 'xx', 'nishio', 'hazu']), bad: [S.clean(null), S.clean('kira')],"
              "s2: S.say(2, 'kira'), s5: S.say(5, 'sakushima'), delay: S.DELAY, pop: S.POP }));") % str(GO / 'shirushi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['a'], {'list': ['kira'], 'added': True, 'done': False})
        self.assertEqual(o['b'], {'list': ['kira'], 'added': False, 'done': False})   # 2回目は ふえない
        self.assertTrue(o['c']['done'])   # 5つ そろった
        self.assertEqual(o['c']['list'], ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima'])
        self.assertFalse(o['d']['added'])   # 知らない 地区は 数えない
        self.assertEqual(o['junk'], ['nishio', 'hazu'])
        self.assertEqual(o['bad'], [[], []])
        self.assertEqual(o['s2'], '吉良の 旗が ふえたに。あと 3つだに')
        self.assertIn('ぜんぶ', o['s5'])
        self.assertGreater(o['delay'], 3200)   # ようこその ひと言（3.2秒）の あとに 言う


if __name__ == '__main__':
    unittest.main()
