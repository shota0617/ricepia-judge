# 第4弾サイクル30：風景のつながり（模様を 4×4マスの区画で つなげて描く）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioLandscape;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'landscape.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def body():
    i = PIXEL.index('function drawLandscape(')
    return PIXEL[i:PIXEL.index('function drawTile(', i)]


class SpanOf(unittest.TestCase):
    def test_origin_and_boundaries(self):
        self.assertEqual(run('r.spanOf(0,0)'), {'sx': 0, 'sy': 0, 'lx': 0, 'ly': 0})
        self.assertEqual(run('r.spanOf(3,3)'), {'sx': 0, 'sy': 0, 'lx': 3, 'ly': 3})
        self.assertEqual(run('r.spanOf(4,0)'), {'sx': 4, 'sy': 0, 'lx': 0, 'ly': 0})
        self.assertEqual(run('r.SPAN'), 4)

    def test_negative(self):
        s = run('r.spanOf(-1,0)')
        self.assertEqual((s['sx'], s['lx']), (-4, 3))
        self.assertEqual(run('r.spanOf(-4,-5)'), {'sx': -4, 'sy': -8, 'lx': 0, 'ly': 3})

    def test_invariant(self):
        self.assertTrue(run('(()=>{for(let x=-60;x<60;x++)for(let y=-60;y<60;y++){const s=r.spanOf(x,y);'
                            'if(s.sx+s.lx!==x||s.sy+s.ly!==y||s.lx<0||s.lx>3||s.ly<0||s.ly>3||s.sx%4!==0||s.sy%4!==0)return false}return true})()'))

    def test_invalid_null(self):
        for e in ['NaN', 'Infinity', '"a"', 'null', 'undefined', '{}']:
            self.assertIsNone(run('r.spanOf(%s,0)' % e), e)
            self.assertIsNone(run('r.spanOf(0,%s)' % e), e)
        self.assertIsNone(run('r.spanOf()'))


class ShadeFor(unittest.TestCase):
    def test_uniform_in_span(self):
        self.assertTrue(run('(()=>{for(let sx=-12;sx<=12;sx+=4)for(let sy=-12;sy<=12;sy+=4){const v=r.shadeFor(sx,sy);'
                            'for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(r.shadeFor(sx+i,sy+j)!==v)return false}return true})()'))

    def test_range_deterministic_varied(self):
        self.assertTrue(run('(()=>{const s=new Set();for(let x=-40;x<40;x++)for(let y=-40;y<40;y++){const v=r.shadeFor(x,y);'
                            's.add(v);if(v<0.24||v>0.33+1e-9||v!==r.shadeFor(x,y))return false}return s.size>1})()'))

    def test_invalid(self):
        for e in ['NaN,0', 'Infinity,0', '"a",1', 'null,null', '']:
            self.assertEqual(run('r.shadeFor(%s)' % e), 0.24, e)

    def test_extreme_finite_stays_in_range(self):
        # 大きすぎる有限座標では phase の積があふれて NaN になりうるが、濃さは必ず範囲内に収まること（Codex指摘の回帰）
        self.assertEqual(run('r.shadeFor(1e308,1e308)'), 0.24)
        self.assertTrue(run('(()=>{const v=r.shadeFor(-1e308,1e308);return isFinite(v)&&v>=0.24&&v<=0.33+1e-9})()'))


class Connection(unittest.TestCase):
    def test_neighbors_share_origin(self):
        self.assertTrue(run('(()=>{for(let x=-20;x<20;x++)for(let y=-20;y<20;y++){const a=r.spanOf(x,y),b=r.spanOf(x+1,y);'
                            'if(b.lx>0){if(a.sx!==b.sx)return false}else if(b.sx-a.sx!==4)return false}return true})()'))

    def test_island_radii_exceed_tile(self):
        b = body()
        self.assertIn('T * 0.9', b)
        self.assertIn('T * 1.7', b)
        self.assertIn('S / 2, S / 2', b)

    def test_translate_to_span_origin(self):
        self.assertIn('ctx.translate(X - sp.lx * T, Y - sp.ly * T)', body())

    def test_tea_slope_and_shore_periodic(self):
        # 茶畑の縞は傾けてマスごとに切片が変わること、浜の帯は区画の端でも同じ高さでつづく並び（±0.78含む）であること（Codex指摘の回帰）
        b = body()
        tea = b[b.index("kind === 'tea'"):b.index("kind === 'wave'")]
        self.assertIn('S * 0.125', tea)
        self.assertIn('lineTo(S, y0 - d)', tea)
        shore = b[b.index("kind === 'shore'"):b.index("kind === 'hill'")]
        self.assertIn('-0.78', shore)
        self.assertIn('0.78', shore)


class PixelStatic(unittest.TestCase):
    def test_uses_span_and_shade_with_fallback(self):
        b = body()
        self.assertIn('L.spanOf(', b)
        self.assertIn('L.shadeFor(', b)
        self.assertRegex(b, r"typeof L\.spanOf !== 'function' \|\| typeof L\.shadeFor !== 'function'")
        self.assertIn('drawLandscapeTile(', b)

    def test_no_phase_alpha_in_new_path(self):
        b = body()
        new = b[b.index('function drawLandscape('):]
        self.assertNotIn('phase(', new)
        self.assertIn('ctx.clip()', new)
        self.assertEqual(new.count('ctx.save()'), new.count('ctx.restore()'))

    def test_draw_order_kept(self):
        self.assertIn('if (LAND_CODES.has(code)) drawLandscape(', PIXEL)


class NoBannedWords(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"],
                              cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in (chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + "20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
