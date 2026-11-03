import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
LIST = [{'id': 'a%d' % i, 'name': 'A%d' % i, 'area': 'x'} for i in range(5)] + \
       [{'id': 'b%d' % i, 'name': 'B%d' % i, 'area': 'y'} for i in range(5)]


def run(body):
    js = "global.window = {}; require(%r); const Q = window.nishioPhotoQuiz; %s" % (str(GO / 'photoquiz.js'), body)
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class PhotoQuizTests(unittest.TestCase):
    """第4弾サイクル6：きろく画面の絵あて（photoquiz.js）"""

    def test_empty(self):
        self.assertEqual(run("console.log(JSON.stringify([Q.pick([], '2026-11-03'), Q.pick(null, 'x')]))"), [None, None])

    def test_same_day_same_quiz_and_shape(self):
        out = run("const L=%s; const r=[];for(let d=1;d<=30;d++){const k='2026-11-'+d;r.push([Q.pick(L,k),Q.pick(L,k)]);}console.log(JSON.stringify(r))" % json.dumps(LIST))
        for a, b in out:
            self.assertEqual(a, b)
            self.assertEqual(len(a['choices']), 3)
            self.assertEqual(len(set(a['choices'])), 3)
            self.assertIn(a['id'], a['choices'])
        self.assertGreater(len({a['id'] for a, _ in out}), 1)

    def test_same_area_preferred(self):
        out = run("const L=%s; const r=[];for(let d=1;d<=30;d++)r.push(Q.pick(L,'d'+d));console.log(JSON.stringify(r))" % json.dumps(LIST))
        area = {x['id']: x['area'] for x in LIST}
        for q in out:
            self.assertTrue(all(area[c] == area[q['id']] for c in q['choices']))

    def test_few_and_judge(self):
        # 3件未満は出題しない（Codex指摘：1候補だと必ず正解になる）。重複idは1件に数える
        out = run("const L=[{id:'p',name:'P',area:'x'},{id:'q',name:'Q',area:'y'},{id:'r',name:'R',area:'y'}];const q=Q.pick(L,'d');console.log(JSON.stringify([Q.pick(L.slice(0,2),'d'),Q.pick([L[0],L[0],L[1]],'d'),q,Q.judge(q,q.id),Q.judge(q,'zz')]))")
        self.assertIsNone(out[0])
        self.assertIsNone(out[1])
        self.assertEqual(len(out[2]['choices']), 3)
        self.assertTrue(out[3])
        self.assertFalse(out[4])

    def test_wiring(self):
        html = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
        js = (GO / 'game.js').read_text(encoding='utf-8')
        css = (GO / 'style.css').read_text(encoding='utf-8')
        self.assertIn('id="pqBox"', html)
        self.assertIn('nishio-go/photoquiz.js', html)
        for w in ('renderPhotoQuiz', 'nsg_pq', 'nishioPhotoQuiz'):
            self.assertIn(w, js)
        for w in ('.pq-art', '.pq-choice', '.pq-card[hidden]'):
            self.assertIn(w, css)

    def test_no_banned_words(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
