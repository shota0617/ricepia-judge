# 第4弾サイクル13：きろく画面に「大きな 絵あわせカード（神経衰弱）」
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
    code = "globalThis.window=globalThis;require(%s);console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'memory.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Deck(unittest.TestCase):
    def test_12_cards_6x2(self):
        d = run("nishioMemory.deck('2026-11-03')")
        self.assertEqual(len(d), 12)
        for p in range(6):
            self.assertEqual([c['pair'] for c in d].count(p), 2)
        icons = {c['pair']: c['icon'] for c in d}
        self.assertEqual(len(set(icons.values())), 6)
        self.assertTrue(all(icons[c['pair']] == c['icon'] for c in d))

    def test_deterministic_and_varies(self):
        self.assertEqual(run("nishioMemory.deck('2026-11-03')"), run("nishioMemory.deck('2026-11-03')"))
        orders = {json.dumps(run("nishioMemory.deck('2026-11-%02d')" % n)) for n in range(1, 20)}
        self.assertGreater(len(orders), 1)

    def test_invalid_input(self):
        for bad in ('null', 'undefined', '""', '5', '{}', '[1]', 'NaN'):
            self.assertEqual(len(run("nishioMemory.deck(%s)" % bad)), 12, bad)

    def test_judge(self):
        self.assertTrue(run("nishioMemory.judge(2,2)"))
        self.assertFalse(run("nishioMemory.judge(1,2)"))
        for a, b in (('null', '1'), ('undefined', 'undefined'), ('"a"', '"a"'), ('NaN', 'NaN'), ('1', 'undefined')):
            self.assertFalse(run("nishioMemory.judge(%s,%s)" % (a, b)), (a, b))


class Wiring(unittest.TestCase):
    def test_wiring(self):
        self.assertIn('renderMemory();', GAME)
        self.assertIn('function renderMemory()', GAME)
        self.assertIn("'nsg_mem'", GAME)
        self.assertIn('rec.day !== day', GAME)
        self.assertIn('nishioMemory.judge', GAME)
        self.assertIn('setTimeout', GAME[GAME.index('function renderMemory'):GAME.index('function renderSugoroku')])
        self.assertIn('id="memoryBox" role="group" hidden', HTML)   # 操作ボタンを含むため img ではなく group（Codex指摘）
        self.assertIn('そろった', GAME[GAME.index('function renderMemory'):GAME.index('function renderSugoroku')])
        self.assertIn('}, 900);', GAME[GAME.index('function renderMemory'):GAME.index('function renderSugoroku')])
        self.assertIn('id="memTries"', HTML)
        self.assertIn('<script src="nishio-go/memory.js"></script>', HTML)
        self.assertIn('.memory[hidden]{display:none}', CSS)
        self.assertIn('.mem-card', CSS)
        self.assertIn('.mem-card.found', CSS)


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
