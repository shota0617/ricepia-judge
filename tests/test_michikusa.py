import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'
WHERES = {'paddy', 'kawa', 'higata', 'hatake', 'machi'}


class MichikusaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'michikusa.js').read_text()
        cls.items = re.findall(r"\{ id: '([\w-]+)', where: '(\w+)'.*?say: '([^']+)', src: \w+ \}", cls.src)

    def test_ids_unique_and_wheres_valid(self):
        ids = [i for i, _, _ in self.items]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(self.items), len(re.findall(r"src: \w+ \}", self.src)))
        for i, w, _ in self.items:
            self.assertIn(w, WHERES, i)
        for w in WHERES:
            self.assertGreaterEqual(sum(1 for _, x, _ in self.items if x == w), 2, w)

    def test_say_is_short_and_plain(self):
        for i, _, t in self.items:
            self.assertLessEqual(len(t), 16, i)   # 吹き出しに 入る みじかさ
            for ch in DECO:
                self.assertNotIn(ch, t, i)

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn('mzMichikusa(now)', px)
        self.assertIn('riceSay(r.item.say', px)
        self.assertIn('michikusa.js', (ROOT / 'nishio-go.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_pick_by_place_month_and_rotation(self):
        js = ("global.window = {}; require(%r); const K = window.NISHIO_MICHIKUSA;"
              "const c = (o) => Object.assign({ city: '西尾市', town: '', land: '', near: '', month: 6 }, o);"
              "const a = K.pick(c({ land: 'a', town: '吉良町' }), []), b = K.pick(c({ land: 'a', town: '吉良町' }), a.seen);"
              "const win = K.pick(c({ land: 'a', month: 1 }), []);"
              "const sea = K.pick(c({ land: 'e', near: 'eek', town: '一色町' }), []);"
              "const tea = K.pick(c({ land: 'b', town: '西尾町', month: 4 }), []);"
              "const out = K.pick(c({ city: '蒲郡市', land: 'a' }), []), none = K.pick(c({ land: 'c' }), []);"
              "let s = []; const got = []; for (let i = 0; i < 12; i++) { const r = K.pick(c({ land: 'a', town: '吉良町' }), s); s = r.seen; got.push(r.item.id); }"
              "console.log(JSON.stringify({ a: a.item.id, b: b.item.id, win: win.item, sea: sea.item.where, tea: tea.item.id, out, none, got }));") % str(GO / 'michikusa.js')
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertNotEqual(o['a'], o['b'])                       # 同じ ひと言を つづけない
        self.assertNotIn('メダカ', (o['win'] or {}).get('say', ''))   # 冬は メダカを 言わない（月の ちがう 話は 出さない）
        self.assertIn(o['sea'], ('higata', 'machi'))
        self.assertEqual(o['tea'], 'f-tencha')                    # 4月の 西尾の 畑は 茶摘み
        self.assertIsNone(o['out'])                               # 西尾市の 外では 言わない
        self.assertIsNone(o['none'])                              # 森など ひとりごとの ない 所
        self.assertTrue(len(set(o['got'])) >= 3)
        n = len(set(o['got']))
        self.assertEqual(o['got'][:n], o['got'][n:2 * n])         # ひとめぐり したら 最初から


if __name__ == '__main__':
    unittest.main()
