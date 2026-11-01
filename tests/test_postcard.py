import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def node(body, pre=''):
    js = "global.window = {}; require(%r); const P = window.NISHIO_POSTCARD; %s %s" % (str(GO / 'postcard.js'), pre, body)
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class PostcardTests(unittest.TestCase):
    """サイクル20：名所の記念ポストカード（初回のみ・重複なし・壊れた記録・きろくへの配線）"""

    def test_issue_once_and_keep_first(self):
        o = node("""let r = P.issue(null, 'f-nishio-castle', '2026-11-01', P.say('西尾城', '城の跡。'));
const first = r.fresh; const day1 = r.st['f-nishio-castle'].day;
r = P.issue(r.st, 'f-nishio-castle', '2026-11-05', 'べつ');
const r2 = P.issue(r.st, 'f-jissoji', '2026-11-05', 'あ');
console.log(JSON.stringify({ first, again: r.fresh, day: r.st['f-nishio-castle'].day, day1, n: Object.keys(r2.st).length, f2: r2.fresh }));""")
        self.assertEqual(o, {'first': True, 'again': False, 'day': '2026-11-01', 'day1': '2026-11-01', 'n': 2, 'f2': True})

    def test_broken_records_do_not_crash(self):
        o = node("""const bad = [null, undefined, 5, 'x', [], [1], { a: 1 }, { a: null }, { a: { day: 3, say: 'x' } }, { a: { day: '昨日', say: 'x' } }, { a: { day: '2026-11-01', say: 7 } }, { '': { day: '2026-11-01', say: 'x' } }];
const out = bad.map(b => Object.keys(P.clean(b)).length);
const ok = P.clean({ a: { day: '2026-11-01', say: 'x'.repeat(500) }, b: { day: 'bad', say: 'y' } });
const big = {}; for (let i = 0; i < 1000; i++) big['s' + i] = { day: '2026-11-01', say: 'z' };
const iss = bad.map(b => P.issue(b, 'f-x', '2026-11-01', 'a').fresh);
const badArg = [P.issue({}, '', '2026-11-01', 'a').fresh, P.issue({}, 'f-x', 'kinou', 'a').fresh, P.issue({}, 'f-x', '2026-11-01').st['f-x'].say];
console.log(JSON.stringify({ out, keys: Object.keys(ok), len: ok.a.say.length, big: Object.keys(P.clean(big)).length, iss, badArg }));""")
        self.assertEqual(o['out'], [0] * 12)
        self.assertEqual(o['keys'], ['a'])
        self.assertEqual(o['len'], 60)
        self.assertEqual(o['big'], 400)
        self.assertTrue(all(o['iss']))
        self.assertEqual(o['badArg'], [False, False, ''])

    def test_say_is_mikawa_and_has_no_forbidden_words(self):
        o = node("console.log(JSON.stringify([P.say('西尾市歴史公園（西尾城跡）', '西尾城の跡を整備した公園。本丸丑寅櫓などが再建されている。'), P.say('実相寺', ''), P.say('', null)]));")
        for t in o:
            self.assertLessEqual(len(t), 60)
            for w in ('ぼく', 'だに', '20%', '約20'):
                self.assertNotIn(w, t)
        self.assertIn('西尾城の跡を整備した公園', o[0])
        self.assertNotIn('（', o[0])

    def test_game_wiring(self):
        src = (GO / 'game.js').read_text(encoding='utf-8')
        html = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
        self.assertLess(html.index('nishio-go/postcard.js'), html.index('nishio-go/game.js'))
        self.assertIn('id="postcardList"', html)
        # きろくの描画から呼ばれ、チェックインで発行される
        self.assertRegex(src, r"function renderLog\(\) \{\s*renderCourse\(\);\s*renderPostcards\(\);")
        self.assertIn('postcardCheckin(s, lines);', src)
        # 発行は注目スポットだけで、ポイント(total)・訪問(S.visits)には触れない
        fn = re.search(r"^(function postcardCheckin\(.*?\n\})", src, re.M | re.S).group(1)
        self.assertNotIn('total', fn)
        self.assertNotIn('S.visits', fn)
        js = """const S = { postcards: 'こわれた' }; const lines = [], tracks = []; const track = (k, v) => tracks.push(k); const demo = true; const PC = window.NISHIO_POSTCARD; const ymd = () => '2026-11-01';
%s
postcardCheckin({ id: 'f-a', name: 'あ', desc: 'い。', featured: true }, lines);
postcardCheckin({ id: 'f-a', name: 'あ', desc: 'い。', featured: true }, lines);
postcardCheckin({ id: 'n-1', name: 'ふつう', featured: false }, lines);
postcardCheckin({ id: 'f-shop', name: '店', featured: true, shop: true }, lines);
console.log(JSON.stringify({ keys: Object.keys(S.postcards), lines: lines.length, tracks }));""" % fn
        o = node(js)
        self.assertEqual(o, {'keys': ['f-a'], 'lines': 1, 'tracks': ['postcard_issue']})

    def test_no_forbidden_words_in_files(self):
        for p in (GO / 'postcard.js', Path(__file__)):
            t = p.read_text(encoding='utf-8')
            if p == Path(__file__):
                continue
            for w in ('ぼく', 'だに', '20%'):
                self.assertNotIn(w, t, p.name)


if __name__ == '__main__':
    unittest.main()
