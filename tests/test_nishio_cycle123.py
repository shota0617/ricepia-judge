# にしおサイクル123：転がして 遊ぶ 人は、はじめての ゴールまで 数の 浮き文字・知らせ（+5・+30pt・500m・1km・×3）を 出さない（記録は そのまま 上がる）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')

NUMS = ['👣+5', '💬 +10pt', '🎒 1km', '👣 歩いた道 500m！ +30pt', '⚡ さんぽエネルギー 満タン！ +20pt', '🧊 金の かけら +5pt（あと 3こ）', '🍚 ごはんつぶ ×12', 'おみやげ袋をあけた！　+30pt　🖼 NEW 岩瀬文庫の古い本']
PLAIN = ['🎁 すぐ近くに たからばこ！', '🧭 水色の 線が ゴールへの 道。✕ は 行き止まり', '🚪 生け垣の 戸が ひらいた！ ゴールは すぐ そこ', '👀 水の中を じっと見とる…', '🍵 抹茶びゅん！']


def game_pred(demo, goals, texts):
    i = GAME.index('const QUIET_NUM = ')
    src = GAME[i:GAME.index('function toast(msg) {')]
    code = ("let demo = %s;const store = { get: (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d) };" % ('true' if demo else 'false', json.dumps(goals), json.dumps(goals))
            + src + "console.log(JSON.stringify(%s.map(quietNumMsg)))" % json.dumps(texts, ensure_ascii=False))
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def pixel_pred(demo, goals, texts):
    i = PIXEL.index('const QUIET_NUM = ')
    src = PIXEL[i:PIXEL.index('function floatText(t) {')]
    code = ("const G = { demo: %s };const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);" % ('true' if demo else 'false', json.dumps(goals), json.dumps(goals))
            + src + "console.log(JSON.stringify(%s.map(quietNumText)))" % json.dumps(texts, ensure_ascii=False))
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Quiet(unittest.TestCase):
    def test_numbers_quiet_before_first_goal(self):
        for pred in (game_pred, pixel_pred):
            self.assertEqual(pred(True, None, NUMS), [True] * len(NUMS), pred.__name__)
            self.assertEqual(pred(True, '0', NUMS), [True] * len(NUMS), pred.__name__)

    def test_plain_text_still_shown(self):
        for pred in (game_pred, pixel_pred):
            self.assertEqual(pred(True, None, PLAIN), [False] * len(PLAIN), pred.__name__)

    def test_after_first_goal_and_walking(self):
        for pred in (game_pred, pixel_pred):
            self.assertEqual(pred(True, '3', NUMS), [False] * len(NUMS), pred.__name__)
            self.assertEqual(pred(False, None, NUMS), [False] * len(NUMS), pred.__name__)

    def test_wired(self):
        i = GAME.index('function toast(msg) {')
        self.assertIn('if (quietNumMsg(msg)) return;', GAME[i:i + 200])
        j = PIXEL.index('function floatText(t) {')
        self.assertIn('if (quietNumText(t)) return;', PIXEL[j:j + 300])


if __name__ == '__main__':
    unittest.main()
