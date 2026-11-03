# 第4弾サイクル11：きろく画面に「大きな ドット絵（かおりちゃん）」
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
CSS = (GO / 'style.css').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def node(expr):
    code = "globalThis.window=globalThis;require(%s);const P=globalThis.nishioPicross;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'picross.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Picross(unittest.TestCase):
    def test_pattern(self):
        p = node('P.PATTERN')
        self.assertEqual(len(p), 12)
        for row in p:
            self.assertEqual(len(row), 12)
            self.assertTrue(set(row) <= set('.gowkm'))
        cols = node('P.COLORS')
        self.assertEqual(set(cols), set('.gowkm'))

    def test_rounding(self):
        r = lambda d, t: node('P.reveal(%s,%s)' % (d, t))
        self.assertEqual(r(0, 10)['shown'], 0)
        self.assertEqual(r(1, 1000)['shown'], 1)
        self.assertEqual(r(999, 1000)['shown'], 143)
        self.assertEqual(r(10, 10)['shown'], 144)
        self.assertEqual(r(-5, 10)['shown'], 0)
        self.assertEqual(r(5, 0)['shown'], 0)
        self.assertEqual(r(50, 10)['shown'], 144)
        self.assertEqual(r("'x'", 10)['shown'], 0)
        self.assertEqual(r(5, 10)['shown'], 72)
        self.assertTrue(all(not c['on'] for c in r(5, 0)['cells']))

    def test_cells(self):
        for d in (0, 1, 37, 90, 143, 144):
            r = node('P.reveal(%d,144)' % d)
            self.assertEqual(len(r['cells']), 144)
            self.assertEqual(sum(c['on'] for c in r['cells']), r['shown'])
            for c in r['cells']:
                if not c['on']:
                    self.assertIsNone(c['color'])
                else:
                    self.assertIsNotNone(c['color'])

    def test_deterministic_and_growing(self):
        self.assertEqual(node('P.reveal(30,100)'), node('P.reveal(30,100)'))
        a = node('P.reveal(30,100)')['cells']
        b = node('P.reveal(60,100)')['cells']
        for x, y in zip(a, b):
            if x['on']:
                self.assertTrue(y['on'])

    def test_wiring(self):
        self.assertIn('renderPicross();', GAME)
        self.assertIn('id="picross" role="img" hidden', HTML)
        self.assertIn('<script src="nishio-go/picross.js"></script>', HTML)
        self.assertIn('.picross[hidden]{display:none}', CSS)
        self.assertIn('.pxl-cell', CSS)


class Scope(unittest.TestCase):
    def test_diff_words_and_files(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        for l in d.split('\n'):
            if l.startswith('+') and not l.startswith('+++'):
                for w in ('\u307c\u304f', '\u3060\u306b', '\u7d0420%'):
                    self.assertNotIn(w, l)
        files = subprocess.run(['git', 'diff', '--name-only', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        for f in files:
            self.assertTrue(f.startswith('nishio-go/') or f == 'nishio-go.html' or f.startswith('tests/'), f)


if __name__ == '__main__':
    unittest.main()
