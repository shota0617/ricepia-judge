# 第4弾サイクル15：きろく画面に「大きな じゃんけん」
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
CSS = (GO / 'style.css').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def run(expr):
    code = "globalThis.window=globalThis;require(%s);console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'janken.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Hand(unittest.TestCase):
    def test_range_deterministic_varies(self):
        hs = [run("nishioJanken.handOf('2026-11-%02d')" % n) for n in range(1, 29)]
        self.assertTrue(all(h in (0, 1, 2) for h in hs))
        self.assertGreater(len(set(hs)), 1)
        self.assertEqual(run("nishioJanken.handOf('2026-11-03')"), run("nishioJanken.handOf('2026-11-03')"))

    def test_invalid_day(self):
        for bad in ('null', 'undefined', '""', '5', '{}', 'NaN'):
            self.assertIn(run("nishioJanken.handOf(%s)" % bad), (0, 1, 2), bad)


class Judge(unittest.TestCase):
    def test_all_nine(self):
        want = {(0, 0): 'draw', (1, 1): 'draw', (2, 2): 'draw', (0, 1): 'win', (1, 2): 'win', (2, 0): 'win',
                (1, 0): 'lose', (2, 1): 'lose', (0, 2): 'lose'}
        for (m, t), w in want.items():
            self.assertEqual(run("nishioJanken.judge(%d,%d)" % (m, t)), w, (m, t))

    def test_invalid(self):
        for a, b in (('null', '1'), ('1', 'undefined'), ('3', '0'), ('-1', '0'), ('"0"', '1'), ('NaN', 'NaN'), ('1.5', '1'), ('{}', '[]')):
            self.assertEqual(run("nishioJanken.judge(%s,%s)" % (a, b)), 'draw', (a, b))


class Wiring(unittest.TestCase):
    def test_wiring(self):
        self.assertIn('function renderJanken()', GAME)
        self.assertIn("'nsg_jan'", GAME)
        self.assertIn('renderJanken();', GAME[:GAME.index('function renderJanken()')])
        self.assertLess(GAME.index('renderSlidePuzzle();'), GAME.index('renderJanken();'))
        self.assertIn('id="jankenBox" role="group" hidden', HTML)
        for i in ('jankenTheirs', 'jankenResult', 'jankenWins'):
            self.assertIn('id="%s"' % i, HTML)
        self.assertIn('<script src="nishio-go/janken.js"></script>', HTML)
        for c in ('.janken{', '.jan-hand{', '.jan-btn{', '.janken[hidden]{display:none}'):
            self.assertIn(c, CSS)

    def test_codex_draw_replay(self):
        # Codex指摘: あいこ（🔁）でもボタンが無効化され再挑戦できない問題への回帰
        self.assertIn('function janSeed(day, round)', GAME)
        self.assertIn("b.disabled = locked", GAME)
        self.assertIn("rec.result !== 'draw'", GAME)
        click = GAME[GAME.index("$('jankenBox').addEventListener"):]
        self.assertIn("res === 'draw'", click)
        self.assertIn('rec.round += 1', click)

    def test_reset_keeps_wins(self):
        body = GAME[GAME.index('function janLoad'):GAME.index('function renderJanken')]
        self.assertIn('r.day === day', body)
        self.assertIn('Math.floor(r.wins)', body)


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
