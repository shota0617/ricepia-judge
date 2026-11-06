# 第4弾サイクル64：切り返しの ひっかかり（反対へ 傾けて 速さが 0 を またぐ とき、方向転換の 上限が 180° の 向きかえを 少しずつに して 止まった ように 見えた）。運営者の声「転がす楽しさ」
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
RS_SRC = (GO / 'rollsync.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rollsync.js')), expr)
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


# rollStep と 同じ 刻み（1/120秒）・ころがり抵抗 0.9・減り 0.35・0.2・傾きの 力 13 で、前へ v0 で 転がる お米を 反対へ 全力で 傾け、うしろ向きに 1マス/秒 に なるまでの 秒数
REV = ('(()=>{const rev=(v0,lt)=>{let vx=v0,vy=0,t=0;const dt=1/120,cr=0.9,lin=0.35,air=0.2,f=-13;for(;t<4;t+=dt){const sp=Math.hypot(vx,vy);'
       'if(sp<r.STOP_V){vx+=Math.sign(f)*(Math.abs(f)-cr)*dt}else{const pvx=vx,pvy=vy;vx+=f*dt;const s2=Math.hypot(vx,vy),ns=r.glideSpeed(s2,dt,cr,lin,air);if(s2>0){vx*=ns/s2;vy*=ns/s2}'
       'if(lt){const l=r.limitTurn(vx,vy,pvx,pvy,r.TURN_PER_SEC*dt);vx=l.vx;vy=l.vy}}if(vx<-1)return t}return null};'
       'let worst=0,n=0;for(let v0=0.5;v0<=7;v0+=0.0137){const a=rev(v0,true),b=rev(v0,false);n++;if(a===null||b===null)return {bad:true};worst=Math.max(worst,a-b)}return {n,worst}})()')


class Pure(unittest.TestCase):
    def test_constant(self):
        self.assertEqual(run('r.TURN_MIN_V'), 0.5)
        self.assertEqual(run('r.TURN_PER_SEC'), 5.5)   # 弧の 上限は かえない

    def test_reverse_near_zero_is_immediate(self):
        # 0 を またぐ こま：前 0.055 → あと −0.053（どちらも 前の しきい 0.05 以上）。そのまま うしろ向きに
        v = run('r.limitTurn(-0.053,0,0.055,0,%r)' % (5.5 / 120))
        self.assertAlmostEqual(v['vx'], -0.053, places=9)
        self.assertEqual(v['vy'], 0)

    def test_limit_still_applies_at_speed(self):
        v = run('r.limitTurn(0,3,3,0,%r)' % (math.pi / 6))
        self.assertAlmostEqual(math.atan2(v['vy'], v['vx']), math.pi / 6, places=9)
        v = run('r.limitTurn(0,0.5,0.5,0,%r)' % (math.pi / 6))   # ちょうど しきい：上限が かかる
        self.assertAlmostEqual(math.atan2(v['vy'], v['vx']), math.pi / 6, places=9)
        v = run('r.limitTurn(0,0.49,0.49,0,%r)' % (math.pi / 6))   # しきいより おそい：そのまま
        self.assertAlmostEqual(v['vy'], 0.49, places=9)
        self.assertEqual(v['vx'], 0)

    def test_full_reverse_has_no_hitch(self):
        s = run(REV)
        self.assertNotIn('bad', s)
        self.assertGreater(s['n'], 400)
        self.assertLess(s['worst'], 0.02)   # 直す 前は 475 とおり 中 34 とおりで 0.05〜0.375秒 のこった

    def test_safe_inputs(self):
        for e in ['r.limitTurn(0,0.3,0.3,0,NaN)', 'r.limitTurn(undefined,null,"a",{},0.5)', 'r.limitTurn()']:
            v = run(e)
            self.assertTrue(math.isfinite(v['vx']) and math.isfinite(v['vy']), e)


class Static(unittest.TestCase):
    def test_uses_constant(self):
        i = RS_SRC.index('function limitTurn(')
        body = RS_SRC[i:i + 1200]
        self.assertIn('sp < TURN_MIN_V || psp < TURN_MIN_V', body)
        self.assertNotIn('sp < 0.05 || psp < 0.05', body)
        self.assertIn('TURN_MIN_V,', RS_SRC[RS_SRC.index('root.nishioRollSync = {'):])


if __name__ == '__main__':
    unittest.main()
