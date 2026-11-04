# 第4弾サイクル71：ミニゲームも比べない（結果の自己ベスト行をなくす。記録は静かに残す）
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
SRC = {n: (GO / (n + '.js')).read_text(encoding='utf-8') for n in ['dankyu', 'harvest', 'hiryoyama', 'game']}


def code_only(s):
    return '\n'.join(re.sub(r'//.*$', '', l) for l in s.splitlines())


class Calm(unittest.TestCase):
    def test_no_compare_line(self):
        for n in ['dankyu', 'harvest', 'hiryoyama']:
            c = code_only(SRC[n])
            self.assertNotIn('自己ベスト', c, n)
            self.assertNotIn('mb.fresh', c, n)

    def test_record_kept(self):
        for n in ['dankyu', 'harvest', 'hiryoyama']:
            self.assertIn('G.miniBest(', SRC[n], n)

    def test_level_stars_kept(self):
        for n in ['dankyu', 'harvest']:
            i = SRC[n].index('levelBtns')
            self.assertIn("rec[i] ? '✓' : '—'", SRC[n][i:i + 1200], n)   # サイクル74：★から ✓（できた印）へ

    def test_minibest_logic(self):
        g = SRC['game']
        i = g.index('function miniBest(')
        blk = g[i:g.index('\n}\n', i)]
        self.assertIn('stars > 0 && (!old || stars > old.s || (stars === old.s && (lower ? v < old.v : v > old.v)))', blk)
        self.assertIn('list[level] = { s: stars, v }', blk)
        self.assertIn('fresh: better && !!old', blk)

    def test_townscaper(self):
        for n in SRC:
            self.assertIn('Townscaper', SRC[n], n)

    def test_syntax(self):
        for n in SRC:
            subprocess.run(['node', '--check', str(GO / (n + '.js'))], check=True)


if __name__ == '__main__':
    unittest.main()
