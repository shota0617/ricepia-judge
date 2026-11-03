# 第4弾サイクル18：きろく画面の汎用ミニゲーム群を廃止（整理）。残すものは残っている
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
CSS = (GO / 'style.css').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
REMOVED_JS = ['picross', 'bingo', 'memory', 'slidepuzzle', 'janken']


class Removed(unittest.TestCase):
    def test_files_gone(self):
        for n in REMOVED_JS:
            self.assertFalse((GO / (n + '.js')).exists(), n)

    def test_html_clean(self):
        for n in REMOVED_JS:
            self.assertNotIn('nishio-go/%s.js' % n, HTML)
        for i in ['blockTower', 'sugoroku', 'picross', 'bingo', 'memoryBox', 'memTries', 'slideBox', 'slideMoves', 'jankenBox']:
            self.assertNotIn('id="%s"' % i, HTML)
        self.assertNotIn('すごろく', HTML)

    def test_game_js_clean(self):
        for w in ['blockTower', 'BlockTower', 'sugorokuBoard', 'renderSugoroku', 'renderPicross', 'renderBingo', 'bingoCard', 'renderMemory',
                  'renderSlidePuzzle', 'renderJanken', 'memPick', 'nsg_mem', 'nsg_slide', 'nsg_jan', 'nishioPicross', 'nishioBingo',
                  'nishioMemory', 'nishioSlidePuzzle', 'nishioJanken']:
            self.assertNotIn(w, GAME, w)

    def test_css_clean(self):
        for p in [r'\.block-tower', r'\.bt-', r'\.sugoroku', r'\.sg-', r'\.picross', r'\.pxl-', r'\.bingo', r'\.bgo-', r'\.memory', r'\.mem-',
                  r'\.slide', r'\.janken', r'\.jan-']:
            self.assertIsNone(re.search(p, CSS), p)


class Kept(unittest.TestCase):
    def test_kept(self):
        for w in ['exploreRing', 'renderPhotoQuiz', 'renderDayStamps']:
            self.assertIn(w, GAME, w)
        self.assertIn('id="exploreRing"', HTML)
        self.assertIn('shop-links', HTML + GAME)
        self.assertTrue((GO / 'photoquiz.js').exists() and (GO / 'daystamp.js').exists() and (GO / 'shopmap.js').exists())

    def test_no_forbidden_in_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True).stdout
        added = '\n'.join(l for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++'))
        self.assertNotIn('約20%', added)
        self.assertNotIn('ぼく', added)


if __name__ == '__main__':
    unittest.main()
