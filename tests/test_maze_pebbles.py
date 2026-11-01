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
class Cycle16PebbleTests(unittest.TestCase):
    """サイクル16：めいろの米粒ドット（pixel.js の mzPebOk・mzPebTick）。通ると消える・金の米つぶ等と別"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'pixel.js').read_text(encoding='utf-8')
        cls.ok = re.search(r"^(function mzPebOk\(a, cx, cy\) \{[^\n]*\n.*?\n\})", cls.src, re.M | re.S).group(1)
        cls.skip = re.search(r"^(function mzPebSkip\(a\) \{[^\n]*\n.*?\n\})", cls.src, re.M | re.S).group(1)
        cls.tick = re.search(r"^(function mzPebTick\(\) \{[^\n]*\n.*?\n\})", cls.src, re.M | re.S).group(1)

    def run_js(self, body):
        # 4x4 マスの区域：0 壁・1 通路。(1,0) は参道、(2,0) は金の米つぶ、(3,0) はパネル、(0,1) はごはんつぶの列
        pre = ("const MZ_R = 4, MZ_K = 3; let dirty = false; const rp = { x: 0, y: 0 };"
               "const a = { x0: 0, y0: 0, t: new Uint8Array([1,1,1,1, 1,1,1,0, 1,1,1,1, 0,0,1,1]) };"
               "const mzSpotCell = (x, y) => x === 1 && y === 0; const mzGrainAt = (x, y) => x === 2 && y === 0;"
               "const mzPadAt = (x, y) => (x === 3 && y === 0 ? 2 : -1);"
               "const mzLineSet = () => [{ dots: [[0.5, 3.5 + 1], [1.5, 4.5]] }];"
               "const mzArea = (x, y) => (x >= 0 && x < 4 && y >= 0 && y < 4 ? a : null);")
        return node(pre + 'const mzPebPct = () => -1; const mzFanfare = () => {};' + self.skip + '\n' + self.ok + '\n' + self.tick + body)   # %と お祝いは test_maze_coverage.py で確かめる

    def test_placement_and_exclusions(self):
        r = self.run_js("const out = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (mzPebOk(a, x, y)) out.push([x, y]); return out;")
        got = {tuple(c) for c in r}
        self.assertNotIn((1, 0), got)   # 名所の参道
        self.assertNotIn((2, 0), got)   # 金の米つぶ
        self.assertNotIn((3, 0), got)   # びゅんパネル
        self.assertNotIn((0, 1), got)   # ごはんつぶの列
        self.assertNotIn((3, 1), got)   # 壁
        self.assertNotIn((0, 3), got)
        self.assertIn((0, 0), got)
        self.assertIn((2, 2), got)

    def test_eat_on_enter_only_that_cell(self):
        r = self.run_js("rp.x = 6.5; rp.y = 7; const before = mzPebOk(a, 2, 2), other = mzPebOk(a, 1, 2); mzPebTick(); return [before, mzPebOk(a, 2, 2), other, mzPebOk(a, 1, 2), dirty, [...a.eaten]];")
        self.assertEqual(r, [True, False, True, True, True, ['2,2']])

    def test_new_area_is_full_again_and_no_points(self):
        r = self.run_js("rp.x = 6.5; rp.y = 7; mzPebTick(); const b = { x0: 0, y0: 0, t: a.t }; return mzPebOk(b, 2, 2);")
        self.assertTrue(r)
        body = re.search(r"^function mzPebTick\(\) \{[^\n]*\n.*?\n\}", self.src, re.M | re.S).group(0)
        for w in ('G.', 'combo', 'floatText', 'riceSay', 'localStorage'):
            self.assertNotIn(w, body)   # ポイント・収集・袋・保存に触れない

    def test_unread_area_and_no_position(self):
        r = self.run_js("rp.x = 99; rp.y = 99; mzPebTick(); rp.x = null; mzPebTick(); return [dirty, mzPebOk(null, 0, 0)];")
        self.assertEqual(r, [False, False])

    def test_wired_only_in_maze(self):
        self.assertIn("if (mazeOn()) { drawMzPebs(", self.src)
        self.assertIn("if (mazeOn()) { mzSpotUpdate(now);", self.src)
        self.assertRegex(self.src, r"mzDotTick\(\); mzPebTick\(\);")
        # 金の米つぶの配置・回収は変えない
        self.assertIn("function mzGrainSet(a)", self.src)
        self.assertIn("G.mzGrain(mzGrainKey(a, b))", self.src)
