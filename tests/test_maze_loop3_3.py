# 第3弾サイクル3：地図の見た目の刷新（P2 地区の色味・P6 距離順チップ・P5 通った近道の強調）
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


GAME = read('nishio-go/game.js')
PIXEL = read('nishio-go/pixel.js')
CSS = read('nishio-go/style.css')

NODE_CHIPS = r"""
const src = require('fs').readFileSync(process.argv[1], 'utf8');
const m = /function guideChips[\s\S]*?\n}\n/.exec(src);
const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111000;
const bearing = () => '北';
eval(m[0] + ';globalThis.guideChips = guideChips;');
const me = { lat: 34.8, lng: 137.0 };
const at = (n, d) => ({ name: n, id: n, lat: 34.8 + d / 111000, lng: 137.0 });
const r = guideChips(me, at('main', 500), [at('far', 900), at('near', 100)], o => o.name === 'near' ? 'kira' : '');
console.log(JSON.stringify({ order: r.map(c => c.name), main: r.map(c => c.main), alt: r.map(c => c.alt), zone: r.map(c => c.zone),
  none: guideChips(null, at('a', 1), []).length, noloc: guideChips(me, at('a', 1), [{ name: 'x' }]).length }));
"""


class MapLookTest(unittest.TestCase):
    def test_node_check(self):
        for f in ('game.js', 'pixel.js'):
            r = subprocess.run(['node', '--check', os.path.join(ROOT, 'nishio-go', f)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_area_colors_cover_five_areas(self):
        m = re.search(r'const AREA_RGB = \{([^}]*)\}', GAME)
        self.assertTrue(m)
        for a in ('nishio', 'isshiki', 'kira', 'hazu', 'sakushima'):
            self.assertIn(a + ':', m.group(1))
        self.assertEqual(len(set(re.findall(r'\[[^\]]*\]', m.group(1)))), 5)

    def test_map_tint_uses_area_color_and_progress(self):
        self.assertIn('mzZoneTint', PIXEL)
        self.assertIn('G.areaTint(a.zone, G.areaProgress(a.zone))', PIXEL)
        self.assertIn('rgba(${zt.rgb},${Math.min(0.42, f.tint * zt.k).toFixed(2)})', PIXEL)

    def test_area_name_shown_with_color(self):
        self.assertIn('<i class="zn">${esc(ar.name)}</i>', GAME)
        self.assertIn('--zc', CSS)

    def test_chips_sorted_by_distance(self):
        r = subprocess.run(['node', '-e', NODE_CHIPS, os.path.join(ROOT, 'nishio-go/game.js')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        import json
        d = json.loads(r.stdout)
        self.assertEqual(d['order'], ['near', 'main', 'far'])
        self.assertEqual(d['main'], [False, True, False])
        self.assertEqual(d['alt'], [1, -1, 0])   # alts の何番目か（タップで pickAlt）
        self.assertEqual(d['zone'][0], 'kira')
        self.assertEqual(d['none'], 0)
        self.assertEqual(d['noloc'], 1)   # 位置のない候補は出さない

    def test_chip_tap_reuses_pick_alt_and_hides_when_single(self):
        self.assertIn('data-alt="${c.alt}"', GAME)
        self.assertIn('chips.length > 1', GAME)
        self.assertIn('aria-current="true"', GAME)
        self.assertIn('overflow-x:auto', CSS)

    def test_guide_logic_unchanged(self):
        self.assertIn('const alts = (mazeVert ? rest.sort(goalSort) : rest).slice(0, 2)', GAME)

    def test_shortcut_highlight_only_when_walked(self):
        self.assertIn('mzGateUsed.add(key)', PIXEL)
        self.assertRegex(PIXEL, r'if \(mzGate\.has\(key\)\) mzGateUsed\.add\(key\)')
        self.assertIn('const used = ' if False else 'used = mzGateUsed.has(k)', PIXEL)
        self.assertIn('drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now)', PIXEL)
        self.assertNotIn('localStorage.setItem(\'nsg_gate', PIXEL)   # 新しいセーブ形式は作らない

    def test_no_forbidden_words_in_diff(self):
        r = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True)
        added = '\n'.join(l for l in r.stdout.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
