# 第4弾サイクル20：M3 方向転換（向きの変わり方に上限。弧を描いて転がる）
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
RS_SRC = (GO / 'rollsync.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
MY_SRC = Path(__file__).read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rollsync.js')), expr)
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def ang(v):
    return math.atan2(v['vy'], v['vx'])


class LimitTurn(unittest.TestCase):
    def test_right_angle(self):
        v = run('r.limitTurn(0,3,3,0,%r)' % (math.pi / 6))
        self.assertAlmostEqual(ang(v), math.pi / 6, places=9)
        self.assertAlmostEqual(math.hypot(v['vx'], v['vy']), 3, places=9)

    def test_within_limit_unchanged(self):
        v = run('r.limitTurn(3,0.1,3,0,%r)' % (math.pi / 6))
        self.assertAlmostEqual(v['vx'], 3, places=9)
        self.assertAlmostEqual(v['vy'], 0.1, places=9)

    def test_reverse_is_deterministic(self):
        v = run('r.limitTurn(-3,0,3,0,%r)' % (math.pi / 6))
        self.assertAlmostEqual(ang(v), math.pi / 6, places=9)
        self.assertAlmostEqual(math.hypot(v['vx'], v['vy']), 3, places=9)

    def test_converges_monotonically(self):
        js = ('(()=>{let v={vx:3,vy:0},e=[];for(let i=0;i<40;i++){v=r.limitTurn(0,3,v.vx,v.vy,%r);'
              'e.push(Math.abs(Math.atan2(v.vy,v.vx)-Math.PI/2))}return e})()' % (math.pi / 10))
        e = run(js)
        for a, b in zip(e, e[1:]):
            self.assertLessEqual(b, a + 1e-12)
        self.assertLess(e[-1], math.radians(1))
        self.assertLess(next(i for i, x in enumerate(e) if x < math.radians(1)), 40)

    def test_trajectory_curves(self):
        js = ('(()=>{let v={vx:3,vy:0},x=0,y=0,mx=0;for(let i=0;i<40;i++){v=r.limitTurn(0,3,v.vx,v.vy,%r);x+=v.vx/60;y+=v.vy/60;mx=Math.max(mx,x)}return {x,y,mx}})()' % (math.pi / 10))
        t = run(js)
        # 寄せなし（即座に (0,3)）の直線軌跡は x=0。弧を描くぶん横へ膨らむ
        self.assertGreater(t['mx'], 0.1)
        self.assertGreater(t['x'], 0.1)
        self.assertGreater(t['y'], 0)

    def test_half_turn_time(self):
        self.assertEqual(run('r.TURN_PER_SEC'), 3.8)
        n = run('(()=>{let v={vx:3,vy:0},n=0;const m=r.TURN_PER_SEC/60;while(n<1000){v=r.limitTurn(-3,0,v.vx,v.vy,m);n++;if(Math.abs(Math.atan2(v.vy,v.vx))>Math.PI-1e-6)break}return n})()')
        self.assertGreaterEqual(n / 60, 0.6)
        self.assertLessEqual(n / 60, 1.1)

    def test_safe_inputs(self):
        for e in ['r.limitTurn(0,0,3,0,0.5)', 'r.limitTurn(3,0,0,0,0.5)', 'r.limitTurn(0,3,3,0,0)',
                  'r.limitTurn(0,3,3,0,NaN)', 'r.limitTurn(0,3,3,0,-1)', 'r.limitTurn(0,3,3,0,Infinity)',
                  'r.limitTurn(0,3,3,0,"x")', 'r.limitTurn(undefined,null,"a",{},0.5)', 'r.limitTurn()']:
            v = run(e)
            self.assertTrue(math.isfinite(v['vx']) and math.isfinite(v['vy']), e)
        self.assertEqual(run('r.limitTurn(0,3,3,0,0)'), {'vx': 3, 'vy': 0})   # 上限0＝向きを変えない（Codex指摘）


class Static(unittest.TestCase):
    def test_rollstep_uses_limitturn(self):
        i = PIXEL.index('function rollStep(')
        body = PIXEL[i:i + 6000]
        self.assertIn('RS.limitTurn(rp.vx, rp.vy, pvx, pvy, RS.TURN_PER_SEC * dt)', body)
        self.assertLess(body.index('const pvx = rp.vx'), body.index('RS.limitTurn'))

    def test_constant(self):
        self.assertIn('TURN_PER_SEC = 3.8', RS_SRC)

    def test_no_forbidden_words(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        for w in words:
            self.assertNotIn(w, MY_SRC)
            self.assertNotIn(w, RS_SRC)


if __name__ == '__main__':
    unittest.main()
