# にしおサイクル120：最初の ゴールまでは 転がり方を もらわない（最初の 1分で 転がり方が 手の 中で かわる こと・「🍚 転がり方「…」GET！」の 知らせを なくす）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
SRC = (GO / 'korostyle.js').read_text(encoding='utf-8')

# node で korostyle.js を 読む ための 小さな DOM・localStorage の 代わり
STUB = """
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const el = () => ({ style: {}, textContent: '', hidden: true, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], remove() {}, focus() {} });
globalThis.document = { createElement: el, head: el(), body: el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
const toasts = [];
globalThis.nishioGo = { toast: t => toasts.push(t) };
globalThis.window = globalThis;
"""


def run(body):
    code = STUB + "require(%s);const K=globalThis.NISHIO_KOROSTYLE;" % json.dumps(str(GO / 'korostyle.js')) + body
    r = subprocess.run(['node', '-e', code], capture_output=True, text=True)
    if r.returncode:
        raise AssertionError(r.stderr[-800:])
    return json.loads(r.stdout.strip().splitlines()[-1])


class Unlock(unittest.TestCase):
    def test_no_style_before_first_goal(self):
        out = run("for(let i=0;i<300;i++)K.addDist(1);console.log(JSON.stringify({u:K.state.u.length,dist:K.state.dist,toasts}))")
        self.assertEqual(out['u'], 0)
        self.assertEqual(out['dist'], 0)   # 道のりも 数えない（あとで まとめて もらわない）
        self.assertEqual(out['toasts'], [])

    def test_style_after_first_goal(self):
        out = run("localStorage.setItem('nsg_mzgoals','3');for(let i=0;i<41;i++)K.addDist(1);console.log(JSON.stringify({u:K.state.u.length,toasts}))")
        self.assertEqual(out['u'], 1)
        self.assertEqual(len(out['toasts']), 1)
        self.assertIn('転がり方', out['toasts'][0])

    def test_bad_goals_value(self):
        out = run("localStorage.setItem('nsg_mzgoals','abc');for(let i=0;i<41;i++)K.addDist(1);console.log(JSON.stringify({u:K.state.u.length}))")
        self.assertEqual(out['u'], 0)


class Static(unittest.TestCase):
    def test_source(self):
        i = SRC.index('function addDist(')
        self.assertIn('if (goalsDone() < 3) return;', SRC[i:i + 600])
        self.assertIn("localStorage.getItem('nsg_mzgoals')", SRC)


if __name__ == '__main__':
    unittest.main()
