# にしおサイクル132：はじめての ゴールまでは かくし宝箱を 湧かせず、絵の 浮き文字（🖼 NEW/キラ）も 出さない（最初の 1分）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def run(goals):
    code = ("const MZ_K = 3;let dirty = false;const G = {};let mzCacheCell = '';"
            "const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);const mzCachePick = () => [7, 7];"
            "const rp = { x: 4.5, y: 4.5 };const mzCache = { done: false, cx: -1, cy: -1, sx: -1, sy: -1, next: 0, dist: -1, prev: -1, warm: 0 };"
            "const mzCacheDist = () => 5;"
            % (json.dumps(goals), json.dumps(goals))
            + PIXEL[PIXEL.index('const cubeFirstGoal = '):PIXEL.index('\n', PIXEL.index('const cubeFirstGoal = '))] + '\n' + grab_fn('mzCacheTick') +
            "let now = 1000;for (let i = 0; i < 6 && mzCache.cx < 0; i++) { mzCacheTick(now); now += 600; }console.log(JSON.stringify({ cx: mzCache.cx, sx: mzCache.sx }))")
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Cache(unittest.TestCase):
    def test_no_cache_before_first_goal(self):
        for g in (None, '0'):
            self.assertEqual(run(g), {'cx': -1, 'sx': 1}, g)   # スタートは おぼえる・宝箱は 湧かない

    def test_cache_after_first_goal(self):
        self.assertEqual(run('3'), {'cx': 7, 'sx': 1})


class Reward(unittest.TestCase):
    def test_float_text_quiet_before_first_goal(self):
        i = GAME.index('function showReward(')
        body = GAME[i:GAME.index('\n}\n', i)]
        self.assertIn("if (f && !(demo && !(store.get('nsg_mzgoals', 0) >= 3))) P.floatText(dot.kira ? '🖼 キラ'", body)
        self.assertIn("P.floatText(`+${total}`);", body)


if __name__ == '__main__':
    unittest.main()
