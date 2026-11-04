# 第4弾サイクル73：ミニゲームは急かさない（段丘・肥料山の制限時間、稲刈りの目安・名人をなくす。参考：Spiritfarer）
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
SRC = {n: (GO / (n + '.js')).read_text(encoding='utf-8') for n in ['dankyu', 'hiryoyama', 'harvest']}


def code_only(s):
    return '\n'.join(re.sub(r'//.*$', '', l) for l in s.splitlines())


def func_body(s, head):
    i = s.index(head)
    return s[i:s.index('\n  }\n', i)]


DK, HY, HV = (code_only(SRC[n]) for n in ['dankyu', 'hiryoyama', 'harvest'])


class Dankyu(unittest.TestCase):
    def test_no_time(self):
        for w in ['timeLeft', '時間切れ', 'のこり']:
            self.assertNotIn(w, DK, w)
        self.assertNotIn('data-h="time"', DK)
        self.assertNotIn("hud('time'", DK)

    def test_levels_have_no_time(self):
        levels = DK[DK.index('const LEVELS'):DK.index('];', DK.index('const LEVELS'))]
        self.assertNotRegex(levels, r'\btime\b')

    def test_stars_by_hearts(self):
        body = func_body(DK, 'function stars()')
        self.assertNotIn('time', body.lower())
        self.assertIn('hearts >= 2', body)

    def test_best_gets_hearts(self):
        self.assertIn("G.miniBest('dankyu', lv, st, hearts, false)", DK)


class Hiryo(unittest.TestCase):
    def test_no_time(self):
        for w in ['時間切れ', '+10秒', 'のこり', "finish('time')", 'TIME']:
            self.assertNotIn(w, HY, w)
        self.assertNotIn('data-h="time"', HY)

    def test_done_when_grass_gone_and_basket_empty(self):
        body = func_body(HY, 'function checkDone()') if 'function checkDone()' in HY else ''
        self.assertIn("includes('g')", HY)
        self.assertIn('carry === 0', HY)
        self.assertIn("finish('done')", HY)
        mv = func_body(HY, 'function move(d)')
        self.assertIn('checkDone()', mv)

    def test_owner_by_elapsed(self):
        self.assertIn('elapsed > OWNER_AT', HY)
        self.assertNotIn('left', HY.replace('left:', '').replace("'left'", '').replace('"left"', '').replace('data-dir="left"', '').replace('aria-label="左へ"', ''))

    def test_track_why(self):
        self.assertIn("why: why || 'done'", HY)


class Harvest(unittest.TestCase):
    def test_no_meijin_or_target_text(self):
        for w in ['名人', '目安', 'SLACK']:
            self.assertNotIn(w, HV, w)

    def test_judge_ok_without_turns(self):
        body = func_body(HV, 'function judge()')
        ok = [l for l in body.splitlines() if 'const ok' in l][0]
        self.assertNotIn('turns', ok)
        self.assertIn('rest === 0', ok)
        self.assertIn('waste === 0', ok)

    def test_stars_unchanged(self):
        self.assertIn('turns <= par ? 3 : turns <= par + 1 ? 2 : 1', HV)


class Common(unittest.TestCase):
    def test_spiritfarer_noted(self):
        for n, s in SRC.items():
            self.assertIn('Spiritfarer', s, n)

    def test_forbidden_words(self):
        bad = ['\u307c\u304f', '\u3060\u306b', '\u7d0420%']   # 禁止語はリテラルで書かずUnicodeエスケープで
        for n, s in SRC.items():
            for w in bad:
                self.assertNotIn(w, code_only(s), n)

    def test_node_check(self):
        for n in SRC:
            r = subprocess.run(['node', '--check', str(GO / (n + '.js'))], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == '__main__':
    unittest.main()
