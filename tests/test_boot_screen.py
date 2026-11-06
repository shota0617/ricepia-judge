"""開いてから遊べるまでの間、画面を切り替えない（遅い回線で 8〜14秒 かかるときの見え方）。"""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class TestTractorProgress(unittest.TestCase):
    def setUp(self):
        self.src = (ROOT / 'tractor.html').read_text(encoding='utf8')

    def test_bar_moves_without_total(self):
        self.assertNotIn('if (e.total) {', self.src)
        self.assertIn('e.total || PROG_SIZE[key]', self.src)
        self.assertIn('Math.min(1,', self.src)

    def test_sizes_are_near_the_files(self):
        m = re.search(r'PROG_SIZE = \{ t: ([\d.e]+), f: ([\d.e]+) \}', self.src)
        t, f = float(m.group(1)), float(m.group(2))
        real_t = (ROOT / 'tools/tractor/tractor_yt.glb').stat().st_size
        real_f = (ROOT / 'tools/tractor/field_tanbo.glb').stat().st_size
        self.assertLess(abs(t - real_t) / real_t, 0.2)
        self.assertLess(abs(f - real_f) / real_f, 0.2)


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
