# 第4弾サイクル12：きろく画面に「大きな ビンゴカード」
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
CSS = (GO / 'style.css').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def card(arg):
    code = "globalThis.window=globalThis;require(%s);console.log(JSON.stringify(globalThis.nishioBingo.bingoCard(%s)))" % (json.dumps(str(GO / 'bingo.js')), arg)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def rows(on_map):
    # on_map: 行ごとの on 配列（5件）
    return json.dumps([{'id': 'r%d' % i, 'cells': [{'on': v} for v in r]} for i, r in enumerate(on_map)])


ALL_OFF = [[False] * 5 for _ in range(5)]


class BingoCard(unittest.TestCase):
    def test_always_25_and_free(self):
        r = card(rows([[True, False]]))
        self.assertEqual(len(r['cells']), 25)
        self.assertEqual(r['total'], 25)
        self.assertTrue(all(c['on'] and c['free'] for c in r['cells'] if c['col'] >= 2 or c['row'] >= 1))
        self.assertFalse(r['cells'][1]['on'])
        self.assertFalse(r['cells'][0]['free'])

    def test_truncates_to_5x5(self):
        r = card(json.dumps([{'cells': [{'on': False}] * 9}] * 8))
        self.assertEqual(len(r['cells']), 25)
        self.assertEqual(r['onCount'], 0)

    def test_strict_on(self):
        r = card(json.dumps([{'cells': [{'on': 1}, {'on': 'true'}, {'on': None}, {}, None]}]))
        self.assertEqual([c['on'] for c in r['cells'][:5]], [False] * 5)

    def test_row_col_diag(self):
        m = [r[:] for r in ALL_OFF]
        m[2] = [True] * 5
        r = card(rows(m))
        self.assertEqual(r['lines'], [{'type': 'row', 'index': 2}])
        self.assertEqual(sum(c['line'] for c in r['cells']), 5)
        m = [r[:] for r in ALL_OFF]
        for i in range(5):
            m[i][3] = True
        self.assertEqual(card(rows(m))['lines'], [{'type': 'col', 'index': 3}])
        m = [r[:] for r in ALL_OFF]
        for i in range(5):
            m[i][i] = True
        self.assertEqual(card(rows(m))['lines'], [{'type': 'diag', 'index': 0}])
        m = [r[:] for r in ALL_OFF]
        for i in range(5):
            m[i][4 - i] = True
        self.assertEqual(card(rows(m))['lines'], [{'type': 'diag', 'index': 1}])

    def test_counts_and_all(self):
        r = card(rows([[True] * 5] * 5))
        self.assertEqual(r['lineCount'], 12)
        self.assertEqual(r['onCount'], 25)
        r = card(rows(ALL_OFF))
        self.assertEqual((r['lineCount'], r['onCount']), (0, 0))
        m = [[True, False, True, False, True] for _ in range(5)]
        r = card(rows(m))
        self.assertEqual(r['onCount'], sum(c['on'] for c in r['cells']))
        self.assertEqual(r['lineCount'], len(r['lines']))

    def test_deterministic_and_invalid(self):
        a = rows([[True, False, True, True, False]] * 3)
        self.assertEqual(card(a), card(a))
        for bad in ('null', '"x"', '5', '{}', '[null,5,"a"]', '[{"cells":"zz"}]'):
            r = card(bad)
            self.assertEqual(len(r['cells']), 25, bad)
        e = card('null')
        self.assertEqual((e['lineCount'], e['onCount']), (12, 25))  # 全部フリー


class Wiring(unittest.TestCase):
    def test_wiring(self):
        self.assertIn('renderBingo();', GAME)
        self.assertIn('function renderBingo()', GAME)
        self.assertIn('id="bingo" role="img" hidden', HTML)
        self.assertIn('<script src="nishio-go/bingo.js"></script>', HTML)
        self.assertIn('.bingo[hidden]{display:none}', CSS)
        self.assertIn('.bgo-cell.line', CSS)
        self.assertIn('S.visits[s.id]', GAME)
        # Codex指摘の修正：未訪問マスも絵文字を薄く出し、どの名所か分かるようにする
        self.assertIn("' off'", GAME)
        self.assertIn('.bgo-cell.off', CSS)
        self.assertIn('realOn', GAME)


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
