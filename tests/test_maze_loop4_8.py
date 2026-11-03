import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


@unittest.skipUnless(shutil.which('node'), 'node がない')
class BlockTowerTests(unittest.TestCase):
    """第4弾サイクル8：きろく画面の大きなブロックタワー（blockTower）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'game.js').read_text()

    def tower(self, lists):
        a = re.search(r"^const AREA_RGB = .*$", self.src, re.M)
        f = re.search(r"^function blockTower\(.*?\n^\}", self.src, re.M | re.S)
        self.assertTrue(a and f)
        code = a.group(0) + "\n" + f.group(0) + "\nconsole.log(JSON.stringify(%s.map(blockTower)));" % json.dumps(lists)
        r = subprocess.run(['node', '-e', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_empty(self):
        for got in self.tower([[], [{'id': 'nishio', 'done': 0, 'total': 0}], None]):
            self.assertEqual(got, {'cols': [], 'max': 10, 'done': 0, 'total': 0})

    def test_blocks(self):
        half, full, clamp, low, unknown = self.tower([
            [{'id': 'nishio', 'done': 5, 'total': 10}],
            [{'id': 'nishio', 'done': 4, 'total': 4}, {'id': 'kira', 'done': 0, 'total': 3}],
            [{'id': 'nishio', 'done': 9, 'total': 3}],
            [{'id': 'hazu', 'done': 1, 'total': 100}],
            [{'id': 'zzz', 'done': 1, 'total': 2}]])
        self.assertEqual(half['cols'][0]['blocks'], 5)
        self.assertEqual([c['blocks'] for c in full['cols']], [10, 0])
        self.assertEqual((clamp['cols'][0]['done'], clamp['cols'][0]['blocks']), (3, 10))
        self.assertEqual(low['cols'][0]['blocks'], 1)
        self.assertEqual(unknown['cols'][0]['rgb'], [227, 164, 43])

    def test_not_full_is_not_max(self):
        # Codex指摘（サイクル8）: 95%など満了直前でも10段にせず、完了と見分けられること
        got, = self.tower([[{'id': 'nishio', 'done': 19, 'total': 20}]])
        self.assertEqual(got['cols'][0]['blocks'], 9)

    def test_exclusion(self):
        got, = self.tower([[{'id': 'hazu', 'done': 1, 'total': 0}, {'id': 'kira', 'done': 'a', 'total': 4}]])
        self.assertEqual([c['id'] for c in got['cols']], ['kira'])
        self.assertEqual((got['done'], got['total'], got['cols'][0]['blocks']), (0, 4, 0))


class BlockTowerWiringTests(unittest.TestCase):
    def test_wired(self):
        html = (ROOT / 'nishio-go.html').read_text()
        js = (GO / 'game.js').read_text()
        css = (GO / 'style.css').read_text()
        self.assertIn('id="blockTower"', html)
        self.assertIn("$('blockTower')", js)
        self.assertIn('renderBlockTower()', js)
        self.assertIn('blockTower(', js)
        self.assertRegex(js, r"areaProgress, exploreRing, blockTower,")
        for c in ('.block-tower{', '.block-tower[hidden]{display:none}', '.bt-col{', '.bt-cell{'):
            self.assertIn(c, css)

    def test_diff_has_no_banned_words(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(w, added)
