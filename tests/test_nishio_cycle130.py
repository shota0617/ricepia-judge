# にしおサイクル130：地理院タイルは 地図が 見えている ときだけ 読む（めいろの 間は 見えない 地図の タイルを 開いた 直後に 12〜18枚 読んでいた）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def block():
    i = GAME.index('const gsiTiles = L.tileLayer(')
    j = GAME.index("window.addEventListener('load', () => setTimeout(gsiSync, 500), { once: true });", i)
    return GAME[i:j + len("window.addEventListener('load', () => setTimeout(gsiSync, 500), { once: true });")]


def run(px0, steps):
    # L・document・MutationObserver・load の 代わり。steps：'load'（読みこみ 終わり）・'px'（めいろに）・'map'（歩く 地図に）
    code = ("const log = [];let layers = new Set();const map = { hasLayer: l => layers.has(l), addLayer: l => { layers.add(l); log.push('add'); }, removeLayer: l => { layers.delete(l); log.push('remove'); } };"
            "const L = { tileLayer: (u, o) => ({ addTo: m => { m.addLayer('gsi'); return 'gsi'; }, toString: () => 'gsi' }) };"
            "const cls = new Set(%s ? ['px'] : []);let obs = null;const document = { body: { classList: { contains: c => cls.has(c) } } };"
            "class MutationObserver { constructor(f) { obs = f; } observe() {} }globalThis.MutationObserver = MutationObserver;"
            "let onload = null;const window = { addEventListener: (k, f) => { if (k === 'load') onload = f; } };const timers = [];globalThis.setTimeout = (f, ms) => { timers.push(ms); f(); };"
            % ('true' if px0 else 'false') + block().replace("gsiTiles.addTo(map)", "map.addLayer('gsi')").replace("map.hasLayer(gsiTiles)", "map.hasLayer('gsi')").replace("map.removeLayer(gsiTiles)", "map.removeLayer('gsi')") +
            "for (const st of %s) { if (st === 'load') onload(); else if (st === 'px') { cls.add('px'); obs(); } else { cls.delete('px'); obs(); } }console.log(JSON.stringify({ log, has: layers.has('gsi'), timers }))" % json.dumps(steps))
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class GsiTiles(unittest.TestCase):
    def test_not_added_at_startup(self):
        self.assertIn('const gsiTiles = L.tileLayer(', GAME)
        self.assertNotRegex(GAME, r"L\.tileLayer\('https://cyberjapandata[^\n]*\n(?:[^\n]*\n){0,4}\}\)\.addTo\(map\);")   # 作った その場で 足さない
        r = run(False, [])
        self.assertEqual((r['log'], r['has']), ([], False))   # 読みこみが 終わるまで 足さない

    def test_maze_keeps_tiles_off(self):
        r = run(True, ['load'])
        self.assertEqual((r['log'], r['has'], r['timers']), ([], False, [500]))

    def test_walk_map_gets_tiles_and_maze_removes(self):
        r = run(False, ['load'])
        self.assertEqual((r['log'], r['has']), (['add'], True))
        r = run(False, ['load', 'px', 'map', 'px'])
        self.assertEqual(r['log'], ['add', 'remove', 'add', 'remove'])
        self.assertFalse(r['has'])


if __name__ == '__main__':
    unittest.main()
