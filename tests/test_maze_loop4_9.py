# 第4弾サイクル9：地図画面の文字をさらに削り、素朴に（運営者の声 2026-11-03「文字が多すぎる」「素朴な感じに」）
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
GAME = (GO / 'game.js').read_text(encoding='utf-8')
CSS = (GO / 'style.css').read_text(encoding='utf-8')


def func(src, head):
    a = src.index(head)
    b = src.index('\n}\n', a)
    return src[a:b + 3]


class TextCut(unittest.TestCase):
    def test_clock_draws_nothing(self):
        foot = func(PIXEL, 'function mzClockFoot(')
        self.assertIn('return 0;', foot)
        self.assertNotIn('S *', foot)
        draw = func(PIXEL, 'function drawMzClock(')
        self.assertRegex(draw, r'function drawMzClock\(w, dpr, now\) \{\n  return;')
        self.assertNotIn('mzStars', PIXEL)   # サイクル85で ★判定を 廃止
        self.assertNotIn('mzPar', PIXEL)

    def test_banner_not_drawn(self):
        self.assertNotIn('`〜 ${here.banner} 〜`', PIXEL)
        self.assertIn('G.onTownEnter(town, city)', PIXEL)

    def test_edge_labels_not_drawn(self):
        self.assertNotIn("label('🌏 タップ'", PIXEL)
        self.assertNotIn("label(dist,", PIXEL)
        self.assertIn('mzGoalWorld()', PIXEL)
        self.assertIn('mzMap.arrow = [', PIXEL)

    def test_energy_bar_quiet(self):
        bar = func(PIXEL, 'function drawMzEnergyBar(')
        self.assertNotIn('createLinearGradient', bar)
        self.assertNotIn('pulse', bar)
        self.assertNotIn('⚡ ${mzEnergy.steps}/${MZ_ENERGY.need}', bar)

    def test_guide_one_line(self):
        g = func(GAME, 'function renderGuide(')
        self.assertNotIn('<small>', g)
        self.assertNotIn('guideChips(', g)
        self.assertNotIn('class="chips"', g)
        self.assertNotIn('へ ${far}', g)
        self.assertIn('${gname}<span>　${far}</span>', g)
        self.assertIn('function guideChips(', GAME)

    def test_koyomi_hidden_in_px(self):
        k = func(GAME, 'function renderKoyomi(')
        self.assertRegex(k, r"if \(px\) \{ el\.hidden = true;[^\n]*return; \}")

    def test_hundred_toasts_short(self):
        h = func(GAME, 'function hundred(')
        self.assertNotIn('RIVAL', h)
        toasts = [l for l in h.split('\n') if 'toastAfter(' in l or 'floatText(' in l]
        self.assertTrue(toasts)
        for l in toasts:
            code = l.split('//')[0]
            self.assertNotIn('はじめての道', code)
            self.assertNotIn('自己ベスト', code)
        self.assertIn("toastAfter('👣 100歩たんけん')", h)
        self.assertIn('toastAfter(`🏁 ${h.fresh}マス', h)
        self.assertIn('name: `100歩たんけん：はじめての道', h)   # きろく用の 文は そのまま

    def test_css_simple(self):
        self.assertNotIn('glowPulse', CSS)
        m = re.search(r'\.guide \.chip\.glow\{([^}]*)\}', CSS)
        self.assertTrue(m and 'box-shadow' not in m.group(1))
        self.assertNotIn('\n.guide .chip.main{background', CSS)
        self.assertIn('body.px .guide{background:#000;color:#7ee0ff;border:1px solid #7ee0ff}', CSS)


class Scope(unittest.TestCase):
    def test_diff_words_and_files(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'tests'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l for l in d.split('\n') if l.startswith('+') and not l.startswith('+++') and 'test_maze_loop4_9' not in l]
        for l in added:
            if l.startswith('+    ') and ('assert' in l or 'Not' in l):
                continue
            for w in ('\u307c\u304f', '\u3060\u306b', '\u7d0420%'):
                self.assertNotIn(w, l)
        files = subprocess.run(['git', 'diff', '--name-only', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        for f in files:
            self.assertTrue(f.startswith('nishio-go/') or f == 'nishio-go.html' or f.startswith('tests/'), f)


if __name__ == '__main__':
    unittest.main()
