# 第4弾サイクル31：店名札の読みやすさ（距離制限・重なり解消・短い名前）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def node(expr):
    code = "globalThis.window=globalThis;require(%s);const M=globalThis.nishioShopMap;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'shopmap.js')), expr)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


def P(x, y, kind, name):
    return [x, y, kind, name, 'lm']


def short(name):
    return node('M.shortName(%s)' % json.dumps(name))


def pick(pois, opts):
    return node('M.pickLabels(%s,%s)' % (json.dumps(pois), json.dumps(opts)))


def levels(picked):
    return node('M.layoutLevels(%s)' % json.dumps(picked))


class ShortName(unittest.TestCase):
    def test_examples(self):
        self.assertEqual(short('安城赤松簡易郵便局（一時閉鎖中）'), '安城赤松簡易郵便局')
        self.assertEqual(short('スターバックスコーヒー 安城百石店'), 'スターバックスコーヒー')
        self.assertEqual(short('マクドナルド'), 'マクドナルド')
        self.assertEqual(short('A(b)C'), 'AC')

    def test_corp(self):
        r = short('(株)西日本宇佐美東海支店美合国道SS')
        self.assertTrue(0 < len(r) <= 12 and '株' not in r)
        self.assertEqual(short('株式会社ヤマダ'), 'ヤマダ')
        self.assertEqual(short('（有）ヤマダ'), 'ヤマダ')

    def test_limit_and_space(self):
        self.assertEqual(short('あいうえおかきくけこさしすせそ'), 'あいうえおかきくけこさし')
        self.assertEqual(short('あ い  う'), 'あ い う')
        self.assertEqual(short('ab  　cd'), 'ab cd')

    def test_fallback_and_invalid(self):
        self.assertEqual(short(None), '')
        self.assertEqual(short(5), '')
        self.assertEqual(short('（休業）'), '（休業）')


class Pick(unittest.TestCase):
    def test_whitespace_name_rejected(self):
        # Codex指摘: 空白だけの名前は shortName が '' になり札枠を消費するため候補から外す
        r = pick([P(1, 0, 'store', '   '), P(2, 0, 'store', 'A')], {'me': {'x': 0, 'y': 0}})
        self.assertEqual([p[3] for p in r], ['A'])

    def test_distance(self):
        me = {'x': 0, 'y': 0}
        self.assertEqual(len(pick([P(40, 0, 'store', 'A')], {'me': me})), 1)
        self.assertEqual(pick([P(41, 0, 'store', 'A')], {'me': me}), [])
        self.assertEqual(pick([P(41, 0, 'store', 'G')], {'me': me, 'goalName': 'G'}), [])
        self.assertEqual(len(pick([P(500, 0, 'store', 'A')], {})), 1)
        self.assertEqual(node('M.MAX_TILES'), 40)

    def test_branches_merge(self):
        pois = [P(1, 0, 'konbini', 'セブン-イレブン 安城百石店'), P(2, 0, 'konbini', 'セブン-イレブン 西尾寺津店'), P(3, 0, 'food', 'B')]
        r = pick(pois, {'me': {'x': 0, 'y': 0}})
        self.assertEqual([p[3] for p in r], ['セブン-イレブン 安城百石店', 'B'])

    def test_order_and_limit(self):
        pois = [P(i + 1, 0, 'store', 'N%d' % i) for i in range(6)]
        r = pick(pois, {'me': {'x': 0, 'y': 0}, 'limit': 9})
        self.assertEqual([p[3] for p in r], ['N0', 'N1', 'N2'])


class Layout(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(levels([P(0, 0, 'store', 'a'), P(10, 0, 'store', 'b'), P(0, 5, 'store', 'c')]), [0, 0, 0])
        dense = [P(0, 0, 'store', 'a'), P(1, 0, 'store', 'b'), P(2, 1, 'store', 'c')]
        self.assertEqual(levels(dense), [0, 1, 2])
        self.assertEqual(levels(dense), levels(dense))
        self.assertEqual(levels([P(0, 0, 'store', 'a'), P(1, 0, 'store', 'b'), P(2, 0, 'store', 'c'), P(1, 1, 'store', 'd')])[3], 2)

    def test_invalid(self):
        self.assertEqual(levels(None), [])
        self.assertEqual(node('M.layoutLevels("x")'), [])
        self.assertEqual(node('M.layoutLevels([null,[1],["a","b"]])'), [0, 0, 0])


class Wiring(unittest.TestCase):
    def test_pixel(self):
        self.assertIn('SM.layoutLevels', PIXEL)
        self.assertIn('SM.shortName', PIXEL)
        self.assertIn('labelBoxes.push(box)', PIXEL)
        self.assertIn('function poiTag(cx, bottom, dpr, name)', PIXEL)
        self.assertIn('slice(0, 14)', PIXEL)
        self.assertIn('tagged = new Map()', PIXEL)

    def test_no_forbidden(self):
        banned = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + '20%']
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'tests'], cwd=ROOT, capture_output=True, text=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for b in banned:
            self.assertNotIn(b, added)
