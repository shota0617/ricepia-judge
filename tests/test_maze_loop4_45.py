# 第4弾サイクル45：たからばこ発見カードの全廃（参考ゲーム：A Short Hike）
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = (ROOT / 'nishio-go' / 'game.js').read_text(encoding='utf-8')

FOUND = ''.join(chr(c) for c in [12383, 12363, 12425, 12400, 12371, 12434, 35211, 12388, 12369, 12383])  # たからばこを見つけた
BOKU = chr(12412) + chr(12367)
DANI = chr(12384) + chr(12395)
PCT = chr(32004) + '20%'


def chest_body():
    i = GAME.index('function tryChest()')
    j = GAME.index('function firstCands', i)
    return GAME[i:j]


class ChestNoCard(unittest.TestCase):
    def test_no_showreward_in_trychest(self):
        self.assertNotIn('showReward', chest_body())

    def test_no_found_card_title(self):
        self.assertNotIn(FOUND, chest_body())

    def test_float_notice(self):
        b = chest_body()
        self.assertIn('floatText', b)
        self.assertIn('🎁 +', b)

    def test_sub_rewards_also_float(self):
        b = chest_body()
        self.assertIn('📖 +1', b)
        self.assertIn('🎒 ${bag.km}km', b)

    def test_levelup_notice_is_number_only(self):
        self.assertIn('Lv${lvUp}', chest_body())

    def test_records_kept(self):
        b = chest_body()
        self.assertIn('gainPoints(c.pts)', b)
        self.assertIn("type: 'chest'", b)
        self.assertIn('save();', b)

    def test_pickfirst_kept(self):
        self.assertIn('pickFirst(cands, show)', chest_body())

    def test_no_banned_in_diff(self):
        out = subprocess.run(['git', 'diff', 'origin/main'], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l[1:] for l in out.splitlines()
                          if l.startswith('+') and not l.startswith('+++'))
        for w in (BOKU, DANI, PCT):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
