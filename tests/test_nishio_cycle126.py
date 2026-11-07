# にしおサイクル126：手で 動かしはじめるまでは 道しるべの 知らせ（💡 光る 点）を 出さない（再訪の 最初の 1分、開いて 眺めている だけで 27秒に 知らせが 出ていた）
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


def run(touched, secs):
    code = ("const toasts = [];const G = { toast: t => toasts.push(t) };const mzHelpOn = () => false;const mzHelp = { offered: false };"
            "const mzRt = { path: [1, 2, 3, 4], showUntil: 0, bestT: 0, hints: 0, touched: %s };"
            % ('true' if touched else 'false')
            + grab_fn('mzHintTick') +
            "for (let t = 0; t <= %d * 1000; t += 500) mzHintTick(t);console.log(JSON.stringify({ toasts, hints: mzRt.hints, bestT: mzRt.bestT, show: mzRt.showUntil }))" % secs)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Hint(unittest.TestCase):
    def test_quiet_until_touched(self):
        r = run(False, 60)
        self.assertEqual(r['toasts'], [])
        self.assertEqual((r['hints'], r['show']), (0, 0))   # 光る 点も 出ない
        self.assertEqual(r['bestT'], 60000)   # 25秒は 動かしはじめてから 数える

    def test_hint_after_touched(self):
        r = run(True, 30)
        self.assertEqual(r['toasts'], ['💡 道しるべ：光る 点の ほうへ 進もう'])
        self.assertEqual(r['hints'], 1)

    def test_source(self):
        self.assertIn("if (typeof mzRt !== 'undefined') mzRt.touched = true;", grab_fn('idleTouch'))
        self.assertIn('mzRt.len0 = 0; mzRt.touched = false;', PIXEL)   # ゴールが かわったら また 手で 動かすまで 出さない
        self.assertIn('if (!mzRt.touched) { mzRt.bestT = now; return; }', grab_fn('mzHintTick'))


if __name__ == '__main__':
    unittest.main()
