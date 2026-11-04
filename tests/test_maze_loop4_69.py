# 第4弾サイクル69：100歩たんけんは比べない（自己ベスト更新の追加点・お祝い・煽りをなくす）
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def done_block():
    i = GAME.index('h.done = true;')
    return GAME[i:GAME.index('\n}', i)]


class Calm(unittest.TestCase):
    def test_no_win_const(self):
        self.assertIn('const H100 = { steps: 100, cap: 30 };', GAME)
        self.assertNotIn('H100.win', GAME)
        self.assertNotRegex(GAME, r'H100 = \{[^}]*win')

    def test_pts_only_base(self):
        blk = done_block()
        self.assertIn('pts = Math.min(H100.cap, h.fresh);', blk)
        self.assertNotRegex(blk, r'\bwin\b')

    def test_pts_values(self):
        f = lambda fresh: int(subprocess.run(['node', '-e', 'console.log(Math.min(30,%d))' % fresh], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(f(20), 20)   # 前の自己ベスト10でも25にならない
        self.assertEqual(f(40), 30)

    def test_toast_and_track(self):
        blk = done_block()
        self.assertIn("toastAfter(`🏁 ${h.fresh}マス${pts ? ` +${pts}pt` : ''}`);", blk)
        self.assertNotIn('🎉', blk)
        self.assertIn("track('h100', { fresh: h.fresh, best, mode", blk)

    def test_tomorrow_line(self):
        self.assertIn('out.push(`あしたも 100歩たんけん：はじめての道を さがそう`);', GAME)
        self.assertNotIn('自己ベストを こえると', GAME)

    def test_record_kept(self):
        self.assertIn('if (best) S.h100best = h.fresh;', done_block())
        self.assertIn("{ id: 'h100', i: '👣', n: 'たんけん名人'", GAME)
        self.assertIn('cur: S.h100best || 0, goal: 50', GAME)

    def test_reference_comment_only(self):
        self.assertIn('PowerWash Simulator', GAME)
        self.assertEqual(len(re.findall('PowerWash', GAME)), 1)


if __name__ == '__main__':
    unittest.main()
