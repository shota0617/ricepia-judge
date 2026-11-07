# にしおサイクル122：転がして 遊ぶ 人は、はじめての ゴールまで レベルの 知らせを 出さない（最初の 1分の「⭐ レベル2！」。レベルの 記録は そのまま 上がる）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def gain_fn():
    i = GAME.index('function gainPoints(')
    return GAME[i:GAME.index('\n}\n', i) + 2]


def run(demo, goals, total0, n):
    # levelOf：100pt ごとに 1 レベル。store は nsg_mzgoals だけ 返す
    code = ("const S = { points: 0, total: %d, log: [] }, session = { gained: 0 };let demo = %s;let rendered = 0;const renderHeader = () => { rendered++; };"
            "const levelOf = t => 1 + Math.floor(t / 100);const store = { get: (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d) };"
            % (total0, 'true' if demo else 'false', json.dumps(goals), json.dumps(goals))
            + gain_fn() + "const r = gainPoints(%d);console.log(JSON.stringify({ r, total: S.total, points: S.points, rendered }))" % n)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class LevelToast(unittest.TestCase):
    def test_rolling_before_first_goal_is_quiet(self):
        r = run(True, None, 95, 10)   # 95 → 105pt：レベル 1 → 2 だが 知らせ（戻り値）は 0
        self.assertEqual(r['r'], 0)
        self.assertEqual((r['total'], r['points'], r['rendered']), (105, 10, 1))   # ポイント・記録は そのまま 上がる
        self.assertEqual(run(True, 0, 95, 10)['r'], 0)

    def test_rolling_after_first_goal(self):
        self.assertEqual(run(True, 3, 95, 10)['r'], 2)
        self.assertEqual(run(True, 3, 195, 10)['r'], 3)
        self.assertEqual(run(True, 3, 50, 10)['r'], 0)   # 上がらなければ 0

    def test_walking_unchanged(self):
        self.assertEqual(run(False, None, 95, 10)['r'], 2)

    def test_source(self):
        self.assertIn("if (demo && !(store.get('nsg_mzgoals', 0) >= 3)) return 0;", gain_fn())


if __name__ == '__main__':
    unittest.main()
