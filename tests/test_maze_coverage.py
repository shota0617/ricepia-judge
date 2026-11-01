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


def grab(src, name, kind='function'):
    if kind == 'function':
        return re.search(r"^(function %s\([^\n]*\{[^\n]*\n.*?\n\})" % name, src, re.M | re.S).group(1)
    return re.search(r"^(const %s = [^\n]*)" % name, src, re.M).group(1)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class Cycle17CoverageTests(unittest.TestCase):
    """サイクル17：めいろの区域ごとの踏破率%と 100% の小さなお祝い（pixel.js の mzPebStat・mzPebPct・mzPebTick）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'pixel.js').read_text(encoding='utf-8')
        s = cls.src
        cls.code = '\n'.join(grab(s, n) for n in ['mzPebSkip', 'mzPebOk', 'mzPebStat', 'mzFanfareDone', 'mzFanfare', 'mzPebTick']) + '\n' + grab(s, 'mzPebPct', 'const') + '\n'

    def run_js(self, body, cells='[1,1,1,1, 1,1,1,0, 1,1,1,1, 0,0,1,1]', store='{}'):
        # 4x4 区域。(1,0) 参道・(2,0) 金の米つぶ・(3,0) パネル・(0,1) ごはんつぶの列は分母から除く。(3,1)(0,3)(1,3) は壁
        pre = ("const MZ_R = 4, MZ_K = 3; let dirty = false; const rp = { x: 0, y: 0 }; const mzSpotCells = new Set(), mzSpotV = 1;"
               "const calls = { chord: 0, say: [], fx: 0 }; const roll = { happyT: 0 }; const mzFx = {push(){ calls.fx++; }};"
               "const chordSound = () => calls.chord++; const riceSay = t => calls.say.push(t);"
               "const store = %s; const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };"
               "const a = { rx: 0, ry: 0, x0: 0, y0: 0, t: new Uint8Array(%s) };"
               "const mzSpotCell = (x, y) => x === 1 && y === 0; const mzGrainAt = (x, y) => x === 2 && y === 0;"
               "const mzGrainSet = () => new Set([2]); const mzPadAt = (x, y) => (x === 3 && y === 0 ? 2 : -1);"
               "const mzLineSet = () => [{ dots: [[0.5, 4.5]] }];"
               "const mzArea = (x, y) => (x >= 0 && x < 4 && y >= 0 && y < 4 ? a : null);"
               "const eatAll = () => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { rp.x = x * 3 + 1.5; rp.y = y * 3 + 1.5; mzPebTick(); } };") % (store, cells)
        return node(pre + self.code + body)

    def test_percent_rises_and_reaches_100(self):
        r = self.run_js("const out = [mzPebPct(a)]; rp.x = 1.5; rp.y = 1.5; mzPebTick(); out.push(mzPebPct(a)); eatAll(); out.push(mzPebPct(a)); return [out, mzPebStat(a)];")
        out, st = r
        self.assertEqual(out[0], 0)
        self.assertTrue(0 < out[1] < 100)
        self.assertEqual(out[2], 100)
        self.assertEqual(st['n'], st['total'])
        self.assertEqual(st['total'], 9)   # 通路 13 マス − 参道・金・パネル・列の 4 マス

    def test_zero_denominator_gives_no_percent(self):
        r = self.run_js("return [mzPebPct(a), mzPebPct(null), mzPebStat(a).total];", cells='[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]')
        self.assertEqual(r, [-1, -1, 0])

    def test_fanfare_once_and_guard_survives_reopen(self):
        r = self.run_js("eatAll(); const first = [calls.chord, calls.say.length, calls.fx]; eatAll(); const again = [calls.chord, calls.say.length]; const saved = store.nsg_fanfare;"
                        "a.eaten = null; a.fanfared = false; a.pst = null; eatAll(); return [first, again, saved, calls.chord, calls.say.length];")
        self.assertEqual(r[0][:2], [1, 1])
        self.assertEqual(r[1], [1, 1])
        self.assertEqual(json.loads(r[2]), ['0_0'])
        self.assertEqual(r[3:], [1, 1])   # 区域を作りなおして 100% になっても 記録があれば 出さない

    def test_no_fanfare_below_100_and_broken_storage(self):
        r = self.run_js("rp.x = 1.5; rp.y = 1.5; mzPebTick(); return [calls.chord, calls.say.length];")
        self.assertEqual(r, [0, 0])
        r = self.run_js("eatAll(); return [calls.chord, mzPebPct(a)];", store='{"nsg_fanfare": "{こわれた"}')
        self.assertEqual(r, [1, 100])

    def test_dots_unchanged(self):
        r = self.run_js("const out = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (mzPebOk(a, x, y)) out.push(x + ',' + y); return out;")
        self.assertNotIn('1,0', r); self.assertNotIn('2,0', r); self.assertNotIn('3,0', r); self.assertNotIn('0,1', r)
        self.assertIn('0,0', r)

    def test_wiring_in_source(self):
        s = self.src
        self.assertIn('mzPebPct(', s[s.index('function drawMzClock'):s.index('// 足あと：いまの ゴール')])   # 時計の札（めいろの中だけ）
        tick = s[s.index('function mzPebTick'):s.index('function drawMzPebs')]
        self.assertNotIn('addPoint', tick); self.assertNotIn('G.add', tick)   # ポイントには関係しない


if __name__ == '__main__':
    unittest.main()
