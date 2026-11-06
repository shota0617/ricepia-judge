# にしおサイクル128：world.json は 1回だけ 読む（町名の 表と せかいちずが べつべつに 読んで、遅い 回線で 417KB を 2回 読んでいた）
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


def run(body, ok=True):
    code = ("const WORLD_FILE = 'nishio-go/world.json';let calls = [];"
            "globalThis.fetch = (u, o) => { calls.push([u, o && o.cache]); return Promise.resolve({ ok: %s, json: () => Promise.resolve({ w: 1, l: [['a']] }) }); };"
            "let worldJsonP = null;" % ('true' if ok else 'false')
            + grab_fn('worldJson') + body)
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class WorldJson(unittest.TestCase):
    def test_two_callers_share_one_fetch(self):
        r = run("(async () => { const [a, b] = await Promise.all([worldJson(), worldJson()]); console.log(JSON.stringify({ calls, same: a === b, l: a && a.l })); })()")
        self.assertEqual(r['calls'], [['nishio-go/world.json', 'no-cache']])
        self.assertTrue(r['same'])
        self.assertEqual(r['l'], [['a']])

    def test_refetch_after_done(self):
        r = run("(async () => { await worldJson(); await worldJson(); console.log(JSON.stringify({ n: calls.length })); })()")
        self.assertEqual(r['n'], 2)   # 終わった あとは 読みなおせる（作り直しの 読みなおし・やりなおし）

    def test_not_ok_gives_null(self):
        r = run("(async () => { const a = await worldJson(); console.log(JSON.stringify({ a, n: calls.length })); })()", ok=False)
        self.assertEqual((r['a'], r['n']), (None, 1))

    def test_both_sites_use_it(self):
        self.assertIn('townsLoad = worldJson()', grab_fn('loadTowns'))
        self.assertIn('const b = await worldJson();', PIXEL[PIXEL.index('async function buildWorld('):PIXEL.index('async function buildWorld(') + 2500])
        self.assertEqual(PIXEL.count('fetch(WORLD_FILE'), 1)


if __name__ == '__main__':
    unittest.main()
