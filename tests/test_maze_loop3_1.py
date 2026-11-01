import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'


@unittest.skipUnless(shutil.which('node'), 'node がない')
class AreaTintTests(unittest.TestCase):
    """第3弾サイクル1：コンプ率（areaProgress の done/total）→ 地区の色の濃さの段階"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'game.js').read_text()

    def tint(self, cases):
        m = re.search(r"^const TINT_AREAS = .*?\n^function areaTint\(.*?\n^\}", self.src, re.M | re.S)
        self.assertTrue(m)
        code = m.group(0) + "\nconsole.log(JSON.stringify(%s.map(c => areaTint(c[0], c[1]))));" % json.dumps(cases)
        r = subprocess.run(['node', '-e', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_stages(self):
        P = lambda d, t: {'done': d, 'total': t}
        got = self.tint([['nishio', P(0, 10)], ['nishio', P(3, 10)], ['nishio', P(5, 10)], ['nishio', P(6, 10)],
                         ['kira', P(10, 10)], ['sakushima', P(0, 0)], ['okazaki', P(5, 5)], ['hazu', None]])
        self.assertEqual(got, [0, 1, 1, 2, 3, 0, 0, 0])

    def test_wired_to_row_and_same_progress(self):
        self.assertIn('data-tint="${areaTint(a.id, p)}"', self.src)
        self.assertIn("const p = areaProgress(a.id), pct", self.src)
        css = (GO / 'style.css').read_text()
        for n in '123':
            self.assertIn('.area-row[data-tint="%s"]' % n, css)


if __name__ == '__main__':
    unittest.main()
