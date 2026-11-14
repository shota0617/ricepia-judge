"""開いてから遊べるまでの間、画面を切り替えない（遅い回線で 8〜14秒 かかるときの見え方）。"""
import json
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class TestTractorProgress(unittest.TestCase):
    """読みこみの 線（#lwBar）は、全体の 大きさ（e.total）が 来なくても 進む。

    サイクル187 の PROG_SIZE は サイクル263（始まりの 画面を なくした）で 消え、
    サイクル271 で LOADP（#lwBar）に 作り直された。ここでは 文字の 形では なく、
    tractor.html から LOADP を 取りだして node で 動かし、線の 幅を 見る。
    """

    REAL = {'t': 'tractor_yt.glb',
            'f': {'haru': 'field_tanbo.glb', 'aki': 'field_tanbo_aki.glb', 'shirokaki': 'field_tanbo_shirokaki.glb'},
            'h': {'rotary': 'rotary_v2.glb', 'harrow': 'harrow_v2.glb'}}

    JS_HEAD = '''
const [season, IMPL_ID, events] = JSON.parse(process.argv[1]);
const IS_HARROW = IMPL_ID === 'harrow';
const bar = { style: { width: '3%' } }; let go = 0;
const window = { LW_GO() { go++; } }, LW_GO = window.LW_GO;
const $ = id => { if (id !== 'lwBar') throw new Error('id ' + id); return bar; };
'''
    JS_TAIL = '''
const out = [];
for (const [key, loaded, total, lengthComputable] of events) { LOADP.on(key, { loaded, total, lengthComputable }); out.push(parseFloat(bar.style.width)); }
console.log(JSON.stringify({ w: out, go, size: LOADP.size }));
'''

    def setUp(self):
        self.src = (ROOT / 'tractor.html').read_text(encoding='utf8')
        m = re.search(r'^const LOADP = \{.*?^  \} \};$', self.src, re.S | re.M)
        self.assertIsNotNone(m, 'tractor.html に LOADP（読みこみの 線）が 無い')
        self.loadp = m.group(0)
        # glb の 読みこみの 進みが LOADP に つながって いる・線の 要素が ある
        self.assertRegex(self.src, r'loader\.load\(ASSET \+ url, ok, e => LOADP\.on\(key, e\), ng\)')
        self.assertIn('<i id="lwBar"></i>', self.src)

    def run_loadp(self, events, season='haru', impl='rotary'):
        """events: [key, loaded, total, lengthComputable] の ならび。イベントごとの 線の 幅（%）・LW_GO の 回数・見こみの 大きさを 返す"""
        r = subprocess.run(['node', '-e', self.JS_HEAD + self.loadp + self.JS_TAIL, json.dumps([season, impl, events])],
                           capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def size(self, key, season='haru', impl='rotary'):
        name = self.REAL[key]
        if key == 'f':
            name = name[season]
        if key == 'h':
            name = name[impl]
        return (ROOT / 'tools/tractor' / name).stat().st_size

    def test_bar_moves_without_total(self):
        # 圧縮して 届く とき：lengthComputable=false・total=0。3つの ファイルが 10% きざみで 届く
        for season in ('haru', 'aki', 'shirokaki'):
            for impl in ('rotary', 'harrow'):
                real = {k: self.size(k, season, impl) for k in 'tfh'}
                ev = [[k, real[k] * i // 10, 0, False] for i in range(1, 11) for k in 'tfh']
                r = self.run_loadp(ev, season, impl)
                w = r['w']
                self.assertGreater(w[2], 3.0, '3つとも 1割 届いたのに、線が はじめの 3% から のびない')
                self.assertEqual(w, sorted(w), '線が もどった')
                self.assertGreaterEqual(len(set(w)), 20, '線が 止まった ままの 所が 多い')
                self.assertAlmostEqual(w[14], 50, delta=8, msg='半分 届いたら 線も 半分 くらい')
                self.assertGreaterEqual(w[-1], 95)
                self.assertLessEqual(w[-1], 97, '読みおわる 前に 100% に 見せない')
                self.assertGreaterEqual(r['go'], 20, '線が のびたら 見はり（LW_GO）に 知らせる')

    def test_bar_moves_with_total(self):
        # 大きさが 分かる とき（圧縮なし）：e.total を 使う
        ev = [['t', 0, 1000, True], ['f', 0, 1000, True], ['h', 0, 1000, True], ['t', 250, 1000, True], ['f', 500, 1000, True],
              ['h', 1000, 1000, True], ['t', 1000, 1000, True], ['f', 1000, 1000, True]]
        w = self.run_loadp(ev)['w']
        self.assertEqual(w, sorted(w))
        self.assertAlmostEqual(w[4], 25, delta=1)
        self.assertGreaterEqual(w[-1], 95)
        self.assertLessEqual(w[-1], 97)

    def test_bar_survives_wrong_sizes(self):
        # 見こみより 大きく 届いても、線は もどらない・3〜97% の 中
        ev = [['t', 10e6, 0, False], ['f', 1e3, 0, False], ['f', 20e6, 0, False], ['h', 0, 0, False], ['h', 30e6, 0, False]]
        w = self.run_loadp(ev)['w']
        self.assertEqual(w, sorted(w))
        for x in w:
            self.assertTrue(3.0 <= x <= 97.0, w)

    def test_sizes_are_near_the_files(self):
        for season in ('haru', 'aki', 'shirokaki'):
            for impl in ('rotary', 'harrow'):
                got = self.run_loadp([], season, impl)['size']
                for k in 'tfh':
                    real = self.size(k, season, impl)
                    self.assertLess(abs(got[k] - real) / real, 0.2, (season, impl, k, got[k], real))


class TestTractorAutoQuiet(unittest.TestCase):
    def test_no_coach_bubble_while_auto(self):
        src = (ROOT / 'tractor.html').read_text(encoding='utf8')
        self.assertIn("function coach(x) { if (autoQuiet) x = '';", src)


class TestNishioCover(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / 'nishio-go.html').read_text(encoding='utf8')

    def test_cover_opens_on_dom_ready(self):
        head = self.html[self.html.index('<body>'):self.html.index('id="intro"')]
        self.assertIn("c.id = 'bootCover'", head)
        self.assertIn("addEventListener('DOMContentLoaded'", head)

    def test_hidden_shots_do_not_load_during_boot(self):
        css = (ROOT / 'nishio-go/style.css').read_text(encoding='utf8')
        self.assertIn('#bootCover~#intro .intro-shots{display:none}', css)

    def test_cover_comes_from_script_only(self):
        self.assertNotIn('id="bootCover"', self.html)


if __name__ == '__main__':
    unittest.main()
