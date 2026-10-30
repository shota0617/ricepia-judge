import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class NazonazoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'nazonazo.js').read_text()
        cls.items = re.findall(r"\{ id: '([\w-]+)',(?: town: \w+,)? q: '([^']+)', a: '([^']+)', b: '([^']+)', yes: '([^']+)', no: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_text_is_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        self.assertGreaterEqual(len(self.items), 20)
        self.assertEqual(len({i[0] for i in self.items}), len(self.items))
        for it in self.items:
            self.assertNotEqual(it[2], it[3], it[0])
            for t in it[1:]:
                for ch in DECO:
                    self.assertNotIn(ch, t, it[0])

    def test_only_brief_facts(self):
        brief = (ROOT / 'docs' / 'nishio-rashisa-brief.md').read_text().replace(' ', '')
        for word in ('足利義氏', '6万石', '三河の小京都', '全国生産の約2割', '明治27年', '貞享3年', '1686年', '長さ180m・高さ4m',
                     '約20分', '黒壁', '三ヶ根山', 'カーネーション', '絶滅危惧II類', '矢作川は西尾市で三河湾', '西尾祇園祭', '一色大提灯まつり'):
            self.assertIn(word, brief)
        # 答えあわせの ことばには、ただしい 答えが 入り、まちがいの 選び（b）は 入らない
        for i, _, a, b, yes, no in self.items:
            plain = lambda t: t.replace(' ', '')
            self.assertIn(plain(a).replace('4月末〜5月', '4月末から5月'), plain(yes), i)
            self.assertNotIn(plain(b), plain(yes), i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_NAZONAZO', px)
        self.assertIn('nazoStep(hx, by, u, now);', px)
        self.assertIn('nazoTap(x, y, performance.now())', px)
        self.assertIn('roll.idle > N.SHOW', px)
        self.assertIn('gbOn', px[px.index('function nazoStep'):px.index('function nazoTap')])
        self.assertIn('nazonazo.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_town(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_NAZONAZO;"
              "const ids = (town) => K.candidates({ city: '西尾市', town }).map(x => x.id);"
              "const seen = []; let c = { city: '西尾市', town: '一色町一色' }, run = [];"
              "for (let i = 0; i < 4; i++) { const r = K.pick(c, seen.slice(), () => 0.3); run.push(r.item.id); seen.push(r.item.id); }"
              "console.log(JSON.stringify({ nis: ids('花ノ木町'), isshiki: ids('一色町一色'), saku: ids('一色町佐久島'), kira: ids('吉良町吉田'), hazu: ids('東幡豆町'),"
              "out: K.candidates({ city: '蒲郡市', town: '' }), nul: K.pick(null), run,"
              "flip: K.pick(c, [], () => 0.2).flip, noflip: K.pick(c, [], () => 0.8).flip,"
              "judge: [K.judge(false, 0), K.judge(false, 1), K.judge(true, 0), K.judge(true, 1)],"
              "wrap: K.pick({ city: '西尾市', town: '東幡豆町' }, ['hazu-yama', 'hazu-hana', 'yahagi', 'medaka'], () => 0).seen, still: K.STILL, show: K.SHOW }));") % str(GO / 'nazonazo.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertIn('tencha', o['nis'])
        self.assertNotIn('unagi', o['nis'])
        self.assertIn('unagi', o['isshiki'])
        self.assertNotIn('saku-fune', o['isshiki'])   # 佐久島の なぞなぞは 一色町の 町なかでは 出ない
        self.assertIn('saku-fune', o['saku'])
        self.assertNotIn('unagi', o['saku'])
        self.assertIn('kogane-nen', o['kira'])
        self.assertIn('hazu-yama', o['hazu'])
        for k in ('nis', 'isshiki', 'saku', 'kira', 'hazu'):
            self.assertIn('yahagi', o[k], k)   # どこでも 出る なぞなぞ
        self.assertEqual(o['out'], [])
        self.assertIsNone(o['nul'])
        self.assertEqual(len(set(o['run'])), 4)   # ひとめぐり するまで 同じ なぞなぞは 出ない
        self.assertTrue(o['flip'])
        self.assertFalse(o['noflip'])
        self.assertEqual(o['judge'], [True, False, False, True])
        self.assertEqual(len(o['wrap']), 1)   # ひとめぐり したら 忘れて 最初から
        self.assertLess(o['still'], 12)
        self.assertLess(o['still'], o['show'])


if __name__ == '__main__':
    unittest.main()
