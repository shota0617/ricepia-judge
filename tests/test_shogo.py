import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'


def node(body):
    js = "global.window = {}; require(%r); const G = window.NISHIO_SHOGO; %s" % (str(GO / 'shogo.js'), body)
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class ShogoTest(unittest.TestCase):
    """サイクル21：地区の称号と、めぐった数で ふえる かおりちゃんの ひとこと"""

    def test_title_condition(self):
        o = node("""const t = (id, total, done) => { const r = G.title(id, { total, done }); return r && r.name; };
console.log(JSON.stringify([t('nishio', 5, 5), t('nishio', 5, 4), t('nishio', 0, 0), t('okazaki', 3, 3), t('__proto__', 1, 1), t('isshiki', 2, 3), G.title('kira', null)]));""")
        self.assertEqual(o, ['西尾めぐり名人', None, None, None, None, '一色めぐり名人', None])

    def test_titles_only_nishio_five(self):
        o = node("console.log(JSON.stringify(Object.keys(G.TITLES)));")
        self.assertEqual(o, ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima'])

    def test_tier_and_say(self):
        o = node("""console.log(JSON.stringify([[0,false],[1,false],[9,false],[10,false],[29,false],[30,false],[49,false],[50,false],[80,true],[0,true],[NaN,false]].map(([n, a]) => G.tier(n, a))));""")
        self.assertEqual(o, [0, 1, 1, 2, 2, 3, 3, 4, 5, 0, 0])
        says = node("console.log(JSON.stringify([0,1,2,3,4,5,9].map(G.say)));")
        self.assertEqual(says[0], '')
        self.assertEqual(says[6], '')
        self.assertEqual(len(set(says[1:6])), 5)
        for t in says[1:6]:
            self.assertLessEqual(len(t), 40)
            for w in ('ぼく', 'だに', '20%', '約20'):
                self.assertNotIn(w, t)

    def test_wiring(self):
        src = (GO / 'game.js').read_text(encoding='utf-8')
        html = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
        self.assertLess(html.index('nishio-go/shogo.js'), html.index('nishio-go/game.js'))
        # きろくの地区一覧に称号、きょうのさんぽに 段階のひとこと（既存のひとこと 1か所に寄せる）
        self.assertIn('<b>${esc(a.name)}</b>${shogoHtml(a.id, p)}', src)
        self.assertEqual(src.count('shogoSayHtml()'), 2)   # 定義 + きょうのさんぽ の1か所
        self.assertIn('${esc(kaoriWalkSay(walked, (day.spots || []).length))}</p>${shogoSayHtml()}', src)
        for fn in ('shogoHtml', 'shogoSayHtml'):
            body = re.search(r"^function %s\(.*?(?=\n(?:function|//|const) )" % fn, src, re.M | re.S).group(0)
            for w in ('S.points', 'S.total', 'save(', 'S.visits[', 'S.shogo'):
                self.assertNotIn(w, body)

    def test_no_forbidden_words(self):
        t = (GO / 'shogo.js').read_text(encoding='utf-8')
        for w in ('ぼく', 'だに', '20%'):
            self.assertNotIn(w, t)


if __name__ == '__main__':
    unittest.main()
