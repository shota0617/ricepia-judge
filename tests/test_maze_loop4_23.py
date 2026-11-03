# 第4弾サイクル23：M5 眺めるコロコロ（無操作が続くと 近くの名所へ ゆっくり転がり続ける）
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
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Pure(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(run('[r.IDLE_START,r.IDLE_SPEED,r.IDLE_ACC]'), [8, 1.4, 5])

    def test_due_boundary(self):
        self.assertFalse(run('r.idleDue(7.9,false)'))
        self.assertTrue(run('r.idleDue(8,false)'))
        self.assertFalse(run('r.idleDue(30,true)'))
        for e in ['NaN', 'Infinity', '"9"', 'null', 'undefined']:
            self.assertFalse(run('r.idleDue(%s,false)' % e), e)

    def test_target_nearest_exclude(self):
        s = '[{x:10,y:0,key:"a"},{x:5,y:0,key:"b"},{x:1,y:0,key:"c"},{x:-5,y:0,key:"d"}]'
        self.assertEqual(run('r.idleTarget(0,0,%s,"")' % s), {'x': 1, 'y': 0, 'key': 'c', 'dist': 1})   # 近い点も候補（外すと到着判定との間で目標が行き来して止まる）
        self.assertEqual(run('r.idleTarget(0,0,%s,"c")' % s)['key'], 'b')   # 着いた点は exclude で外れ、次は近い順
        self.assertEqual(run('r.idleTarget(0,0,%s,["c","b"])' % s)['key'], 'd')   # 除外は配列でもよい（近くの到着済みをまとめて外す）
        self.assertEqual(run('r.idleTarget(0,0,[{x:5,y:0,key:"p"},{x:-5,y:0,key:"q"}],"")')['key'], 'p')
        self.assertEqual(run('r.idleTarget(0,0,[{x:3,y:4}],"")')['key'], '3,4')
        self.assertEqual(run('r.idleTarget(0,0,[{x:1,y:1,key:"n"}],"")')['key'], 'n')
        self.assertIsNone(run('r.idleTarget(0,0,[{x:NaN,y:1},null,{x:"a",y:2}],"")'))
        for e in ['null', 'undefined', '5', '{}']:
            self.assertIsNone(run('r.idleTarget(0,0,%s,"")' % e), e)
        self.assertIsNone(run('r.idleTarget(NaN,0,[{x:9,y:9}],"")'))

    def test_force(self):
        f = run('r.idleForce(0,0,10,0,0,0)')
        self.assertEqual(f, {'fx': 5, 'fy': 0, 'dist': 10, 'arrived': False})
        f = run('r.idleForce(0,0,0,-10,0,0)')
        self.assertAlmostEqual(f['fy'], -5)
        self.assertEqual(run('r.idleForce(0,0,10,0,1.4,0)')['fx'], 0)   # 速さの上限
        self.assertEqual(run('r.idleForce(0,0,10,0,0,3)')['fx'], 0)   # 横向きでも じゅうぶん速ければ あおらない（Codex指摘）
        self.assertEqual(run('r.idleForce(0,0,10,0,-3,0)')['fx'], 5)   # 逆向きなら 押す
        self.assertEqual(run('r.idleForce(0,0,1,0,0,0)'), {'fx': 0, 'fy': 0, 'dist': 1, 'arrived': True})
        self.assertFalse(run('r.idleForce(0,0,1.5,0,0,0)')['arrived'])
        for e in ['NaN,0,1,1,0,0', 'null,0,1,1,0,0', '0,0,undefined,1,0,0']:
            self.assertEqual(run('r.idleForce(%s)' % e), {'fx': 0, 'fy': 0, 'dist': 0, 'arrived': True}, e)
        self.assertEqual(run('r.idleForce()')['arrived'], True)

    def test_acc_over_rolling_resistance(self):
        self.assertGreater(run('r.IDLE_ACC'), 1.0)

    def test_simulation(self):
        js = """
const dt=1/120;let x=0,y=0,vx=0,vy=0,dist=0,maxv=0,arrived=false;const T={x:200,y:0};
for(let i=0;i<60*120;i++){const f=r.idleForce(x,y,T.x,T.y,vx,vy);if(f.arrived)arrived=true;
 vx+=f.fx*dt;vy+=f.fy*dt;const sp=Math.hypot(vx,vy);
 const ns=Math.max(0,sp-(1.0+0.35*sp+0.2*sp*sp)*dt);if(sp>0){vx*=ns/sp;vy*=ns/sp;}
 x+=vx*dt;y+=vy*dt;dist+=Math.hypot(vx,vy)*dt;maxv=Math.max(maxv,Math.hypot(vx,vy));}
let a2=false,x2=0,vx2=0;for(let i=0;i<60*120;i++){const f=r.idleForce(x2,0,40,0,vx2,0);if(f.arrived){a2=true;break;}vx2+=f.fx*dt;const ns=Math.max(0,vx2-(1.0+0.35*vx2+0.2*vx2*vx2)*dt);vx2=ns;x2+=vx2*dt;}
({maxv,dist,a2})"""
        code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify((()=>{%s; return {maxv,dist,a2}})()))" % (json.dumps(str(GO / 'rollsync.js')), js.replace('({maxv,dist,a2})', ''))
        o = json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)
        self.assertLessEqual(o['maxv'], 1.4 + 0.6)
        self.assertGreaterEqual(o['dist'], 30)
        self.assertTrue(o['a2'])


class Static(unittest.TestCase):
    def test_public(self):
        for k in ['IDLE_START', 'IDLE_SPEED', 'IDLE_ACC', 'idleDue', 'idleTarget', 'idleForce']:
            self.assertRegex(RS_SRC, r'root\.nishioRollSync = \{[^}]*\b%s\b' % k)

    def test_pixel_wiring(self):
        self.assertIn("const idleRoll = { last: performance.now(), on: false, key: '', skip: [], fails: [], guideKey: '' }", PIXEL)
        self.assertIn("document.addEventListener('pointerdown', idleTouch, true)", PIXEL)
        i = PIXEL.index('function tapWalk(gx, gy) {')
        self.assertIn('idleTouch();', PIXEL[i:i + 120])
        self.assertIn('if (Math.hypot(ax, ay) > 0.08) idleTouch();', PIXEL)
        j = PIXEL.index('function idleRollForce(')
        body = PIXEL[j:PIXEL.index('function rollStep(', j)]
        for w in ['mazeOn()', 'worldMode', 'driving', 'tapS.path.length', 'mapCovered(false, true)', 'idleDue(', 'idleTarget(', 'idleForce(', 'toTile(gd.lat, gd.lng)', "'g:'", "'s:'", 'idleRoll.key', 'hop < 8', 'idleRoll.anchor', 'idleRoll.skip']:
            self.assertIn(w, body, w)
        self.assertLess(body.index("'g:'"), body.index("'s:'"))   # 目的地が 先
        self.assertIn('idleRollForce(dt)', PIXEL)
        self.assertIn('idleRoll: () => ({ on: idleRoll.on, key: idleRoll.key, sec:', PIXEL)

    def test_reference_game_recorded(self):
        self.assertIn('風ノ旅ビト', MY_SRC)   # 参考ゲーム42番（新規）：操作を休めても 景色の中を 漂う 移動が 体験の中心

    def test_no_forbidden_words(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        j = PIXEL.index('function idleRollForce(')
        for w in words:
            self.assertNotIn(w, MY_SRC)
            self.assertNotIn(w, RS_SRC)
            self.assertNotIn(w, PIXEL[j:j + 2000])


if __name__ == '__main__':
    unittest.main()
