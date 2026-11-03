import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def run(body):
    js = "global.window = {}; require(%r); const D = window.nishioDayStamp; %s" % (str(GO / 'daystamp.js'), body)
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class DayStampTests(unittest.TestCase):
    """第4弾サイクル7：きろく画面の14日スタンプ（daystamp.js）"""

    def test_add_days(self):
        out = run("console.log(JSON.stringify([D.addDays('2026-01-31',1),D.addDays('2025-12-31',1),D.addDays('2024-02-28',1),D.addDays('2025-02-28',1),D.addDays('2026-03-01',-1),D.addDays('2026-11-03',-13)]))")
        self.assertEqual(out, ['2026-02-01', '2026-01-01', '2024-02-29', '2025-03-01', '2026-02-28', '2026-10-21'])

    def test_add_days_invalid(self):
        out = run("console.log(JSON.stringify([D.addDays('x',1),D.addDays('',1),D.addDays(null,1),D.addDays('2026-02-30',1),D.addDays('2026-11-03','a')]))")
        self.assertEqual(out, [''] * 5)

    def test_grid_shape(self):
        g = run("console.log(JSON.stringify(D.grid([],'2026-11-03')))")
        self.assertEqual(len(g), 14)
        self.assertEqual(g[-1]['date'], '2026-11-03')
        self.assertEqual(g[0]['date'], '2026-10-21')
        self.assertEqual([x['date'] for x in g], sorted(x['date'] for x in g))
        self.assertEqual([x['today'] for x in g], [False] * 13 + [True])
        self.assertEqual([x['day'] for x in g][:2], [21, 22])
        self.assertEqual(g[-1]['day'], 3)

    def test_grid_on_and_dupes(self):
        g = run("console.log(JSON.stringify(D.grid(['2026-11-03','2026-11-03','2026-11-01','bad',null,'2020-01-01'],'2026-11-03')))")
        self.assertEqual([x['date'] for x in g if x['on']], ['2026-11-01', '2026-11-03'])
        self.assertEqual(len(g), 14)

    def test_grid_n_and_bad(self):
        out = run("console.log(JSON.stringify([D.grid([],'2026-11-03',3).length,D.grid([],'bad'),D.grid(null,'2026-11-03',7).length]))")
        self.assertEqual(out, [3, [], 7])


class WiringTests(unittest.TestCase):
    def test_html(self):
        h = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
        self.assertIn('id="dsBox"', h)
        self.assertIn('nishio-go/daystamp.js', h)

    def test_game(self):
        g = (GO / 'game.js').read_text(encoding='utf-8')
        for w in ('renderDayStamps', 'nsg_days', 'nishioDayStamp'):
            self.assertIn(w, g)

    def test_game_no_stamp_for_opening_only(self):
        # Codex指摘（サイクル7）: きろくを開いただけで今日が金色にならないこと
        g = (GO / 'game.js').read_text(encoding='utf-8')
        sec = g[g.index('function renderDayStamps'):g.index('function renderLog')]
        self.assertNotIn('set.add(today)', sec)
        self.assertIn('S.day.walked', sec)
        self.assertIn('S.day.checkins', sec)

    def test_css(self):
        c = (GO / 'style.css').read_text(encoding='utf-8')
        for w in ('.ds-grid', '.ds-cell.on', '.ds-cell.today', '.ds-card[hidden]'):
            self.assertIn(w, c)

    def test_no_banned_words(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        add = [l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++')]
        for l in add:
            for w in ('ぼく', 'だに', '約20%'):
                self.assertNotIn(w, l)


if __name__ == '__main__':
    unittest.main()
