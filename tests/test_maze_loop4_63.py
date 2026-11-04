# 第4弾サイクル63：吸いこみ（M6。金の 米つぶの そばで、つぶへ やさしく 引きよせられて ひろう）。運営者の声「転がす楽しさ」
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rollsync.js')), expr)
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Pure(unittest.TestCase):
    def test_constants(self):
        # 傾きの 力 13 より 弱く、ころがり抵抗 0.9 より 強い（手を はなしても すっと 入り、傾けて 出れば 出られる）
        self.assertEqual(run('[r.PULL_R,r.PULL_ACC,r.PULL_V,r.PULL_PICK]'), [2.4, 9, 3.2, 0.8])
        self.assertLess(run('r.PULL_ACC'), 13)
        self.assertGreater(run('r.PULL_ACC*(1-1.5/r.PULL_R)'), 0.9)   # マスの さかい（1.5マス）で 動きだす

    def test_out_of_reach(self):
        f = run('r.pullForce(0,0,3,0,0,0)')
        self.assertEqual([f['fx'], f['fy'], f['on'], f['pick']], [0, 0, False, False])
        self.assertEqual(run('r.pullForce(0,0,2.4,0,0,0).on'), False)

    def test_closer_is_stronger_and_toward(self):
        far = run('r.pullForce(0,0,2,0,0,0)')
        near = run('r.pullForce(0,0,1,0,0,0)')
        self.assertTrue(far['on'] and near['on'])
        self.assertGreater(far['fx'], 0)
        self.assertGreater(near['fx'], far['fx'])
        self.assertAlmostEqual(near['fx'], 9 * (1 - 1 / 2.4), places=9)
        d = run('r.pullForce(1,1,1-0.6,1+0.8,0,0)')   # ななめ：つぶの 向きへ
        self.assertAlmostEqual(math.atan2(d['fy'], d['fx']), math.atan2(0.8, -0.6), places=9)
        self.assertAlmostEqual(d['dist'], 1, places=9)

    def test_no_push_when_already_fast(self):
        f = run('r.pullForce(0,0,1,0,3.2,0)')
        self.assertEqual([f['fx'], f['fy'], f['on']], [0, 0, True])
        g = run('r.pullForce(0,0,1,0,-3.2,0)')   # はなれる 向きに 速くても 引く
        self.assertGreater(g['fx'], 0)

    def test_pick_radius(self):
        self.assertTrue(run('r.pullForce(0,0,0.8,0,0,0).pick'))
        self.assertFalse(run('r.pullForce(0,0,0.81,0,0,0).pick'))
        z = run('r.pullForce(0,0,0,0,1,1)')   # ちょうど つぶの 上：力は 0（向きが きまらない）
        self.assertEqual([z['fx'], z['fy'], z['pick']], [0, 0, True])

    def test_safe_inputs(self):
        for e in ['r.pullForce(NaN,0,1,0,0,0)', 'r.pullForce(0,0,Infinity,0,0,0)', 'r.pullForce(0,0,1,0,"a",{})',
                  'r.pullForce()', 'r.pullForce(null,undefined,1,0)']:
            f = run(e)
            self.assertTrue(math.isfinite(f['fx']) and math.isfinite(f['fy']), e)
        self.assertEqual(run('r.pullForce(NaN,0,1,0,0,0).on'), False)
        g = run('r.pullForce(0,0,1,0,"a",{})')   # 速さが 読めなければ 0 と みなして 引く
        self.assertGreater(g['fx'], 0)

    def test_sucked_in_from_cell_edge(self):
        # マスの さかい（1.5マス）に 止めて 置くと、手を はなした ままで 0.5〜1.2秒で ひろう 近さまで 吸いこまれる（ころがり抵抗 0.9・減り 0.35・0.2 は rollStep と 同じ）
        js = ('(()=>{let x=-1.5,v=0,t=0;const dt=1/120,cr=0.9,lin=0.35,air=0.2;for(;t<3;t+=dt){const f=r.pullForce(x,0,0,0,v,0);if(f.pick)return {t,v};'
              'if(Math.abs(v)<r.STOP_V){if(Math.abs(f.fx)>cr)v+=Math.sign(f.fx)*(Math.abs(f.fx)-cr)*dt;else v=0}else{v+=f.fx*dt;v=Math.sign(v)*r.glideSpeed(Math.abs(v),dt,cr,lin,air)}x+=v*dt}return {t:null,v}})()')
        s = run(js)
        self.assertIsNotNone(s['t'])
        self.assertGreater(s['t'], 0.5)
        self.assertLess(s['t'], 1.2)
        self.assertLess(s['v'], 3.2)   # あおらない

    def test_tilt_away_escapes(self):
        # 傾けて 出れば 出られる：さかいに 置いて 反対へ 13 で 押すと、吸いこまれずに はなれる
        js = ('(()=>{let x=-1.5,v=0;const dt=1/120;for(let t=0;t<1;t+=dt){const f=r.pullForce(x,0,0,0,v,0);if(f.pick)return false;v+=(f.fx-13)*dt;x+=v*dt}return x<-2.4})()')
        self.assertTrue(run(js))


class Static(unittest.TestCase):
    def test_rollstep_adds_pull_before_fp(self):
        i = PIXEL.index('function rollStep(')
        body = PIXEL[i:i + 6000]
        self.assertIn('const pl = mzGrainPull();', body)
        self.assertIn('if (pl) { fx += pl.fx; fy += pl.fy; }', body)
        self.assertLess(body.index('const pl = mzGrainPull();'), body.index('const fp = Math.hypot(fx, fy);'))

    def test_pull_not_through_hedge(self):
        i = PIXEL.index('function mzGrainPull(')
        body = PIXEL[i:PIXEL.index('\n}\n', i)]
        self.assertIn('RS.pullForce(rp.x, rp.y, p[0], p[1], rp.vx, rp.vy)', body)
        self.assertIn('!mzOpen(gx, gy, -dx, -dy)', body)   # つぶの マスから その 向きへ 通れない となりには 引かない
        self.assertIn('[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]', body)

    def test_tick_waits_for_pick_radius(self):
        i = PIXEL.index('function mzGrainTick(')
        body = PIXEL[i:PIXEL.index('\n}\n', i)]
        self.assertIn('RS.PULL_PICK', body)
        self.assertIn('if (Math.hypot(rp.x - p[0], rp.y - p[1]) > pk) return;', body)
        self.assertLess(body.index('> pk) return;'), body.index('G.mzGrain(mzGrainKey(a, b))'))
        self.assertIn('rp.vx *= 0.45; rp.vy *= 0.45;', body)   # ひろったら ふっと ゆるむ
        self.assertIn('mzGrainDone = true;', body)
        self.assertNotIn('if (k === mzGrainCell || !mzArea(a, b)) return;', body)   # マスに 入った だけでは しらべおわりに しない

    def test_grain_pos_matches_drawing(self):
        self.assertIn('const mzGrainPos = (cx, cy) => mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K);', PIXEL)
        i = PIXEL.index('function drawMzGrains(')
        self.assertIn('mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K)', PIXEL[i:i + 3000])

    def test_api_and_playtest(self):
        self.assertIn('grainPull: () => ({ on: mzPull.on, dist: mzPull.dist, n: mzPull.n })', PIXEL)
        pt = (ROOT / 'tools' / 'playtest.js').read_text(encoding='utf-8')
        self.assertIn('R.checks.grainPull = await', pt)
        self.assertIn('need(c.grainPull && c.grainPull.ok', pt)


if __name__ == '__main__':
    unittest.main()
