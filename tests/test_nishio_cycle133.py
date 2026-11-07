# にしおサイクル133：はじめての ゴールまでは 寄り道の 集めもの8種（くだもの・地図ピース・見晴らし台・どうぐ・足跡・たいまつ・おとも・浄化）を 湧かせない（最初の 1分）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIXEL = (ROOT / 'nishio-go' / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


FIRST = PIXEL[PIXEL.index('const cubeFirstGoal = '):PIXEL.index('\n', PIXEL.index('const cubeFirstGoal = '))]

# (関数名, 状態オブジェクトの初期値, 湧いたかを返す式)
CASES = {
    'Fruit': ('{ sx: -1, sy: -1, cx: -1, cy: -1, left: 3, next: 0, mv: 0 }', 'mzFruit.cx', 'MZ_FRUIT = { moveMs: 1000 }'),
    'Piece': ('{ sx: -1, sy: -1, cx: -1, cy: -1, got: 0, next: 0 }', 'mzPiece.cx', 'MZ_PIECE = { n: 3 }'),
    'View': ('{ sx: -1, sy: -1, cx: -1, cy: -1, done: false, next: 0 }', 'mzView.cx', 'X = 0'),
    'Quest': ('{ sx: -1, sy: -1, cx: -1, cy: -1, got: 0, next: 0 }', 'mzQuest.cx', 'QUEST_TOOLS = [1, 2, 3]'),
    'Dino': ('{ sx: -1, sy: -1, cx: -1, cy: -1, found: false, next: 0, trail: [], ang: [] }', 'mzDino.cx', 'X = 0'),
    'Torch': ('{ sx: -1, sy: -1, cx: -1, cy: -1, held: false, next: 0 }', 'mzTorch.cx', 'X = 0'),
    'Brigade': ('{ sx: -1, sy: -1, cx: -1, cy: -1, count: 0, next: 0, hist: [], doneAt: 0 }', 'mzBrigade.cx', 'MZ_BRIGADE = { n: 3, tagMs: 1000 }'),
    'Purify': ('{ sx: -1, sy: -1, cells: [], done: [], count: 0, next: 0, doneAt: 0 }', 'mzPurify.cells.length', 'MZ_PURIFY = { tagMs: 1000 }'),
}


def run(kind, goals):
    init, probe, consts = CASES[kind]
    pick = '[[7, 7]]' if kind == 'Purify' else '[7, 7]'
    code = ("const MZ_K = 3;let dirty = false;const G = {};const rp = { x: 4.5, y: 4.5 };const %s;"
            "const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);"
            "const mz%s = %s;const mz%sPick = () => %s;const mzDinoPath = () => [[1, 1], [2, 1], [3, 1], [4, 1]];const mzDinoAngle = () => 0;"
            % (consts, json.dumps(goals), json.dumps(goals), kind, init, kind, pick)
            + FIRST + '\n' + grab_fn('mz%sTick' % kind) +
            "let now = 1000;for (let i = 0; i < 6 && !(%s > 0); i++) { mz%sTick(now); now += 600; }console.log(JSON.stringify({ at: %s, sx: mz%s.sx }))" % (probe, kind, probe, kind))
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class FirstMinute(unittest.TestCase):
    def test_no_spawn_before_first_goal(self):
        for kind, (_, _, _) in CASES.items():
            for g in (None, '0'):
                r = run(kind, g)
                self.assertEqual(r['sx'], 1, (kind, g))   # スタートは おぼえる
                self.assertIn(r['at'], (-1, 0), (kind, g))   # 湧かない

    def test_spawn_after_first_goal(self):
        for kind in CASES:
            r = run(kind, '1')
            self.assertEqual(r['at'], 1 if kind == 'Purify' else 7, kind)

    def test_marker_comment_on_each_tick(self):
        for kind in CASES:
            self.assertIn('if (cubeFirstGoal()) return;   // にしおサイクル133', grab_fn('mz%sTick' % kind), kind)


if __name__ == '__main__':
    unittest.main()
