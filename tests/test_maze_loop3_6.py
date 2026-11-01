import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = (ROOT / 'nishio-go' / 'game.js').read_text(encoding='utf-8')
CSS = (ROOT / 'nishio-go' / 'style.css').read_text(encoding='utf-8')
IDS = ['jokamachi', 'chaen', 'isshiki']


def node(expr):
    js = ("const fs=require('fs');const root={};"
          "const f=new Function('window','self','globalThis',fs.readFileSync('nishio-go/course.js','utf8'));"
          "const w={};f.call(w,w,w,w);const C=w.NISHIO_COURSE||root.NISHIO_COURSE;"
          "console.log(JSON.stringify(" + expr + "));")
    out = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def cells(line):
    return re.findall(r'👣|🍚|⬜', line)


class Cycle6MosaicSceneTests(unittest.TestCase):
    def test_four_rows_six_cells_front_row(self):
        rows = node("C.mosaicScene([])")
        self.assertEqual(len(rows), 4)
        self.assertEqual(len(cells(rows[3])), 6)
        for r in rows[:3]:
            self.assertEqual(len(re.findall(r'⬜', r)), 6)

    def test_front_row_patterns(self):
        want = ['🍚⬜⬜⬜⬜⬜', '👣🍚⬜⬜⬜⬜', '👣👣👣🍚⬜⬜', '👣👣👣👣👣🍚']
        for n, w in enumerate(want):
            self.assertEqual(node("C.mosaicScene(%s)[3]" % json.dumps(IDS[:n])), w)

    def test_dirty_done(self):
        rows = node("C.mosaicScene(['x','jokamachi','jokamachi',null,5])")
        self.assertEqual(rows[3], '👣🍚⬜⬜⬜⬜')
        self.assertEqual(node("C.mosaicScene('bad')[3]"), '🍚⬜⬜⬜⬜⬜')

    def test_mosaic_unchanged(self):
        self.assertEqual(len(node("C.mosaic(['jokamachi'])")), 3)
        self.assertEqual(node("C.mosaic(['jokamachi'])")[0], '☁️🏯⬜⬜⬜⬜')

    def test_game_and_css(self):
        i = GAME.index('function coPanelHtml')
        body = GAME[i:i + 3500]
        self.assertIn('CO.mosaicScene(', body)
        self.assertRegex(body, r"できあがり！ かおりちゃんも いっしょ！")
        self.assertIn("co-mosaic${all ? ' done' : ''}", body)
        self.assertIn('.co-mosaic.done', CSS)
        self.assertRegex(CSS, r'\.co-mosaic\{[^}]*font-size:36px')

    def test_no_forbidden_words(self):
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
