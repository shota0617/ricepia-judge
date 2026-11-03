import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


@unittest.skipUnless(shutil.which('node'), 'node がない')
class SugorokuBoardTests(unittest.TestCase):
    """第4弾サイクル10：きろく画面の大きなすごろくボード（sugorokuBoard）"""

    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'game.js').read_text()

    def board(self, lists):
        a = re.search(r"^const AREA_RGB = .*$", self.src, re.M)
        f = re.search(r"^function sugorokuBoard\(.*?\n^\}", self.src, re.M | re.S)
        self.assertTrue(a and f)
        code = a.group(0) + "\n" + f.group(0) + "\nconsole.log(JSON.stringify(%s.map(sugorokuBoard)));" % json.dumps(lists)
        r = subprocess.run(['node', '-e', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_empty(self):
        for got in self.board([[], [{'id': 'nishio', 'done': 0, 'total': 0}], None]):
            self.assertEqual((got['cols'], got['cells'], got['pos'], got['done'], got['total']), ([], [], -1, 0, 0))

    def test_filled_rounding(self):
        a, b, c, d, e, f = self.board([
            [{'id': 'nishio', 'done': 0, 'total': 10}],
            [{'id': 'nishio', 'done': 1, 'total': 100}],
            [{'id': 'nishio', 'done': 19, 'total': 20}],
            [{'id': 'nishio', 'done': 4, 'total': 10}],
            [{'id': 'nishio', 'done': 4, 'total': 4}],
            [{'id': 'nishio', 'done': -3, 'total': 4}, {'id': 'kira', 'done': 9, 'total': 3}, {'id': 'hazu', 'done': 1, 'total': 0}]])
        self.assertEqual(a['cols'][0]['filled'], 0)
        self.assertEqual(b['cols'][0]['filled'], 1)   # 未完了の最低1
        self.assertEqual(c['cols'][0]['filled'], 4)   # 満了直前は完了と見分ける
        self.assertEqual(d['cols'][0]['filled'], 2)   # floor(4/10*5)
        self.assertEqual(e['cols'][0]['filled'], 5)
        self.assertEqual([x['filled'] for x in f['cols']], [0, 5])   # 負数は0、done>total丸め、total 0 除外
        self.assertEqual(f['cols'][1]['done'], 3)

    def test_unknown_id_gold(self):
        got, = self.board([[{'id': 'zzz', 'done': 1, 'total': 2}]])
        self.assertEqual(got['cols'][0]['rgb'], [227, 164, 43])

    def test_snake_order(self):
        got, = self.board([[{'id': i, 'done': 0, 'total': 1} for i in ('nishio', 'isshiki', 'kira')]])
        steps = [c['step'] for c in got['cells']]
        self.assertEqual(steps, [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11, 12, 13, 14])
        self.assertEqual([c['id'] for c in got['cells'][5:10]], ['isshiki'] * 5)

    def test_piece_position(self):
        fresh, mid, done, second = self.board([
            [{'id': 'nishio', 'done': 0, 'total': 5}, {'id': 'kira', 'done': 0, 'total': 5}],
            [{'id': 'nishio', 'done': 5, 'total': 5}, {'id': 'kira', 'done': 2, 'total': 5}],
            [{'id': 'nishio', 'done': 5, 'total': 5}, {'id': 'kira', 'done': 5, 'total': 5}],
            [{'id': 'nishio', 'done': 3, 'total': 5}, {'id': 'kira', 'done': 0, 'total': 5}]])
        self.assertEqual(fresh['pos'], 0)
        self.assertEqual(mid['pos'], 7)      # nishio 5マス + kira 2マス → 次の8マス目（step 7）
        self.assertEqual(done['pos'], 9)     # 全部埋まったら最後
        self.assertEqual(second['pos'], 3)   # 5地区全部でなくても最初の未満マス


class SugorokuWiringTests(unittest.TestCase):
    def test_wired(self):
        html = (ROOT / 'nishio-go.html').read_text()
        js = (GO / 'game.js').read_text()
        css = (GO / 'style.css').read_text()
        self.assertIn('id="sugoroku"', html)
        self.assertIn('🎲 すごろく', html)
        self.assertIn("$('sugoroku')", js)
        self.assertIn('renderSugoroku()', js)
        self.assertRegex(js, r"blockTower, sugorokuBoard,")
        for c in ('.sugoroku{', '.sugoroku[hidden]{display:none}', '.sg-cell{', 'min(52px,17vw)', 'min-width:44px'):
            self.assertIn(c, css)

    def test_diff_scope_and_banned_words(self):
        names = subprocess.run(['git', 'diff', '--name-only', 'origin/main', 'HEAD'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        status = subprocess.run(['git', 'diff', '--name-only', 'origin/main'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        for n in set(names) | set(status):
            self.assertTrue(n.startswith('nishio-go/') or n in ('nishio-go.html', 'tests/test_maze_loop4_10.py', 'tests/test_maze_loop4_11.py', 'tests/test_maze_loop4_12.py', 'tests/test_maze_loop4_13.py', 'tests/test_maze_loop4_14.py', 'tests/test_maze_loop4_15.py', 'tests/test_furusato.py', 'tests/test_monosashi.py', 'tests/test_nedoko.py', 'tests/test_okaeri.py', 'tests/test_shirushi.py', 'tests/test_yume.py', 'tests/test_maze_loop4_16.py', 'tests/test_maze_loop4_9.py') or n.startswith('tests/test_maze_loop3_') or n == 'tests/test_reward_tip.py' or (n.startswith('tests/test_maze_loop3_6') and n[-4:-3] in '345678') or n in ('tests/test_maze_loop3_36.py', 'tests/test_maze_loop3_38.py', 'tests/test_maze_loop3_39.py', 'tests/test_maze_loop3_40.py', 'tests/test_maze_loop3_41.py', 'tests/test_maze_loop3_44.py', 'tests/test_maze_loop3_45.py', 'tests/test_maze_loop3_46.py', 'tests/test_maze_loop3_47.py', 'tests/test_maze_loop3_48.py', 'tests/test_maze_loop3_49.py', 'tests/test_maze_loop3_50.py', 'tests/test_maze_loop3_51.py', 'tests/test_maze_loop3_52.py', 'tests/test_maze_loop3_53.py', 'tests/test_maze_loop3_54.py', 'tests/test_maze_loop3_55.py', 'tests/test_maze_loop3_56.py', 'tests/test_maze_loop3_57.py', 'tests/test_maze_loop3_58.py', 'tests/test_maze_loop3_59.py', 'tests/test_maze_loop3_60.py', 'tests/test_maze_loop3_61.py', 'tests/test_maze_loop3_62.py'), n)  # 第4弾サイクル11の範囲ガード追随分
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('\u307c\u304f', '\u3060\u306b', '\u7d0420%'):
            self.assertNotIn(w, added)
