import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class YoukosoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'youkoso.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', area: '(\w+)', name: '([^']+)',(?: months: \[[\d, ]+\],)? say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertEqual({i[1] for i in self.items}, {'nishio', 'isshiki', 'kira', 'hazu', 'sakushima'})
        for item in self.items:
            for ch in DECO:
                self.assertNotIn(ch, item[3])

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text().replace(' ', '')
        for word in ('全国生産の約2割', '三河湾最大の島', '黄金堤', 'カーネーション', '一色大提灯まつり', '茶摘みは4月末'):
            self.assertIn(word, brief)

    def test_sprites_exist(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i[0] for i in self.items}:
            self.assertIn("kind === '%s'" % i, px, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_YOUKOSO', px)
        self.assertIn('youkosoStep(hx, by, u, now);', px)
        self.assertIn('Y.entered(was, a)', px)
        self.assertIn('youkoso.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_area_pick_entered(self):
        js = ("global.window = {}; require(%r); const Y = window.NISHIO_YOUKOSO;"
              "const a = (city, town) => Y.areaOf(city, town);"
              "console.log(JSON.stringify({ nishio: a('西尾市', '花ノ木町'), isshiki: a('西尾市', '一色町一色'), saku: a('西尾市', '一色町佐久島'),"
              "kira: a('西尾市', '吉良町吉田'), hazu: a('西尾市', '東幡豆町'), hazu2: a('西尾市', '西幡豆町'), out: a('蒲郡市', '竹谷町'), none: a('西尾市', ''),"
              "spring: Y.pick('nishio', 4, '', () => 0).id, summer: Y.pick('nishio', 7, '', () => 0).id, autumn: Y.pick('kira', 9, '', () => 0).name,"
              "kiraNormal: Y.pick('kira', 3, '', () => 0).name, other: Y.pick('isshiki', 7, 'unagi', () => 0).id, nul: Y.pick('xx', 1),"
              "ent: [Y.entered(null, 'kira'), Y.entered('', 'kira'), Y.entered('nishio', 'kira'), Y.entered('kira', 'kira'), Y.entered('kira', null), Y.entered('kira', '')],"
              "show: Y.SHOW, cool: Y.COOL }));") % str(GO / 'youkoso.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual([o[k] for k in ('nishio', 'isshiki', 'saku', 'kira', 'hazu', 'hazu2')], ['nishio', 'isshiki', 'sakushima', 'kira', 'hazu', 'hazu'])
        self.assertIsNone(o['out'])
        self.assertIsNone(o['none'])   # 町名が ない 田畑・山の 中では 地区を きめない
        self.assertEqual(o['spring'], 'tencha')   # 茶摘みの 月は てん茶の 葉
        self.assertEqual(o['summer'], 'chawan')
        self.assertEqual(o['autumn'], '金色の 稲穂')
        self.assertEqual(o['kiraNormal'], '稲穂')
        self.assertEqual(o['other'], 'ebisen')   # 前と ちがう 旗を えらぶ
        self.assertIsNone(o['nul'])
        self.assertEqual(o['ent'], [False, True, True, False, False, False])   # 遊びはじめ・同じ地区・外に出た ときは 出さない
        self.assertLess(o['show'], o['cool'])


if __name__ == '__main__':
    unittest.main()
