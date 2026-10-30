import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class ShimatabiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'shimatabi.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', town: SAKU, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual({i for i, _, _ in self.items}, {'art', 'kurokabe', 'fune'})
        for i, _, t in self.items:
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text()
        for word in ('三河湾最大の島', '高速船で約20分', 'アート作品が点在', '黒壁の集落景観'):
            self.assertIn(word, brief)

    def test_every_scene_is_drawn(self):
        px = (GO / 'pixel.js').read_text()
        body = px[px.index('function shimatabiStep'):px.index('// お米つぶの ちゃせき（chasetsu.js）')]
        for i, _, _ in self.items:
            self.assertIn("'%s'" % i, body, i) if i != 'fune' else None
        self.assertIn('else {   // 高速船', body)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_SHIMATABI', px)
        self.assertIn('S.pick(c, m.last)', px)
        self.assertIn('shimatabiStep(hx, by, u, now)', px)
        self.assertIn('shimatabi.cur', px)   # 佐久島の 海べでは ほりだしより 先
        self.assertIn('shimatabi.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_only_on_sakushima(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_SHIMATABI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '一色町佐久島' }, o);"
              "const ids = (o) => new Set([0, 0.4, 0.99].map(r => { const x = K.pick(c(o), '', () => r); return x && x.id; }));"
              "console.log(JSON.stringify({ saku: [...ids({})], isshiki: K.pick(c({ town: '一色町' })), nishio: K.pick(c({ town: '西尾町' })),"
              "out: K.pick(c({ city: '蒲郡市' })), none: K.pick(null),"
              "again: K.pick(c({}), 'art', () => 0).id, still: K.STILL, cycle: K.CYCLE }));") % str(GO / 'shimatabi.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(set(o['saku']), {'art', 'kurokabe', 'fune'})
        self.assertIsNone(o['isshiki'])
        self.assertIsNone(o['nishio'])
        self.assertIsNone(o['out'])
        self.assertIsNone(o['none'])
        self.assertNotEqual(o['again'], 'art')   # 前と 同じ 場面は つづけない
        self.assertLess(o['still'], 12)


if __name__ == '__main__':
    unittest.main()
