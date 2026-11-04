# 第4弾サイクル67：のんびり・平和への修正 第2弾「追いかけない・比べない」（参考ゲーム Lake）
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


PIXEL = read('nishio-go/pixel.js')
GAME = read('nishio-go/game.js')
# 禁止語はリテラルで書かない（Unicodeエスケープ）
BANNED = ['\u307c\u304f', '\u3060\u306b', '\u7d0420%']


def body(src, head):
    i = src.index(head)
    j = src.index('\n}\n', i)
    return src[i:j]


class Cycle67(unittest.TestCase):
    def test_lake_noted(self):
        self.assertIn('Lake', PIXEL)

    def test_cloud_does_not_chase(self):
        self.assertRegex(PIXEL, r'function mzChaseLive\(\) \{ return false; \}')
        self.assertRegex(PIXEL, r'function mzChaseGoal\(id\) \{ return null; \}')
        self.assertNotIn('mzChaseCatch', PIXEL)
        self.assertNotIn('mzChaseWay(mzChase', PIXEL)
        self.assertNotIn('つかまった…', PIXEL)
        self.assertNotIn('function drawMzChaseTag', PIXEL)

    def test_storm_ring_not_drawn(self):
        chain = [l for l in PIXEL.split('\n') if 'drawMzChase(ox, oy, T, now)' in l]
        self.assertTrue(chain)
        for l in chain:
            self.assertNotIn('drawMzStormRing(ox', l)

    def test_game_chase_no_points(self):
        self.assertNotIn('MZ.chaseGoal', GAME)
        self.assertIn('function mzChase() { return null; }', GAME)
        self.assertNotIn('S.chaseGot = ', GAME)

    def test_pad_chain_no_timer_no_best(self):
        self.assertNotIn('MZ_PAD_CHAIN_MS', PIXEL)
        self.assertNotIn('nsg_pad_best', PIXEL)
        self.assertNotIn('mzPad.lastT', PIXEL)
        self.assertIn('mzPad.best = ++mzPad.chain', PIXEL)

    def test_combo_no_best(self):
        self.assertNotIn('nsg_combo_best', PIXEL)
        self.assertNotIn('ベスト こえた', PIXEL)
        self.assertNotIn('あたらしい ベスト', PIXEL)
        self.assertNotIn('おしい！ あと', PIXEL)
        self.assertNotIn('🏅${', PIXEL)
        self.assertNotIn("'🏅'", PIXEL)
        self.assertIn('combo.best = combo.n', PIXEL)
        self.assertIn('mzRt.run.combo = combo.n', PIXEL)

    def test_koro_record_only_dots(self):
        rec = body(GAME, 'function renderKoroRec()')
        self.assertNotIn('ベスト', rec)
        self.assertNotIn('data-share-open', rec)
        self.assertIn('きょう ひろった つぶ', rec)

    def test_daily_bonus_flat(self):
        self.assertIn('const b = CFG.pts.daily;', GAME)
        self.assertNotIn('日連続） +', GAME)
        self.assertNotIn('special = streakDot()', GAME)
        self.assertNotIn('streakMax) * CFG.pts.streakStep', GAME)
        self.assertNotIn('連続日数ごとに', GAME)
        self.assertNotIn('あしたも続けると', GAME)
        self.assertNotIn('日目のボーナス', GAME)
        self.assertIn('S.streak.max', GAME)

    def test_no_banned_words_in_this_test(self):
        for w in BANNED:
            self.assertNotIn(w, read('tests/test_maze_loop4_67.py'))


if __name__ == '__main__':
    unittest.main()
