import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


@unittest.skipUnless(shutil.which('node'), 'node がない')
class ExploreRingTests(unittest.TestCase):
    """第4弾サイクル5：きろく画面の大きなめぐりリング（exploreRing）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'game.js').read_text()

    def ring(self, lists):
        a = re.search(r"^const AREA_RGB = .*$", self.src, re.M)
        f = re.search(r"^function exploreRing\(.*?\n^\}", self.src, re.M | re.S)
        self.assertTrue(a and f)
        code = a.group(0) + "\n" + f.group(0) + "\nconsole.log(JSON.stringify(%s.map(exploreRing)));" % json.dumps(lists)
        r = subprocess.run(['node', '-e', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_empty(self):
        for got in self.ring([[], [{'id': 'nishio', 'done': 0, 'total': 0}], None]):
            self.assertEqual(got, {'done': 0, 'total': 0, 'pct': 0, 'gradient': ''})

    def test_half_and_full(self):
        half, full = self.ring([[{'id': 'nishio', 'done': 5, 'total': 10}, {'id': 'kira', 'done': 5, 'total': 10}],
                                [{'id': 'nishio', 'done': 4, 'total': 4}, {'id': 'zzz', 'done': 2, 'total': 2}]])
        self.assertEqual((half['done'], half['total'], half['pct']), (10, 20, 50))
        self.assertIn('rgb(122,168,84) 0% 25%', half['gradient'])
        self.assertIn('rgba(122,168,84,.18) 25% 50%', half['gradient'])
        self.assertEqual(full['pct'], 100)
        self.assertIn('rgb(227,164,43)', full['gradient'])
        self.assertNotIn('.18', full['gradient'])

    def test_clamp_and_exclusion(self):
        got, = self.ring([[{'id': 'nishio', 'done': 9, 'total': 3}, {'id': 'kira', 'done': -2, 'total': 'x'},
                           {'id': 'hazu', 'done': 1, 'total': 0}, {'id': 'isshiki', 'done': 'a', 'total': 3}]])
        self.assertEqual((got['done'], got['total'], got['pct']), (3, 6, 50))
        self.assertNotIn('146,118,176', got['gradient'])
        self.assertNotIn('196,124,88', got['gradient'])


class ExploreRingWiringTests(unittest.TestCase):
    def test_wired(self):
        html = (ROOT / 'nishio-go.html').read_text()
        js = (GO / 'game.js').read_text()
        css = (GO / 'style.css').read_text()
        for i in ('exploreRing', 'explorePct'):
            self.assertIn('id="%s"' % i, html)
            self.assertIn("$('%s')" % i, js)
        self.assertRegex(js, r"areaProgress, exploreRing,")
        self.assertIn('.explore-ring{', css)
        self.assertIn('.explore-ring[hidden]{display:none}', css)

    def test_diff_has_no_banned_words(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
