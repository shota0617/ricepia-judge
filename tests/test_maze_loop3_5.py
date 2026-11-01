import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'nishio-go' / 'pixel.js').read_text(encoding='utf-8')


class Cycle5FogOrderTests(unittest.TestCase):
    """第3弾サイクル5：フォグのもや（veil）を最後に描き、視界外の物を覆う"""

    @classmethod
    def setUpClass(cls):
        cls.line = re.search(r"^\s*if \(mazeOn\(\)\) \{ drawMzFogTint.*$", SRC, re.M).group(0)

    def pos(self, name):
        i = self.line.find(name + '(')
        self.assertGreaterEqual(i, 0, name)
        return i

    def test_veil_after_items(self):
        v = self.pos('drawMzFogVeil')
        for n in ('drawMzPebs', 'drawMaze', 'drawMzGates', 'drawMzPads', 'drawMzGrains', 'drawMzHint', 'drawMzDots', 'drawMzCrows', 'drawMzSpring', 'drawMzCritters'):
            self.assertLess(self.pos(n), v, n)
        self.assertLess(self.pos('drawMzFogTint'), self.pos('drawMzPebs'))   # 色づけは地色なので早い

    def test_hero_drawn_after_veil(self):
        i = SRC.index('drawMzFogVeil(tx0')
        self.assertRegex(SRC[i:], r"drawRiceBall\(")   # 主人公はもやのあと
        self.assertNotIn('drawRiceBall', SRC[SRC.index('function drawMzFogVeil'):SRC.index('function drawMzPebs')])

    def test_levels_and_goal_exempt(self):
        self.assertIn('{ sight: 0, veil: 0.2 }', SRC)
        self.assertIn('{ sight: 9, veil: 0.3 }', SRC)
        self.assertIn('{ sight: 6, veil: 0.4 }', SRC)
        self.assertIn('{ sight: 4, veil: 0.46 }', SRC)
        self.assertRegex(SRC, r"gp\[0\] === cx && gp\[1\] === cy\)\) continue")   # ゴールのマスは対象外
        veil = SRC[SRC.index('function drawMzFogVeil'):SRC.index('function drawMzPebs')]
        self.assertLess(veil.index('mzFogFill'), veil.index('createRadialGradient'))   # 光はもやのあと
        self.assertIn('if (rec) return;', veil)

    def test_no_banned_words(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for w in ('ぼく', 'だに', '約20%'):
            self.assertFalse([l for l in added if w in l], w)


if __name__ == '__main__':
    unittest.main()
