# 第4弾サイクル70：歩いた距離は比べない（自己ベストのトースト・「自己ベストの日」をなくす）
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def func(name):
    i = GAME.index('function %s(' % name)
    return GAME[i:GAME.index('\n}\n', i)]


class Calm(unittest.TestCase):
    def test_no_words(self):
        for w in ['自己ベスト！', '自己ベストの日', 'walk_best', 'bestToast']:
            self.assertNotIn(w, GAME)

    def test_walkbest_quiet(self):
        blk = func('walkBest')
        self.assertNotIn('toastAfter', blk)
        self.assertNotIn('track(', blk)
        self.assertIn('S.best = { m: day.walked, date: day.date }', blk)

    def test_today_card_word(self):
        blk = func('todayWalkCard')
        self.assertNotIn('isBest', blk)
        self.assertIn('知らない道をたくさん歩きました', blk)
        self.assertIn('はじめての道のポイントがもらえます', blk)

    def test_record_kept(self):
        self.assertIn('自己ベスト ${best.m ? fmtM(best.m) : ', func('todayWalkCard'))

    def test_proteus_once(self):
        lines = [l for l in GAME.splitlines() if 'Proteus' in l and '歩くこと自体' in l]
        self.assertEqual(len(lines), 1)

    def test_numbers(self):
        js = (func('walkBest') + '\n}').replace('dayState()', '{walked:400,date:"d2"}')
        out = subprocess.run(['node', '-e', 'let S={best:{m:300,date:"d1"}};' + js + ';walkBest();console.log(S.best.m)'],
                             capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, '400')


if __name__ == '__main__':
    unittest.main()
