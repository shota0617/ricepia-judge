import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class TsutsumiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'tsutsumi.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: '([^']+)', where: 'paddy', say: '([^']+)',\s*done: '([^']+)', gold: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual([i[0] for i in self.items], ['kogane'])
        for item in self.items:
            for t in item[3:]:
                for ch in DECO:
                    self.assertNotIn(ch, t)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('領民と一夜で築いた', '長さ180m・高さ4m', '水害がなくなり', '金色の稲穂'):
            self.assertIn(word, brief)
        done = self.items[0][4]
        self.assertIn('180m', done)
        self.assertIn('4m', done)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_TSUTSUMI', px)
        self.assertIn('T.pick(f)', px)
        self.assertIn('tsutsumiStep(hx, by, u, now)', px)
        self.assertIn('land: luAt(', px)
        self.assertIn('tsutsumi.cur || tsutsumi.done', px)   # ゆあみ・ほりだしは 譲る
        self.assertLess(px.index('tsutsumiStep(hx, by, u, now);'), px.index('yuamiStep(hx, by, u, now);'))
        self.assertIn('tsutsumi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_only_on_kira_paddy(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_TSUTSUMI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '吉良町', land: 'a' }, o);"
              "const id = (o) => { const r = K.pick(c(o)); return r && r.id; };"
              "console.log(JSON.stringify({ kira: id({}), road: id({ land: 'b' }), none: id({ land: '' }),"
              "nishio: id({ town: '西尾町' }), isshiki: id({ town: '一色町' }), out: id({ city: '蒲郡市' }),"
              "nul: K.pick(null), still: K.STILL }));") % str(GO / 'tsutsumi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['kira'], 'kogane')
        for k in ('road', 'none', 'nishio', 'isshiki', 'out', 'nul'):
            self.assertIsNone(o[k], k)
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
