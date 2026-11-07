# にしおサイクル136：数の 知らせの 判定に「48m・」「25/100」の 形を 足す（日付を またいだ ときの「👣 きのうのさんぽ：48m・…」「👣 25/100」が すり抜けていた）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')

LEAK = ['👣 きのうのさんぽ：48m・チェックイン 0回・新しい絵 0枚', '👣 25/100', '👣 50/100', '🍊 くだものゲット 2/3']
PLAIN = ['👣 100歩たんけん', '🎁 すぐ近くに たからばこ！', '🧭 水色の 線が ゴールへの 道。✕ は 行き止まり', '🏁 つぎの ゴール']


def game_pred(texts):
    i = GAME.index('const QUIET_NUM = ')
    src = GAME[i:GAME.index('function toast(msg) {')]
    code = "let demo = true;const store = { get: (k, d) => d };" + src + "console.log(JSON.stringify(%s.map(quietNumMsg)))" % json.dumps(texts, ensure_ascii=False)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def pixel_pred(texts):
    i = PIXEL.index('const QUIET_NUM = ')
    src = PIXEL[i:PIXEL.index('function floatText(t) {')]
    code = "const G = { demo: true };const lsGet = (k, d) => d;" + src + "console.log(JSON.stringify(%s.map(quietNumText)))" % json.dumps(texts, ensure_ascii=False)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Quiet(unittest.TestCase):
    def test_leaks_now_quiet(self):
        for pred in (game_pred, pixel_pred):
            self.assertEqual(pred(LEAK), [True] * len(LEAK), pred.__name__)

    def test_plain_still_shown(self):
        for pred in (game_pred, pixel_pred):
            self.assertEqual(pred(PLAIN), [False] * len(PLAIN), pred.__name__)

    def test_same_regex_in_both(self):
        g = GAME[GAME.index('const QUIET_NUM = '):GAME.index(';', GAME.index('const QUIET_NUM = '))]
        p = PIXEL[PIXEL.index('const QUIET_NUM = '):PIXEL.index(';', PIXEL.index('const QUIET_NUM = '))]
        self.assertEqual(g, p)


if __name__ == '__main__':
    unittest.main()
