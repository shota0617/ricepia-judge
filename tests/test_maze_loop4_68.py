# 第4弾サイクル68：米粒がのんびり転がる（速さの上限・加速・減速・方向転換・演出を穏やかに）
import json
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
RS = GO / 'rollsync.js'


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(RS)), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def const(name):
    return float(re.search(r'\b%s = ([0-9.]+)' % name, PIXEL).group(1))


class Calm(unittest.TestCase):
    def test_constants(self):
        for k, v in dict(ROLL_MAX=4.2, ROLL_ACC=7, ROLL_LIN=0.28, ROLL_AIR=0.12, ROLL_BOUNCE=0.25, HOP_V=4.6, ROLL_CRR=0.9).items():
            self.assertEqual(const(k), v, k)
        self.assertGreater(const('HOP_V'), const('ROLL_MAX'))
        self.assertEqual(run('r.TURN_PER_SEC'), 3.8)

    def test_shadow(self):
        self.assertLessEqual(run('r.shadowStretch(4.2)'), 1.15)
        self.assertEqual(run('r.shadowStretch(2.5)'), 1)

    def test_half_turn(self):
        n = run('(()=>{let v={vx:3,vy:0},n=0;const m=r.TURN_PER_SEC/60;while(n<1000){v=r.limitTurn(-3,0,v.vx,v.vy,m);n++;if(Math.abs(Math.atan2(v.vy,v.vx))>Math.PI-1e-6)break}return n})()')
        self.assertTrue(0.6 <= n / 60 <= 1.1)

    def test_glide_longer(self):
        t = "(l,a)=>{let s=4.2,t=0;while(s>0&&t<60){s=r.glideSpeed(s,1/60,0.9,l,a);t+=1/60}return t}"
        self.assertGreater(run('(%s)(0.28,0.12)' % t), run('(%s)(0.35,0.2)' % t))

    def test_effects(self):
        self.assertIn('roll.v > 3.5) {', PIXEL)
        self.assertIn('(KP.ghost && roll.v > 0.8)', PIXEL)   # c84：のこりかげは 選んだ 転がり方だけ
        self.assertIn('Math.min(0.05 * (KP.stretch || 1), (roll.v - 3.5)', PIXEL)


if __name__ == '__main__':
    unittest.main()
