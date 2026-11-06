# 第4弾サイクル77：ばねショットを穏やかに（スナフキン：ムーミン谷のメロディ）
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
SRC = {n: (GO / (n + '.js')).read_text(encoding='utf-8') for n in ['pixel', 'meiro']}


def code_only(s):
    return '\n'.join(re.sub(r'//.*$', '', l) for l in s.splitlines())


def block(src, head, end='\n}'):
    i = src.index(head)
    return src[i:src.index(end, i) + 2]


class CalmShot(unittest.TestCase):
    def test_pixel_shot_empty(self):
        b = code_only(block(SRC['pixel'], 'function mzSpringShot('))
        for w in ['chordSound', 'riceSay', 'shots', 'mzFx', '1200', 'performance']:
            self.assertNotIn(w, b)

    def test_pixel_shot_only_clears_at(self):
        b = code_only(block(SRC['pixel'], 'function mzSpringShot('))
        body = b[b.index('{') + 1:b.rindex('}')].strip()
        self.assertEqual(body, 'mzSpring.at = 0;')

    def test_meiro_shot_empty(self):
        b = code_only(block(SRC['meiro'], 'function springShot('))
        for w in ['koto', 'setTimeout', 'shots', 'fx', '1200']:
            self.assertNotIn(w, b)
        self.assertIn('if (sp) sp.at = 0;', b)

    def test_calls_remain(self):
        self.assertEqual(len(re.findall(r'mzSpringShot\(\)', code_only(SRC['pixel']))) - 1, 3)
        self.assertEqual(len(re.findall(r'springShot\(g\)', code_only(SRC['meiro']))) - 1, 2)

    def test_spring_unchanged(self):
        c = code_only(SRC['pixel'])
        self.assertIn('MZ_SPRING_MS = 12000, MZ_SPRING_E = 1.3', c)
        self.assertIn('mzSpring.chain = 1; mzSpring.at = now;', c)
        self.assertIn('i < 5', code_only(block(SRC['pixel'], 'function mzSpringChain(')))

    def test_node_check(self):
        for n in ['pixel', 'meiro']:
            r = subprocess.run(['node', '--check', str(GO / (n + '.js'))], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_reference_game(self):
        for n in ['pixel', 'meiro']:
            self.assertIn('スナフキン：ムーミン谷のメロディ', SRC[n])


if __name__ == '__main__':
    unittest.main()
