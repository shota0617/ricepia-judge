import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'

RUN = r"""
const { fn } = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(new Function(fn)()));
"""


def node(fn):
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run(['node', '-e', RUN], input=json.dumps({'fn': fn}), capture_output=True, text=True, cwd=tmp, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle18FogTests(unittest.TestCase):
    """サイクル18：踏破マップ＋ズーム連動フォグ（pixel.js の MZ_FOG・mzFogAlpha・drawMzFog）"""

    @classmethod
    def setUpClass(cls):
        src = (GO / 'pixel.js').read_text(encoding='utf-8')
        cls.table = re.search(r"^(const MZ_FOG = [^\n]*)", src, re.M).group(1)
        cls.alpha = re.search(r"^(function mzFogAlpha\(.*?\n\})", src, re.M | re.S).group(1)
        cls.draw = "\n".join(re.search(r"^(function %s\(.*?\n\})" % n, src, re.M | re.S).group(1) for n in ("mzFogCells", "mzFogFill", "drawMzFogTint", "drawMzFogVeil"))

    def fog(self, body):
        return node(self.table + '\n' + self.alpha + '\n' + body)

    def test_three_levels(self):
        r = self.fog("return [mzFogAlpha(3, 2, false), mzFogAlpha(3, 20, true), mzFogAlpha(3, 20, false), mzFogAlpha(3, 2, true)];")
        near_new, far_seen, far_new, near_seen = r
        self.assertEqual(near_new['veil'], 0)       # 視界内は未踏でもくっきり
        self.assertGreater(far_new['veil'], far_seen['veil'])   # 未踏の視界外がいちばん濃い
        self.assertGreater(far_seen['veil'], 0)     # 踏破済みでも視界外は少しもや
        self.assertGreater(near_seen['tint'], near_new['tint'])   # 踏破は色づく
        self.assertEqual(near_seen['veil'], 0)

    def test_zoom_out_has_no_sight_limit_and_zoom_in_narrows(self):
        r = self.fog("return [mzFogAlpha(1, 500, false).veil, mzFogAlpha(1, 500, false).veil < mzFogAlpha(4, 500, false).veil, mzFogAlpha(4, 5, false).veil, mzFogAlpha(2, 5, false).veil, mzFogAlpha(9, 5, false).veil, mzFogAlpha(0, 5, true).tint];")
        self.assertEqual(r[0], 0.2)    # ズームアウトは未踏の通路網を全体にうすく（視界制限なし＝遠くも同じ薄さ）
        self.assertTrue(r[1])
        self.assertGreater(r[2], 0)    # ズームインは近くても半径4を超えたらもや
        self.assertEqual(r[3], 0)      # ズーム2は半径9なので5マスは視界内
        self.assertIsNotNone(r[4])     # 範囲外のスケールでも落ちない
        self.assertGreater(r[5], 0)

    def run_draw(self, goal, scale=3):
        # 3x1 の通路（x=0 踏破済み・x=1 ゴール・x=2 遠い未踏）。fillRect の色と位置を記録する
        pre = ("const MZ_R = 3, MZ_K = 1; let rec = false; const rp = { x: -20, y: 0.5 }; const mzScale = %d;"
               "const mzAreas = new Map([['0_0', { x0: 0, y0: 0, t: new Uint8Array([1,1,1, 0,0,0, 0,0,0]), eaten: new Set(['0,0']) }]]);"
               "const mzTrail = new Map(); const mzZoneTint = () => ({ rgb: '255,214,102', k: 1 }); const mzRt = { path: %s }; const mzOn = (x, y) => [x, y];"
               "const calls = []; const ctx = { canvas: { width: 999, height: 999 }, fillStyle: '', fillRect(x, y, w, h) { calls.push([String(this.fillStyle), x]); }, createRadialGradient() { return { addColorStop() {}, toString() { return 'glow'; } }; } };"
               % (scale, goal)
               )
        return node(pre + self.table + '\n' + self.alpha + '\n' + self.draw + "\ndrawMzFogTint(0, 0, 3, 1, 0, 0, 10); drawMzFogVeil(0, 0, 3, 1, 0, 0, 10, 0); return calls;")

    def test_goal_cell_is_outside_fog_and_glows(self):
        calls = self.run_draw('[[2, 0]]', scale=4)   # ゴール(2,0)は遠い未踏だがもやをかけない
        veiled_x = [x for c, x in calls if c.startswith('rgba(244')]
        self.assertNotIn(20, veiled_x)
        self.assertIn(10, veiled_x)   # (1,0) は遠い未踏のもや
        self.assertIn('glow', [c for c, x in calls])   # ゴールのマスはフォグに関係なく光る

    def test_eaten_cell_is_tinted_and_no_goal_is_safe(self):
        calls = self.run_draw('null', scale=1)
        self.assertTrue(any(c.startswith('rgba(255,214,102') and x == 0 for c, x in calls))   # 食べたマスは色づく
        self.assertFalse(any(x == 0 and c.startswith('rgba(244') for c, x in calls))   # 踏破済みにはもやをかけない
        self.assertTrue(any(c.startswith('rgba(244') for c, x in calls))   # 未踏の遠い通路はうすくもや
        self.assertNotIn('glow', [c for c, x in calls])


if __name__ == '__main__':
    unittest.main()
