"""第4弾サイクル211b：おそい 回線で 開いて から 最初の「タップ！」の 手本まで を 早く。
はかった（390×844・本番と 同じ gzip・往復 0.3秒・1.6Mbps・区画の ファイルを 0.4秒 おくらせる）：お米が 出て（5.9秒）から 手本（11.6秒）まで 5.7秒。
その 間 区画を 作る ワーカ（3つ）が 区画の ファイルを 1つずつ 取りに いき、区画 18個を 3つずつ 6回 待って いた（1回 0.8〜1.3秒。ほとんど 往復の 待ち）。
直し：区画を 列に 入れた とき（ensureChunk）に、その ファイルを 先に 取りに いく（同時に BAKED_PAR まで）。区画を 作るのは これまでどおり 3つずつ（PUMP_PAR）。
テストは 本物の ensureChunk・pump・loadChunk・bakedChunk を、手で 返す にせの fetch で 動かす（かべ時計を 使わない）。直す 前の ファイルでは ふるまいで 落ちる。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn(name, missing=None):
    m = re.search(r"(?:async )?function %s\(" % re.escape(name), PIX)
    if not m:
        if missing is not None:
            return missing
        raise AssertionError("no function " + name)
    return PIX[m.start():PIX.index("\n}\n", m.start()) + 2]


def line(start, missing=None):
    if start not in PIX:
        if missing is not None:
            return missing
        raise AssertionError("no line " + start)
    i = PIX.index(start)
    return PIX[i:PIX.index("\n", i) + 1]


def node(code):
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise AssertionError(r.stderr[-1500:])
    return json.loads(r.stdout)


# 区画の ファイル（128×128 マス を 1つの 値で）。fetch は 手で 返す。同時に 取りに いって いる 数・区画を 作って いる 数を 数える
STUB = """
const CHUNK = 128, BAKE = false, chunks = new Map(), queue = [], nbrCache = new Map();
let pumping = false, dirty = false;
const store = { get: () => null }, camTile = () => ({ x: 14 * CHUNK, y: 14 * CHUNK }), chunkInPlay = () => true;
const townify = g => g, dec = x => x, saveChunk = () => {}, demFor = async () => null, luReady = Promise.resolve(), rasterize = () => ({}), chunkQuery = () => '', chunkBox = () => ({});
let overpassCalls = 0; const overpass = async () => { overpassCalls++; throw new Error('no'); };
const BODY = JSON.stringify({ d: '0' + (CHUNK * CHUNK).toString(36) + '.', cv: 2 });
let live = 0, top = 0; const waits = [], got = [];
const fail404 = new Set();
const fetch = url => { live++; top = Math.max(top, live); got.push(url); return new Promise(res => waits.push(() => { live--; res({ ok: !fail404.has(url), json: async () => JSON.parse(BODY) }); })); };
const tick = () => new Promise(r => setTimeout(r, 0));
"""


def src():
    parts = [line("const PX_KEY = "), line("const PUMP_PAR = "), line("let pumpLive = ", ""), line("const BAKED_PAR = ", ""),
             line("const bakedPre = ", ""), line("let bakedLive = ", ""), "const unrle = " + PIX[PIX.index("const unrle = ") + len("const unrle = "):PIX.index("\n};\n", PIX.index("const unrle = ")) + 3],
             fn("bakedFetch", ""), fn("bakedChunk"), fn("loadChunk"), fn("pump"), fn("pumpWorker", ""), fn("ensureChunk")]
    return STUB + "\n;\n".join(parts)


class BakedPrefetch211(unittest.TestCase):
    def test_files_fetched_ahead_of_workers(self):
        """区画を 12個 列に 入れる：ファイルは 3つより 多く 同時に 取りに いく（上限 8）。作るのは 3つずつ。どの 区画も 1回 だけ 取り、ぜんぶ ok に なる"""
        o = node(src() + """
(async () => {
  for (let i = 0; i < 12; i++) { ensureChunk(10 + (i % 4), 12 + Math.floor(i / 4)); await tick(); }
  const early = top;
  while (waits.length) { waits.shift()(); for (let k = 0; k < 5; k++) await tick(); }
  const ok = [...chunks.values()].filter(c => c.state === 'ok').length;
  console.log(JSON.stringify({ early, top, files: got.length, uniq: new Set(got).size, ok, overpassCalls }));
})();""")
        self.assertGreater(o["early"], 3, "区画の ファイルを 3つずつ しか 取りに いって いない: %r" % o)
        self.assertLessEqual(o["top"], 8)
        self.assertEqual((o["files"], o["uniq"], o["ok"], o["overpassCalls"]), (12, 12, 12, 0))

    def test_workers_still_three(self):
        """区画を 作る（loadChunk）のは これまでどおり 同時に 3つ まで（サイクル210 の 上限）"""
        code = src().replace("async function loadChunk(", "let loadChunk = async function (") + """
let lc = 0, lcTop = 0; const lc0 = loadChunk;
loadChunk = async (cx, cy) => { lc++; lcTop = Math.max(lcTop, lc); try { await lc0(cx, cy); } finally { lc--; } };
(async () => {
  for (let i = 0; i < 12; i++) { ensureChunk(10 + (i % 4), 12 + Math.floor(i / 4)); await tick(); }
  while (waits.length) { waits.shift()(); for (let k = 0; k < 5; k++) await tick(); }
  console.log(JSON.stringify({ lcTop, ok: [...chunks.values()].filter(c => c.state === 'ok').length }));
})();"""
        self.assertEqual(node(code), {"lcTop": 3, "ok": 12})

    def test_failed_file_falls_back_and_refetches(self):
        """ファイルが 取れない（404）：これまでどおり 地図データへ（ここでは それも 失敗）→ fail。1分 たって 読みなおす ときは もう 1回 取りに いく"""
        o = node(src() + """
fail404.add('nishio-go/chunks/10_12.json');
(async () => {
  ensureChunk(10, 12); await tick();
  while (waits.length) { waits.shift()(); for (let k = 0; k < 5; k++) await tick(); }
  const st1 = chunks.get('10_12').state, n1 = got.length;
  fail404.clear(); chunks.get('10_12').t = 0;
  ensureChunk(10, 12); await tick();
  while (waits.length) { waits.shift()(); for (let k = 0; k < 5; k++) await tick(); }
  console.log(JSON.stringify({ st1, n1, overpassCalls, n2: got.length, st2: chunks.get('10_12').state }));
})();""")
        self.assertEqual(o, {"st1": "fail", "n1": 1, "overpassCalls": 1, "n2": 2, "st2": "ok"})


class Rules211(unittest.TestCase):
    def test_limits_kept(self):
        self.assertIn("const PUMP_PAR = 3;", PIX)
        self.assertIn("const BAKED_PAR = 8;", PIX)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)

    def test_doc(self):
        self.assertIn("サイクル211b", DOC)


if __name__ == "__main__":
    unittest.main()
