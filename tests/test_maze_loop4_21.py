# 第4弾サイクル21：M4 地面の感じ（地区で転がり方が変わる）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
RS_SRC = (GO / 'rollsync.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
MY_SRC = Path(__file__).read_text(encoding='utf-8')
SPEC = {'isshiki': (0.82, 0.85), 'kira': (0.95, 0.97), 'hazu': (1.12, 1.08), 'nishio': (1.18, 1.10), 'sakushima': (1.28, 1.15)}
ORDER = ['isshiki', 'kira', 'hazu', 'nishio', 'sakushima']


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rollsync.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Feel(unittest.TestCase):
    def test_table_matches_spec_and_distinct(self):
        seen = set()
        for k, (c, l) in SPEC.items():
            f = run('r.groundFeel(%s)' % json.dumps(k))
            self.assertEqual(f, {'crr': c, 'lin': l})
            seen.add((f['crr'], f['lin']))
        self.assertEqual(len(seen), 5)

    def test_order_and_range(self):
        fs = [run('r.groundFeel(%s)' % json.dumps(k)) for k in ORDER]
        crrs = [f['crr'] for f in fs]
        self.assertEqual(crrs, sorted(crrs))
        for f in fs:
            for v in f.values():
                self.assertGreaterEqual(v, 0.8)
                self.assertLessEqual(v, 1.3)

    def test_unknown_inputs(self):
        for e in ['""', '"nowhere"', 'null', 'undefined', '5', 'NaN', '{}', '[]', '"__proto__"', '"toString"', '"constructor"']:
            self.assertEqual(run('r.groundFeel(%s)' % e), {'crr': 1, 'lin': 1}, e)
        self.assertEqual(run('r.groundFeel()'), {'crr': 1, 'lin': 1})

    def test_fresh_object(self):
        self.assertEqual(run('(()=>{const a=r.groundFeel("kira");a.crr=99;return r.groundFeel("kira")})()'), {'crr': 0.95, 'lin': 0.97})
        self.assertEqual(run('(()=>{const a=r.groundFeel("zzz");a.crr=99;return r.groundFeel("zzz")})()'), {'crr': 1, 'lin': 1})
        self.assertEqual(run('r.AREA_FEEL.kira'), {'crr': 0.95, 'lin': 0.97})

    def test_stop_distance(self):
        js = ('(()=>{const o={};for(const k of %s){const f=r.groundFeel(k);let v=6,d=0;'
              'for(let i=0;i<120*120&&v>0;i++){const dt=1/120;d+=v*dt;v=Math.max(0,v-(0.9*f.crr+0.35*f.lin*v+0.2*v*v)*dt)}'
              'o[k]=[d,v]}return o})()') % json.dumps(ORDER)
        o = run(js)
        ds = [o[k][0] for k in ORDER]
        for a, b in zip(ds, ds[1:]):
            self.assertGreater(a, b)
        for k in ORDER:
            self.assertEqual(o[k][1], 0)   # どの地区でも 止まれる
        self.assertGreaterEqual(ds[0] / ds[-1], 1.15)


class Static(unittest.TestCase):
    def test_rollstep_uses_feel(self):
        i = PIXEL.index('function rollStep(')
        body = PIXEL[i:i + 6000]
        self.assertIn('groundFeel(rollAreaAt(rp.x, rp.y))', body)
        self.assertIn('* feel.crr', body)
        self.assertIn('* feel.lin', body)
        self.assertIn('ROLL_AIR', body)

    def test_area_cache(self):
        i = PIXEL.index('function rollAreaAt(')
        body = PIXEL[i:i + 900]
        self.assertIn('rollArea.key', body)
        self.assertIn("G['areaZone']", body)
        self.assertIn('catch', body)
        self.assertIn('now - rollArea.at < 2000', body)   # 分からなかった地区は2秒後に調べなおす（Codex指摘の回帰）

    def test_area_feel_frozen(self):
        self.assertEqual(run('(()=>{r.AREA_FEEL.kira.crr=99;return r.groundFeel("kira")})()'), {'crr': 0.95, 'lin': 0.97})
        self.assertEqual(run('r.AREA_FEEL.kira'), {'crr': 0.95, 'lin': 0.97})

    def test_test_hook(self):
        i = PIXEL.index('rollGet = Object')
        body = PIXEL[i:i + 700]
        self.assertIn('area: ra', body)
        self.assertIn('feel:', body)
        self.assertIn('hv: roll.hv', PIXEL)   # 既存の roll ゲッタは そのまま

    def test_step_bounce_remains(self):
        self.assertIn('bend > 0.07', PIXEL)

    def test_no_forbidden_words(self):
        words = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        for w in words:
            self.assertNotIn(w, MY_SRC)
            self.assertNotIn(w, RS_SRC)


if __name__ == '__main__':
    unittest.main()
