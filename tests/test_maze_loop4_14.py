# 第4弾サイクル14：きろく画面に「大きな スライドパズル」
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
    code = "globalThis.window=globalThis;require(%s);console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'slidepuzzle.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Start(unittest.TestCase):
    def test_permutation_and_not_solved(self):
        for n in range(1, 29):
            t = run("nishioSlidePuzzle.start('2026-11-%02d')" % n)
            self.assertEqual(sorted(t), list(range(9)))
            self.assertEqual(t.count(8), 1)
            self.assertNotEqual(t, list(range(9)))

    def test_deterministic_and_varies(self):
        self.assertEqual(run("nishioSlidePuzzle.start('2026-11-03')"), run("nishioSlidePuzzle.start('2026-11-03')"))
        orders = {json.dumps(run("nishioSlidePuzzle.start('2026-10-%02d')" % n)) for n in range(1, 20)}
        self.assertGreater(len(orders), 1)

    def test_solvable_parity(self):
        # 完成形から すべらせて 作るので 転倒数は 偶数（3列幅 なので 空きの 行に よらない）
        for n in range(1, 29):
            t = [v for v in run("nishioSlidePuzzle.start('2026-12-%02d')" % n) if v != 8]
            inv = sum(1 for i in range(8) for j in range(i + 1, 8) if t[i] > t[j])
            self.assertEqual(inv % 2, 0)

    def test_invalid_input(self):
        for bad in ('null', 'undefined', '""', '5', '{}', '[1]', 'NaN'):
            t = run("nishioSlidePuzzle.start(%s)" % bad)
            self.assertEqual(sorted(t), list(range(9)), bad)
            self.assertNotEqual(t, list(range(9)), bad)


class Move(unittest.TestCase):
    def test_adjacent_swaps(self):
        base = [0, 1, 2, 3, 4, 5, 6, 8, 7]
        self.assertEqual(run("nishioSlidePuzzle.move(%s,8)" % base), [0, 1, 2, 3, 4, 5, 6, 7, 8])
        self.assertEqual(run("nishioSlidePuzzle.move(%s,6)" % base), [0, 1, 2, 3, 4, 5, 8, 6, 7])
        self.assertEqual(run("nishioSlidePuzzle.move(%s,4)" % base), [0, 1, 2, 3, 8, 5, 6, 4, 7])

    def test_not_adjacent_unchanged(self):
        base = [0, 1, 2, 3, 4, 5, 6, 7, 8]
        for idx in (0, 1, 2, 3, 4, 8, -1, 9):
            self.assertEqual(run("nishioSlidePuzzle.move(%s,%d)" % (base, idx)), base, idx)
        # 行をまたぐ 横どなり（2 と 3）は となりでは ない
        self.assertEqual(run("nishioSlidePuzzle.move([0,1,8,2,3,4,5,6,7],3)"), [0, 1, 8, 2, 3, 4, 5, 6, 7])

    def test_non_destructive(self):
        self.assertEqual(run("(()=>{const a=[0,1,2,3,4,5,6,8,7];const b=nishioSlidePuzzle.move(a,8);return [a,b]})()"),
                         [[0, 1, 2, 3, 4, 5, 6, 8, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8]])

    def test_invalid_no_throw(self):
        for a, i in (('null', '1'), ('undefined', '1'), ('"x"', '1'), ('[1,2]', '0'), ('[0,1,2,3,4,5,6,7,8]', 'null'),
                     ('[0,1,2,3,4,5,6,7,8]', '"7"'), ('[0,0,2,3,4,5,6,7,8]', '7'), ('[0,1,2,3,4,5,6,7,8]', 'NaN'), ('{}', '{}')):
            run("nishioSlidePuzzle.move(%s,%s)" % (a, i))


class Solved(unittest.TestCase):
    def test_strict(self):
        self.assertTrue(run("nishioSlidePuzzle.solved([0,1,2,3,4,5,6,7,8])"))
        for bad in ('[0,1,2,3,4,5,6,8,7]', '[1,0,2,3,4,5,6,7,8]', '[0,1,2,3,4,5,6,7]', '[0,1,2,3,4,5,6,7,8,9]',
                    '["0",1,2,3,4,5,6,7,8]', 'null', 'undefined', '"012345678"', '{}'):
            self.assertFalse(run("nishioSlidePuzzle.solved(%s)" % bad), bad)


class Wiring(unittest.TestCase):
    def test_wiring(self):
        self.assertIn('renderSlidePuzzle();', GAME)
        self.assertIn('function renderSlidePuzzle()', GAME)
        self.assertIn("'nsg_slide'", GAME)
        self.assertIn('rec.day !== day', GAME[GAME.index('function slideLoad'):GAME.index('function renderSlidePuzzle')])
        self.assertIn('nishioSlidePuzzle.start', GAME)
        self.assertIn('P.move(', GAME)
        self.assertIn('P.solved(', GAME)
        self.assertLess(GAME.index('renderMemory();'), GAME.index('renderSlidePuzzle();'))
        self.assertIn('id="slideBox" role="group" hidden', HTML)
        self.assertIn('id="slideMoves"', HTML)
        self.assertIn('<script src="nishio-go/slidepuzzle.js"></script>', HTML)
        self.assertIn('.slide{', CSS)
        self.assertIn('.slide-tile', CSS)
        self.assertIn('.slide[hidden]{display:none}', CSS)

    def test_codex_fixes(self):
        # 完成形はタイルの番号（並べる順）で分かる
        self.assertIn('slide-num', GAME)
        self.assertIn('.slide-num{', CSS)
        # 完成後に崩したら完成表示も戻る
        self.assertIn('rec.done = P.solved(next);', GAME)
        # 解けない保存値は受け入れない（転倒数の偶奇で判定）
        self.assertIn('function slideSolvable(t)', GAME)
        self.assertIn('slideSolvable(t)', GAME)


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
