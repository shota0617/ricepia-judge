# 第4弾サイクル17：歩く地図に実在の店の名前札、自店の金の輪、きろくの店導線
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
CSS = (GO / 'style.css').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def node(expr):
    code = "globalThis.window=globalThis;require(%s);const M=globalThis.nishioShopMap;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'shopmap.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def P(x, y, kind, name):
    return [x, y, kind, name, 'lm']


class PickLabels(unittest.TestCase):
    def pick(self, pois, opts):
        return node('M.pickLabels(%s,%s)' % (json.dumps(pois), json.dumps(opts)))

    def test_goal_first(self):
        pois = [P(1, 0, 'store', 'A'), P(2, 0, 'food', 'B'), P(9, 9, 'cafe', 'G')]
        r = self.pick(pois, {'me': {'x': 0, 'y': 0}, 'goalName': 'G'})
        self.assertEqual([p[3] for p in r], ['G', 'A', 'B'])

    def test_goal_nearest_when_dup(self):
        pois = [P(9, 9, 'cafe', 'G'), P(3, 0, 'cafe', 'G')]
        r = self.pick(pois, {'me': {'x': 0, 'y': 0}, 'goalName': 'G'})
        self.assertEqual(r, [P(3, 0, 'cafe', 'G')])

    def test_nearest_order_and_dedupe_and_limit(self):
        pois = [P(5, 0, 'store', 'C'), P(1, 0, 'store', 'A'), P(2, 0, 'store', 'A'), P(3, 0, 'food', 'B'), P(4, 0, 'food', 'D')]
        r = self.pick(pois, {'me': {'x': 0, 'y': 0}})
        self.assertEqual([p[3] for p in r], ['A', 'B', 'D'])
        self.assertEqual(r[0][0], 1)
        self.assertEqual(len(self.pick(pois, {'me': {'x': 0, 'y': 0}, 'limit': 2})), 2)
        self.assertEqual(len(self.pick(pois, {'limit': -1})), 3)
        self.assertEqual(len(self.pick(pois, {'limit': 9})), 3)
        self.assertEqual([p[3] for p in self.pick(pois, {})], ['C', 'A', 'B'])

    def test_exclusions(self):
        pois = [P(0, 0, 'shrine', 'X'), P(0, 0, 'store', ''), P(0, 0, 'store', 5), P('a', 0, 'store', 'Y'), P(0, None, 'store', 'Z'), P(1, 1, 'post', 'OK')]
        r = self.pick(pois, {'me': {'x': 0, 'y': 0}})
        self.assertEqual([p[3] for p in r], ['OK'])

    def test_bad_input(self):
        for bad in ('null', '"x"', '{}', '5', '[null,1,"a"]'):
            self.assertEqual(node('M.pickLabels(%s,null)' % bad), [])
        self.assertEqual(node('M.pickLabels([],undefined)'), [])
        self.assertEqual(len(node('M.KINDS')), 11)


class Wiring(unittest.TestCase):
    def test_pixel(self):
        self.assertIn('pickLabels(pois', PIXEL)
        self.assertIn('function poiTag(cx, bottom, dpr, name)', PIXEL)
        self.assertIn('slice(0, 14)', PIXEL)
        self.assertRegex(PIXEL, r'if \(SM && !mazeOn\(\)\)')
        self.assertIn('size * 0.62', PIXEL)
        self.assertIn('rgba(255,213,79', PIXEL)
        self.assertIn('Math.sin(now / 400)', PIXEL)

    def test_html_css(self):
        self.assertIn('"shopmap"', HTML)
        self.assertIn('class="shop-links"', HTML)
        self.assertIn('https://ricepia.jp/go/lin.ee/uPhkiiv?from=game-log', HTML)
        self.assertIn('https://ricepia.jp/kakaku.pdf', HTML)
        self.assertIn('data-share-open="log"', HTML)
        self.assertIn('.shop-links', CSS)

    def test_no_forbidden_in_diff(self):
        out = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True).stdout
        added = '\n'.join(l for l in out.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('\u307c\u304f', '\u3060\u306b', '\u7d0420%', '\u7d04 20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
