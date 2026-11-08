# 第4弾サイクル37：コロコロの跡の帯（点がつながる・迷路でも見える）（参考ゲーム：Death Stranding）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollTrail;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rolltrail.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


TWO = '[{x:0,y:0,t:1000},{x:1.1,y:0,t:2000}]'


class Segments(unittest.TestCase):
    def test_steps_and_chain(self):
        v = run('r.segments(%s,3000)' % TWO)
        self.assertGreater(len(v), 1)
        for s in v:
            self.assertLessEqual(((s['x2'] - s['x1']) ** 2 + (s['y2'] - s['y1']) ** 2) ** 0.5, 0.28 + 1e-9)
        for a, c in zip(v, v[1:]):
            self.assertAlmostEqual(a['x2'], c['x1'])
            self.assertAlmostEqual(a['y2'], c['y1'])
        self.assertEqual((v[0]['x1'], v[0]['y1']), (0, 0))
        self.assertAlmostEqual(v[-1]['x2'], 1.1)
        self.assertEqual(v[-1]['y2'], 0)

    def test_alpha_range_and_fade(self):
        v = run('r.segments(%s,3000)' % TWO)
        self.assertTrue(all(0 <= s['a'] <= 0.38 for s in v))
        v = run('r.segments(%s,1000)' % TWO)   # 古い側ほど 薄い（同じ年齢のとき）
        self.assertLess(v[0]['a'], v[-1]['a'])
        v = run('r.segments([{x:0,y:0,t:1000},{x:1.1,y:0,t:1000}],1000)')
        for a, c in zip(v, v[1:]):
            self.assertLessEqual(a['a'], c['a'] + 1e-12)

    def test_old_empty(self):
        self.assertEqual(run('r.segments(%s,20000)' % TWO).count(None), 0)
        v = run('r.segments(%s,20000)' % TWO)
        self.assertTrue(all(s['a'] == 0 for s in v))

    def test_invalid(self):
        for e in ['[]', '[{x:0,y:0,t:0}]', '"abc"', 'null', '[null,{x:"a"}]', '[{x:NaN,y:0,t:0},{x:1,y:0,t:1}]']:
            self.assertEqual(run('r.segments(%s,5)' % e), [], e)
        self.assertEqual(run('r.segments(%s,NaN)' % TWO), [])
        self.assertEqual(run('r.segments(%s,"a")' % TWO), [])

    def test_total_length(self):
        v = run('(()=>{let l=[];for(let i=0;i<600;i++)l=r.push(l,i*0.11,0,i*16.7);const s=r.segments(l,600*16.7);return [s.reduce((a,b)=>a+Math.hypot(b.x2-b.x1,b.y2-b.y1),0),l[l.length-1].x-l[0].x]})()')
        self.assertLess(abs(v[0] - v[1]), 0.3)

    def test_constants_kept(self):
        self.assertEqual(run('[r.MAX,r.GAP,r.LIFE_MS,r.ALPHA]'), [24, 0.55, 12000, None])


class Wiring(unittest.TestCase):
    def test_band(self):
        m = re.search(r'function drawRollPath\(.*?\n\}\n', PIXEL, re.S)
        self.assertIn('RT.segments(', m.group(0))
        self.assertIn('ctx.lineWidth = T * 0.20', m.group(0))
        self.assertIn("lineCap = 'round'", m.group(0))

    def test_jump_guard(self):
        self.assertEqual(run('r.segments([{x:0,y:0,t:0},{x:10,y:0,t:1000}],1000)'), [])
        v = run('r.segments([{x:0,y:0,t:0},{x:1.1,y:0,t:500},{x:10,y:0,t:1000}],1000)')
        self.assertTrue(v)
        self.assertAlmostEqual(v[-1]['x2'], 1.1)
        self.assertTrue(all(s['g'] == 0 for s in v))

    def test_call_order(self):
        self.assertEqual(PIXEL.count('drawRollPath(ox, oy, T, now);'), 2)
        maze = PIXEL.index('if (mazeOn()) { drawMzFogTint(')
        call = PIXEL.index('drawRollPath(ox, oy, T, now);')
        self.assertLess(maze, call)
        self.assertLess(PIXEL.index('drawMaze(tx0, ty0, tx1, ty1, ox, oy, T);'), call)
        self.assertLess(call, PIXEL.index('drawMzGates('))
        self.assertLess(call, PIXEL.index('updateTraffic(dt, now, tx0, ty0, tx1, ty1);'))
        self.assertIn('if (!mazeOn()) drawRollPath(ox, oy, T, now);', PIXEL)

    def test_record_kept(self):
                # サイクル162（差6）で記録の形が変わった: 全体のゲートは RT && rolling、rollPath だけが !fpsMeter.slow の内側（bloom は slow でも記録する）
        self.assertRegex(PIXEL, r'RT && rolling\) \{ if \(!fpsMeter\.slow\) \{ rollPath\.list = RT\.push')
        self.assertIn('RT.alive(', PIXEL)

    def test_forbidden(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'tests'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for f in words:
            self.assertNotIn(f, added)


if __name__ == '__main__':
    unittest.main()
