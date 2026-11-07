# にしおサイクル129：地図の 小物の 絵（deco-N.webp 約0.5MB）は 地図が 動きだしてから 読む（遅い 回線で 先に 流れて 動きだしが おくれていた）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def run(go):
    pre = ("const srcs = [], timers = [];let dirty = false;const DECO = { s: -1, idx: null, go: %s };const decoCache = new Map();"
           "globalThis.Image = function () { const o = {}; Object.defineProperty(o, 'src', { set(v) { srcs.push(v); }, get() { return ''; } }); return o; };"
           "globalThis.fetch = () => new Promise(() => {});globalThis.setTimeout = (f, ms) => { timers.push(ms); return 1; };"
           "globalThis.document = { getElementById: () => ({ hidden: true }) };const decoSeason = () => 2;" % ('true' if go else 'false'))
    code = pre + grab_fn('loadDeco') + "loadDeco();console.log(JSON.stringify({ srcs, timers, s: DECO.s }))"
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Deco(unittest.TestCase):
    def test_waits_until_map_runs(self):
        r = run(False)
        self.assertEqual((r['srcs'], r['timers'], r['s']), ([], [], -1))   # 読まない（こまの 中で DECO.go が 立ってから）

    def test_loads_once_running(self):
        r = run(True)
        self.assertEqual(r['srcs'], ['nishio-go/deco/deco-2.webp'])
        self.assertEqual(r['timers'], [])

    def test_source(self):
        f = grab_fn('loadDeco')
        self.assertIn('if (!DECO.go) return;', f)
        self.assertLess(f.index('if (!DECO.go) return;'), f.index('const s = decoSeason();'))
        self.assertIn('if (!DECO.go && riceSprites.ready) { if (!DECO.goAt) DECO.goAt = now; else if (now - DECO.goAt > 3000) { DECO.go = true; loadDeco(); } }', PIXEL)   # こまの 中（お米の 絵が できて 3秒 たってから）
        self.assertNotIn("typeof riceSprites", PIXEL)   # const の TDZ に ふれない（typeof でも 落ちる）


if __name__ == '__main__':
    unittest.main()
