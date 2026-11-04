# 第4弾サイクル76：ばねは急がせない・記録は比べない（あつまれ どうぶつの森）
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
SRC = {n: (GO / (n + '.js')).read_text(encoding='utf-8') for n in ['pixel', 'meiro', 'game']}


def code_only(s):
    return '\n'.join(re.sub(r'//.*$', '', l) for l in s.splitlines())


def block(src, head, end='\n}'):
    i = src.index(head)
    return src[i:src.index(end, i)]


class Calm(unittest.TestCase):
    def test_boing_no_pitch_rise(self):
        b = code_only(block(SRC['pixel'], 'function boingSound('))
        self.assertNotIn('Math.pow', b)
        self.assertIn('hi ? 240 : 170', b)
        self.assertIn('hi ? 760 : 420', b)

    def test_chain_not_counted(self):
        b = code_only(block(SRC['pixel'], 'function mzSpringChain('))
        self.assertIn('mzSpring.chain = 1', b)
        self.assertNotIn('chain + 1', b)
        self.assertIn('mzSpring.at = now', b)

    def test_no_best_update(self):
        b = code_only(block(SRC['pixel'], 'function mzSpringChain('))
        self.assertNotIn('best', b)

    def test_no_note_say(self):
        b = code_only(block(SRC['pixel'], 'function mzSpringChain('))
        self.assertNotIn('riceSay', b)
        self.assertNotIn('♪', b)

    def test_sparkle_fixed_five(self):
        b = code_only(block(SRC['pixel'], 'function mzSpringChain('))
        self.assertIn('i < 5', b)
        self.assertNotIn('Math.min(12', b)

    def test_meiro_spring(self):
        c = code_only(SRC['meiro'])
        self.assertIn('sp.chain = 1; sp.at = now;', c)
        self.assertNotIn('sp.chain + 1', c)
        self.assertNotIn('sp.chain >= 2', c)
        self.assertIn('api.boing(', c)

    def test_minibest_no_comparator(self):
        b = code_only(block(SRC['game'], 'function miniBest('))
        self.assertIn('stars > 0 && !old', b)
        self.assertNotIn('stars > old.s', b)
        self.assertNotIn('lower ?', b)
        self.assertIn('list[level] = { s: stars, v }', b)

    def test_reference_and_syntax(self):
        for n in SRC:
            self.assertIn('あつまれ どうぶつの森', SRC[n], n)
            subprocess.run(['node', '--check', str(GO / (n + '.js'))], check=True)


if __name__ == '__main__':
    unittest.main()
