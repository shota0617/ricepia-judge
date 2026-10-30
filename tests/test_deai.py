import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class DeaiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'deai.js').read_text()
        cls.items = re.findall(r"\{ id: '(\w+)', name: '([^']+)', where: '(\w+)'(?:, town: '[^']+')?(?:, months: \[[\d, ]+\])?, say: '([^']+)', src: \w+ \}", cls.src)

    def test_items_parse_and_say_is_short_and_plain(self):
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        for i, _, _, t in self.items:
            self.assertLessEqual(len(t), 16, i)
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_every_creature_has_a_sprite(self):
        px = (GO / 'pixel.js').read_text()
        for i in {i for i, _, _, _ in self.items}:
            self.assertRegex(px, r"\n  %s: \[" % i, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('NISHIO_DEAI.pick(', px)
        self.assertIn('riceSay(e.say', px)
        self.assertIn('deaiStep(now, ox, oy, T)', px)
        self.assertIn('deai.js', (ROOT / 'nishio-go.html').read_text())
        self.assertLess((ROOT / 'nishio-go.html').read_text().index('michikusa.js'), (ROOT / 'nishio-go.html').read_text().index('deai.js'))

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_place_month_and_town(self):
        js = ("global.window = {}; require(%r); require(%r); const K = window.NISHIO_DEAI;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '西尾町', land: 'x', near: '', month: 7 }, o);"
              "const ids = (o) => { const s = new Set(); for (let i = 0; i < 30; i++) { const r = K.pick(c(o), '', () => i / 30); if (r) s.add(r.id); } return [...s].sort(); };"
              "console.log(JSON.stringify({ paddy: ids({ land: 'a' }), paddyDec: ids({ land: 'a', month: 12 }), paddyMay: ids({ land: 'a', month: 5 }),"
              "kawa: ids({ land: 'i' }), land: ids({}), isshiki: ids({ town: '一色町', near: 'kk' }), kira: ids({ town: '吉良町', near: 'k' }), nishioSea: ids({ near: 'k' }),"
              "out: K.pick(c({ city: '蒲郡市', land: 'a' }), ''), again: K.pick(c({ land: 'a' }), 'medaka', () => 0).id }));") % (str(GO / 'michikusa.js'), str(GO / 'deai.js'))
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['paddy'], ['dojo', 'ishigame', 'medaka'])
        self.assertEqual(o['paddyDec'], ['ishigame'])               # メダカ・ドジョウは 田んぼに 水の ある 季節だけ
        self.assertEqual(o['paddyMay'], ['dojo', 'ishigame', 'medaka'])
        self.assertEqual(o['kawa'], ['akaza', 'kamatsuka', 'misago'])
        self.assertEqual(o['land'], [])                            # 水べでも 田んぼでも ない 所では 会わない
        self.assertEqual(o['isshiki'], ['asari', 'kochidori', 'shijimi'])
        self.assertEqual(o['kira'], ['asari'])                     # 一色の 干潟の 生きものは 吉良では 出ない
        self.assertEqual(o['nishioSea'], [])                       # 海べでも 西尾地区の 町では 出ない
        self.assertNotIn('medaka', o['kawa'])                      # 川・池に メダカは 出さない（田んぼの 生きものとして）
        self.assertIsNone(o['out'])                                # 西尾市の 外では 会わない
        self.assertEqual(o['again'], 'dojo')                   # まえと 同じ 生きものを つづけない


if __name__ == '__main__':
    unittest.main()
