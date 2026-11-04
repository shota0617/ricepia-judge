# 第4弾サイクル72：西尾めいろは競わない（時間・ベスト・★・ゴーストをなくす。参考：Sable）
import re
import subprocess
import unittest
from pathlib import Path

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
MEIRO = (GO / 'meiro.js').read_text(encoding='utf-8')
SHARE = (GO / 'share.js').read_text(encoding='utf-8')


def code_only(s):
    return '\n'.join(re.sub(r'//.*$', '', l) for l in s.splitlines())


def func_body(s, head):
    i = s.index(head)
    return s[i:s.index('\n}\n', i)]


CODE = code_only(MEIRO)


class NoRace(unittest.TestCase):
    def test_no_compare_words(self):
        for w in ['ベスト', 'ゴースト', 'nsg_meiro_ghost', 'saveGhost',
                  'mz-stars', 'タイム ', 'GSTEP', 'g.rec', 'newBest']:
            self.assertNotIn(w, CODE, w)

    def test_tick_no_seconds(self):
        line = [l for l in CODE.splitlines() if 'ui.time.textContent = (b0' in l][0]
        self.assertNotIn('g.t', line)
        self.assertNotIn('toFixed', line)
        self.assertIn('\U0001f33e${g.got.size}/${b0.grains.length}', line)
        self.assertIn("' ばね'", line)   # サイクル75：残り秒数は出さない

    def test_win_advances_only_stage(self):
        w = code_only(func_body(MEIRO, 'function win()'))
        self.assertIn('st.stage = Math.max(st.stage, g.n + 1)', w)
        self.assertIn('save();', w)
        for bad in ['par', 'stars', 'newBest', 'sec', 'prev']:
            self.assertIsNone(re.search(r'\b' + bad + r'\b', w), bad)
        self.assertIn('{ c: 1 }', w)
        self.assertIn('g.result = { name: g.spot.name, daily: !!g.daily, n: g.n + 1, got: g.got.size, grains: b.grains.length }', w)

    def test_note_only_stage(self):
        n = code_only(func_body(MEIRO, 'function note()'))
        self.assertIn('${st.stage + 1}', n)
        self.assertNotIn('★', n)

    def test_share_no_sec_stars(self):
        for head in ["if (cur === 'meiro' && curMeiro) {", "} else if (cur === 'meiro' && curMeiro) {"]:
            i = SHARE.index(head)
            blk = code_only(SHARE[i:SHARE.index('\n  }', i)])
            self.assertNotIn('m.sec', blk)
            self.assertNotIn('m.stars', blk)
        self.assertIn('\u3064\u3044\u305f', SHARE)

    def test_sable_noted(self):
        comments = '\n'.join(l[l.index('//'):] for l in MEIRO.splitlines() if '//' in l)
        self.assertIn('Sable', comments)

    def test_forbidden_words_absent(self):
        # 禁止語はコード点で組み立てる（リテラルを書かない）
        w1 = chr(0x307c) + chr(0x304f)
        w2 = chr(0x7d04) + '20%'
        w3 = '(?<!' + chr(0x3044) + ')' + chr(0x3060) + chr(0x306b)
        self.assertNotIn(w1, MEIRO)
        self.assertNotIn(w2, MEIRO)
        self.assertIsNone(re.search(w3, MEIRO))

    def test_syntax(self):
        for n in ['meiro', 'share']:
            subprocess.run(['node', '--check', str(GO / (n + '.js'))], check=True)


if __name__ == '__main__':
    unittest.main()
