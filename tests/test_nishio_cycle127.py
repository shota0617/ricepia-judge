# にしおサイクル127：画面の 外の ゴールへの 矢印が お米に かぶらない（横向き 844×390 で 矢印と 🏁 の 旗が 顔に かぶっていた）
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def clear(qx, qy, w, cy, vh, U, m, mt, a):
    code = grab_fn('mzArrowClear') + "console.log(JSON.stringify(mzArrowClear(%r,%r,%r,%r,%r,%r,%r,%r,%r)))" % (qx, qy, w, cy, vh, U, m, mt, a)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


# 横向き 844×390（2倍）：幅 1688・高さ 780・お米は 画面の まん中の 少し 上（cy 300）・上の 縁 mt 230・U 64・m 102
W, VH, CY, U, M, MT = 1688, 780, 300, 64, 102.4, 230


class ArrowClear(unittest.TestCase):
    def test_far_arrow_unchanged(self):
        self.assertEqual(clear(300, MT, W, CY, VH, U, M, MT, -2.5), [300, MT])

    def test_top_edge_slides_sideways_toward_goal(self):
        # 上の 縁、お米の すぐ 上（dx 20・dy −70 → 73 < 192）。ゴールは 左上（cos a < 0）→ 左へ
        qx, qy = clear(W / 2 + 20, MT, W, CY, VH, U, M, MT, -2.2)
        self.assertEqual(qy, MT)
        self.assertLess(qx, W / 2)
        self.assertGreaterEqual(math.hypot(qx - W / 2, qy - CY), U * 3 - 1e-6)
        # ゴールが 右上なら 右へ
        qx2, _ = clear(W / 2 + 20, MT, W, CY, VH, U, M, MT, -0.9)
        self.assertGreater(qx2, W / 2)

    def test_bottom_edge(self):
        qx, qy = clear(W / 2, VH - M, W, VH - M - 50, VH, U, M, MT, 1.2)
        self.assertEqual(qy, VH - M)
        self.assertGreaterEqual(math.hypot(qx - W / 2, qy - (VH - M - 50)), U * 3 - 1e-6)

    def test_side_edge_slides_vertically(self):
        # 右の 縁、お米の 右 すぐ（dx 100・dy 0）。ゴールは 右上（sin a < 0）→ 上へ
        qx, qy = clear(W / 2 + 100, CY, W, CY, VH, U, M, MT, -0.3)
        self.assertEqual(qx, W / 2 + 100)
        self.assertLess(qy, CY)
        self.assertGreaterEqual(qy, MT)

    def test_clamped_to_screen(self):
        qx, qy = clear(W / 2 + 20, MT, 300, CY, VH, U, M, MT, -2.2)   # せまい 画面：縁より 外には 出ない
        self.assertGreaterEqual(qx, M)

    def test_wired(self):
        g = grab_fn('drawMzGoal')
        self.assertIn('[qx, qy] = mzArrowClear(qx, qy, w, cy, vh, U, m, mt, a);', g)
        self.assertLess(g.index('mzArrowClear('), g.index('mzMap.pin = [qx, qy, R, a];'))


if __name__ == '__main__':
    unittest.main()
