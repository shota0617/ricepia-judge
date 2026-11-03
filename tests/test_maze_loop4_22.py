# 第4弾サイクル22：西尾らしさ1 風景の描き分け（海・川・茶畑・田んぼ）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
LS_SRC = (GO / 'landscape.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
MY_SRC = Path(__file__).read_text(encoding='utf-8')
SPEC = {'nishio': ('tea', '46,96,44'), 'isshiki': ('wave', '38,110,170'), 'kira': ('shore', '214,164,84'),
        'hazu': ('hill', '104,84,150'), 'sakushima': ('island', '24,138,128')}


def run(expr):
    code = "require(%s);const r=globalThis.nishioLandscape;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'landscape.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Motifs(unittest.TestCase):
    def test_five_areas(self):
        for k, (kind, color) in SPEC.items():
            self.assertEqual(run('r.motifFor(%s)' % json.dumps(k)), {'kind': kind, 'color': color})
        self.assertEqual(len({v[0] for v in SPEC.values()}), 5)

    def test_unknown_is_null(self):
        for e in ['""', '"okazaki"', 'null', 'undefined', '5', 'NaN', '{}', '[]', '"__proto__"', '"toString"']:
            self.assertIsNone(run('r.motifFor(%s)' % e), e)
        self.assertIsNone(run('r.motifFor()'))

    def test_frozen_and_fresh(self):
        self.assertEqual(run('(()=>{r.MOTIFS.kira.kind="x";r.MOTIFS.zzz=1;return [r.motifFor("kira").kind,Object.isFrozen(r.MOTIFS),"zzz" in r.MOTIFS]})()'), ['shore', True, False])
        self.assertEqual(run('(()=>{const a=r.motifFor("kira");a.kind="x";return r.motifFor("kira").kind})()'), 'shore')

    def test_phase_deterministic(self):
        self.assertEqual(run('(()=>{const o=[];for(let x=-5;x<20;x++)for(let y=-5;y<20;y++)o.push(r.phase(x,y)===r.phase(x,y)&&r.phase(x,y)>=0&&r.phase(x,y)<=3);return o.every(Boolean)})()'), True)
        self.assertEqual(run('[r.phase(3,4),r.phase(3,4),r.phase(100,-7)]')[0], run('r.phase(3,4)'))
        self.assertEqual(run('new Set((()=>{const o=[];for(let x=0;x<8;x++)for(let y=0;y<8;y++)o.push(r.phase(x,y));return o})()).size'), 4)

    def test_phase_invalid_is_zero(self):
        for e in ['NaN,1', '1,NaN', 'Infinity,0', '"a",1', 'null,null', 'undefined,undefined', '{},[]']:
            self.assertEqual(run('r.phase(%s)' % e), 0, e)
        self.assertEqual(run('r.phase()'), 0)


class Static(unittest.TestCase):
    def test_html_script(self):
        self.assertIn('<script src="nishio-go/landscape.js"></script>', HTML)
        self.assertLess(HTML.index('rollsync.js'), HTML.index('landscape.js'))

    def test_pixel_link_and_cache(self):
        i = PIXEL.index('function drawLandscape(')
        body = PIXEL[i:i + 3500]
        self.assertIn('window.nishioLandscape', body)
        self.assertIn('motifFor(', body)
        self.assertIn('phase(', body)
        self.assertIn('clip()', body)
        j = PIXEL.index('function landAreaOf(')
        c = PIXEL[j:j + 700]
        self.assertIn("G['areaZone']", c)
        self.assertIn('toLatLng(tx + 0.5, ty + 0.5)', c)
        self.assertIn('landAreaCache.clear()', c)
        self.assertIn('new Map()', PIXEL[PIXEL.index('const landAreaCache'):][:80])

    def test_alpha_range(self):
        self.assertIn('a = 0.24 + ph * 0.03', PIXEL)   # 0.24〜0.33

    def test_only_ground_codes(self):
        self.assertIn('const LAND_CODES = new Set([C.G, C.F, C.P, C.W, C.K, C.V, C.E, C.U, C.Y, C.S])', PIXEL)
        for bad in ['C.H', 'C.R', 'C.A', 'C.X', 'C.B', 'C.T', 'C.L']:
            self.assertNotIn(bad, PIXEL[PIXEL.index('const LAND_CODES'):][:130], bad)
        self.assertIn('if (LAND_CODES.has(code)) drawLandscape(', PIXEL)

    def test_draw_order_kept(self):
        i = PIXEL.index('if (LAND_CODES.has(code)) drawLandscape(')
        self.assertLess(i, PIXEL.index('drawKabuse(tx, ty, X, Y, T);', i))
        self.assertLess(PIXEL.index('drawKabuse(tx, ty, X, Y, T);', i), PIXEL.index('else drawDeco(code, tx, ty, X, Y, T, now);', i))

    def test_reference_game_recorded(self):
        self.assertIn('あつまれ どうぶつの森', MY_SRC)   # 参考ゲーム41番（新規）：場所ごとに景色の模様が違い、説明なしで場所が分かる

    def test_no_forbidden_words(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        for w in words:
            self.assertNotIn(w, MY_SRC)
            self.assertNotIn(w, LS_SRC)
            i = PIXEL.index('function drawLandscape(')
            self.assertNotIn(w, PIXEL[i:i + 3500])


if __name__ == '__main__':
    unittest.main()
