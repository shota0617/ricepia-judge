# 第4弾サイクル34：風景の境目をなめらかに（地区の境で隣の模様が縁の帯に薄く入りこむ）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioLandscape;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'landscape.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def fn(name, end):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index(end, i)]


class BorderMotif(unittest.TestCase):
    def test_same_area_null(self):
        for a in ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']:
            self.assertIsNone(run('r.borderMotif("%s","%s")' % (a, a)))

    def test_different_areas_give_neighbor_motif(self):
        ids = ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']
        for a in ids:
            for b in ids:
                if a != b:
                    self.assertEqual(run('r.borderMotif("%s","%s")' % (a, b)), run('r.motifFor("%s")' % b))

    def test_invalid_null(self):
        for e in ['"zzz"', '""', '5', 'null', 'undefined', '{}', '[]']:
            self.assertIsNone(run('r.borderMotif("nishio",%s)' % e), e)
            self.assertIsNone(run('r.borderMotif(%s,"nishio")' % e), e)
        self.assertIsNone(run('r.borderMotif()'))
        self.assertIsNone(run('r.borderMotif("zzz","zzz")'))


class BorderAlpha(unittest.TestCase):
    def test_values(self):
        self.assertAlmostEqual(run('r.borderAlpha(0.24)'), 0.144)
        self.assertAlmostEqual(run('r.borderAlpha(0.33)'), 0.198)
        self.assertLessEqual(run('r.borderAlpha(0.33)'), 0.20)

    def test_monotonic_and_thinner_than_own(self):
        self.assertTrue(run('(()=>{let p=-1;for(let a=0.24;a<=0.33+1e-9;a+=0.03){const v=r.borderAlpha(a);if(v<p||v>=0.24)return false;p=v}return true})()'))
        self.assertTrue(run('(()=>{for(let x=-40;x<40;x++)for(let y=-40;y<40;y++){if(r.borderAlpha(r.shadeFor(x,y))>=r.shadeFor(x,y))return false}return true})()'))

    def test_clamped_and_invalid(self):
        self.assertEqual(run('r.borderAlpha(10)'), 0.2)
        self.assertEqual(run('r.borderAlpha(-1)'), 0)
        for e in ['NaN', 'Infinity', '"a"', 'null', 'undefined', '{}', '']:
            self.assertAlmostEqual(run('r.borderAlpha(%s)' % e), 0.144, msg=e)


class BorderGeometry(unittest.TestCase):
    def test_width(self):
        w = run('r.BORDER_W')
        self.assertGreater(w, 0)
        self.assertLessEqual(w, 0.5)

    def test_only_touching_tiles_have_neighbor_motif(self):
        # 左 tea(nishio) | 右 wave(isshiki)。境は x=9 と x=10 の間
        res = run('(()=>{const area=x=>x<10?"nishio":"isshiki";const out={};'
                  'for(let x=4;x<16;x++){out[x]=[r.borderMotif(area(x),area(x-1)),r.borderMotif(area(x),area(x+1))].map(m=>m&&m.kind)}return out})()')
        for x in range(4, 16):
            left, right = res[str(x)]
            if x == 9:
                self.assertEqual((left, right), (None, 'wave'))
            elif x == 10:
                self.assertEqual((left, right), ('tea', None))
            else:
                self.assertEqual((left, right), (None, None), x)

    def test_band_less_than_half_tile(self):
        self.assertLess(run('r.BORDER_W * 32'), 16)


class PixelStatic(unittest.TestCase):
    def test_span_function_split(self):
        self.assertIn('function drawLandscapeSpan(m, S, T, col)', PIXEL)
        self.assertIn('drawLandscapeSpan(m, S, T,', fn('drawLandscape', 'function drawLandscapeSpan('))
        sp = fn('drawLandscapeSpan', 'function drawTile(')
        for k in ('tea', 'wave', 'shore', 'hill', 'island'):
            self.assertIn("kind === '%s'" % k, sp)
        self.assertIn('Math.max(1, u * 0.7)', sp)

    def test_border_pass(self):
        b = fn('drawLandscape', 'function drawLandscapeSpan(')
        self.assertIn('[[-1, 0], [1, 0], [0, -1], [0, 1]]', b)
        self.assertIn('landAreaOf(nx, ny)', b)
        self.assertIn('L.borderMotif(area,', b)
        self.assertIn('L.BORDER_W', b)
        self.assertIn('L.borderAlpha(', b)
        self.assertIn('L.spanOf(nx, ny)', b)
        self.assertEqual(b.count('landAreaOf(tx, ty)'), 1)   # 自分の地区判定は 1回
        self.assertEqual(b.count('ctx.save()'), b.count('ctx.restore()'))
        self.assertIn('[-S, 0, S]', b)   # 区画の端と境が重なっても切れないよう前後の区画分も描く（Codex指摘）

    def test_try_finally_and_fallbacks(self):
        b = fn('drawLandscape', 'function drawLandscapeSpan(')
        self.assertIn('finally', b)
        self.assertIn('drawLandscapeTile(', b)
        self.assertIn("typeof L.borderMotif !== 'function'", b)
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
