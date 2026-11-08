# 第4弾サイクル36：コロコロの跡（転がった道が穏やかに残って消える）（参考ゲーム：風ノ旅ビト）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Pure(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(run('[r.MAX,r.GAP,r.LIFE_MS]'), [24, 0.55, 12000])

    def test_push_basic(self):
        self.assertEqual(len(run('r.push([],1,1,0)')), 1)
        self.assertEqual(len(run('r.push(r.push([],1,1,0),1.5,1,10)')), 1)
        self.assertEqual(len(run('r.push(r.push([],1,1,0),1.55,1,10)')), 2)
        self.assertEqual(len(run('r.push(r.push([],1,1,0),1.6,1,10)')), 2)

    def test_push_max(self):
        v = run('(()=>{let l=[];for(let i=0;i<40;i++)l=r.push(l,i,0,i);return l})()')
        self.assertEqual(len(v), 24)
        self.assertEqual(v[0]['x'], 16)
        self.assertEqual(v[-1]['x'], 39)

    def test_push_immutable(self):
        self.assertEqual(run('(()=>{const l=[{x:0,y:0,t:0}];const s=JSON.stringify(l);r.push(l,5,5,1);return JSON.stringify(l)===s&&l.length===1})()'), True)

    def test_push_invalid(self):
        for e in ['"a",1,1', 'NaN,1,1', '1,NaN,1', '1,1,NaN', '1,1,Infinity', 'null,null,null']:
            self.assertEqual(run('r.push([{x:0,y:0,t:0}],%s)' % e), [{'x': 0, 'y': 0, 't': 0}], e)
        self.assertEqual(run('r.push("zzz",1,1,0)'), [{'x': 1, 'y': 1, 't': 0}])
        self.assertEqual(run('r.push(null,"a",1,0)'), [])

    def test_alive(self):
        l = '[{x:0,y:0,t:0},{x:1,y:0,t:5000},{x:2,y:0,t:11000}]'
        self.assertEqual(len(run('r.alive(%s,11999)' % l)), 3)
        self.assertEqual(len(run('r.alive(%s,12001)' % l)), 2)   # t=0 は寿命を超えて落ちる
        self.assertEqual(len(run('r.alive(%s,12000)' % l)), 3)   # 境界：ちょうど LIFE_MS は残す（濃さは 0）
        self.assertEqual(len(run('r.alive(%s,30000)' % l)), 0)

    def test_alive_invalid(self):
        self.assertEqual(run('r.alive("x",5)'), [])
        self.assertEqual(run('r.alive(null,5)'), [])
        self.assertEqual(len(run('r.alive([{x:0,y:0,t:0}],NaN)')), 1)
        self.assertEqual(run('r.alive([{x:0,y:0,t:0}],"a")'), [{'x': 0, 'y': 0, 't': 0}])
        self.assertEqual(run('r.alive([null,{x:0,y:0,t:"a"}],5)'), [])

    def test_alpha(self):
        self.assertEqual(run('r.alphaFor(0)'), 0.38)
        self.assertEqual(run('r.alphaFor(-100)'), 0.38)
        self.assertEqual(run('r.alphaFor(12000)'), 0)
        self.assertEqual(run('r.alphaFor(99999)'), 0)
        self.assertAlmostEqual(run('r.alphaFor(6000)'), 0.19)
        v = run('Array.from({length:121},(_,i)=>r.alphaFor(i*100))')
        for a, c in zip(v, v[1:]):
            self.assertLessEqual(c, a)
        self.assertTrue(all(0 <= x <= 0.38 for x in v))
        for e in ['"a"', 'NaN', 'Infinity', 'null', 'undefined', '{}']:
            self.assertEqual(run('r.alphaFor(%s)' % e), 0, e)

    def test_straight_simulation(self):
        v = run('(()=>{let l=[];for(let i=0;i<600;i++)l=r.push(l,i*0.11,0,i*16.7);return l})()')
        self.assertEqual(len(v), 24)
        for a, c in zip(v, v[1:]):
            self.assertGreaterEqual(c['x'] - a['x'], 0.55 - 1e-9)
            self.assertLessEqual(c['x'] - a['x'], 0.55 + 0.11 + 1e-9)
        self.assertTrue(12.65 <= v[-1]['x'] - v[0]['x'] <= 14.5)


class Wiring(unittest.TestCase):
    def test_pixel_uses_module(self):
        self.assertIn('window.nishioRollTrail', PIXEL)
        for f in ('RT.push(', 'RT.alive(', 'RT.alphaFor('):
            self.assertIn(f, PIXEL)
        self.assertIn('const rollPath = { list: [] }', PIXEL)

    def test_draw_after_tiles(self):
        loop = PIXEL.index('drawTile(tx, ty, ox + tx * T')
        call = PIXEL.index('drawRollPath(ox, oy, T, now);')
        maze = PIXEL.index('if (mazeOn()) { drawMzFogTint(')
        traffic = PIXEL.index('updateTraffic(dt, now, tx0, ty0, tx1, ty1);')
        self.assertLess(loop, maze)
        self.assertLess(maze, call)
        self.assertLess(call, traffic)

    def test_slow_skips(self):
        m = re.search(r'function drawRollPath\(.*?\n\}\n', PIXEL, re.S)
        self.assertTrue(m)
        self.assertIn('fpsMeter.slow', m.group(0))
        self.assertIn('!RT', m.group(0))

    def test_record_only_rolling(self):
                # サイクル162（差6）で記録の形が変わった: 全体のゲートは RT && rolling、rollPath だけが !fpsMeter.slow の内側（bloom は slow でも記録する）
        self.assertRegex(PIXEL, r'RT && rolling\) \{ if \(!fpsMeter\.slow\) \{ rollPath\.list = RT\.push')

    def test_old_trail_kept(self):
        self.assertIn('roll.trail.push({ x: hp.x, y: hp.y, th: roll.ang })', PIXEL)

    def test_script_tag(self):
        self.assertIn('<script src="nishio-go/rolltrail.js"></script>', HTML)
        self.assertLess(HTML.index('rollsync.js'), HTML.index('rolltrail.js'))

    def test_forbidden(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'tests'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for f in words:
            self.assertNotIn(f, added)


if __name__ == '__main__':
    unittest.main()
