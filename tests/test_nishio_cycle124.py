# にしおサイクル124：はじめての ゴールまでは 迷子の お米（「🆘 たすけて！」の 救助クエスト）を 出さない（最初の 1分、助けを 求める 強い 言葉を 見せない）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def run(goals):
    code = ("const MZ_K = 3, MZ_RESCUE = { join: 5, pts: 30, min: 10, reach: 18, tagMs: 6000 };let dirty = false;const G = {};"
            "const lsGet = (k, d) => (k === 'nsg_mzgoals' && %s !== null ? %s : d);const mzRescuePick = () => [7, 7];"
            "const rp = { x: 4.5, y: 4.5 };const mzRescue = { cx: -1, cy: -1, sx: -1, sy: -1, spawned: false, joined: false, paid: false, next: 0, doneAt: 0, hist: [], dist: -1, dkey: '' };"
            % (json.dumps(goals), json.dumps(goals))
            + PIXEL[PIXEL.index('const rescueFirstGoal = '):PIXEL.index('function mzRescueTick(')] + grab_fn('mzRescueTick') +
            "let now = 1000;for (let i = 0; i < 6 && !mzRescue.spawned; i++) { mzRescueTick(now); now += 600; }console.log(JSON.stringify({ spawned: mzRescue.spawned, cx: mzRescue.cx, sx: mzRescue.sx }))")
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Rescue(unittest.TestCase):
    def test_no_rescue_before_first_goal(self):
        for g in (None, '0'):
            r = run(g)
            self.assertEqual((r['spawned'], r['cx'], r['sx']), (False, -1, 1), g)   # スタートは おぼえる・迷子は 出ない

    def test_rescue_after_first_goal(self):
        r = run('1')
        self.assertEqual((r['spawned'], r['cx']), (True, 7))

    def test_source(self):
        t = grab_fn('mzRescueTick')
        self.assertIn('if (rescueFirstGoal()) return;', t)
        self.assertLess(t.index('mzRescue.next = now + 500;'), t.index('if (rescueFirstGoal()) return;'))
        self.assertLess(t.index('if (rescueFirstGoal()) return;'), t.index('const c = mzRescuePick();'))


if __name__ == '__main__':
    unittest.main()
