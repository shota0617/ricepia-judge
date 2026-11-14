"""第4弾サイクル218（設計の 案 N-a）：おそい 回線で 最初の 絵まで 約 6秒、題字と 行き来する 米つぶ だけ で 読みこみが 進んで いるか 分からなかった。
題字の 下に、届いた 同期の スクリプトの 数 だけ のびる 線（にせの 進みは 出さない）。0.7秒 たっても 題字が ある とき だけ 見せる（速い 回線では 出ない）。
本物の 題字の スクリプトを、にせの document・PerformanceObserver・タイマーで 動かす（直す 前の ファイルで ふるまいで 落ちる）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def boot_script():
    i = HTML.index("<script>/* 読みこみ中は 画面を切り替えず")
    return HTML[i + len("<script>"):HTML.index("</script>", i)]


def node(code):
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise AssertionError(r.stderr[-1500:])
    return json.loads(r.stdout)


STUB = """
const timers = [], L = {}; let obs = null;
const setTimeout = (f, ms) => { timers.push([ms, f]); return timers.length; };
const mk = tag => { const e = { tag, cls: new Set(), style: {}, attrs: {}, kids: [] }; e.classList = { add: c => e.cls.add(c), contains: c => e.cls.has(c), remove: c => e.cls.delete(c) };
  e.setAttribute = (k, v) => { e.attrs[k] = v; }; e.removeAttribute = k => { delete e.attrs[k]; }; e.remove = () => {}; e.appendChild = k => e.kids.push(k); return e; };
let cover = null; const made = [];
const body = { appendChild() {} }, head = {};
const document = { body, head, createElement: tag => { const e = mk(tag); made.push(e); if (!cover) cover = e; return e; },
  addEventListener: (t, f, cap) => { (L[t] = L[t] || []).push(f); }, removeEventListener: (t, f) => { L[t] = (L[t] || []).filter(g => g !== f); } };
const listeners = new Proxy({}, { get: (o, t) => (L[t] || [])[0] });   // listeners['DOMContentLoaded']() など
const performance = { now: () => 700 };
class PerformanceObserver { constructor(cb) { obs = this; this.cb = cb; this.dead = false; } observe(o) { this.o = o; } disconnect() { this.dead = true; } }
const window = {};
// 本当の 読みこみ：resource の 項目は 成功でも しっぱいでも できる。スクリプトの 要素には load か error が 来る（capture で document に とどく）
const arrive = (src, o = {}) => {
  const kind = o.kind || 'script', ok = o.ok !== false;
  if (obs && !obs.dead) obs.cb({ getEntries: () => [{ initiatorType: kind, name: src }] });
  if (kind !== 'script') return;
  const t = { tagName: 'SCRIPT', src, async: !!o.async, defer: false, parentNode: o.async ? head : body };
  for (const f of (L[ok ? 'load' : 'error'] || []).slice()) f({ type: ok ? 'load' : 'error', target: t });
};
const feed = list => list.forEach(([t, n]) => arrive(n, { kind: t }));
const width = () => { const bb = cover && cover.kids.find(k => k.tag === 'b'), s = bb && bb.kids.find(k => k.tag === 's'); return s && s.style.transform ? +s.style.transform.replace(/[^\\d.]/g, '') : 0; };
const N = () => window.__bootBar && window.__bootBar.n;
"""


def run(tail):
    return node(STUB + boot_script() + "\n" + tail)


class BootBar218(unittest.TestCase):
    def test_async_scripts_not_counted(self):
        """サイクル218b（指摘 P2）：解析が あとから 足す 非同期の スクリプトは 数えない（同期 31本 届いて 2本 足されても 31・線は 31/32）"""
        o = run("""for (let k = 0; k < 31; k++) arrive('nishio-go/s' + k + '.js'); arrive('https://www.googletagmanager.com/gtag/js?id=x', { async: true }); arrive('https://tag.flvcdn.net/lytag.js', { async: true });
console.log(JSON.stringify({ n: N(), w: width(), total: window.__bootBar.total }));""")
        self.assertEqual(o["n"], 31, "非同期の スクリプトも 数えた: %r" % o)
        self.assertAlmostEqual(o["w"], 31 / o["total"], places=3)

    def test_failed_scripts_not_counted(self):
        """サイクル218b（指摘 P2）：通信に しっぱいした スクリプトは 数えない（30本 成功・1本 しっぱい で 30）"""
        o = run("""for (let k = 0; k < 30; k++) arrive('nishio-go/s' + k + '.js'); arrive('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', { ok: false });
console.log(JSON.stringify({ n: N() }));""")
        self.assertEqual(o["n"], 30, "しっぱいした スクリプトも 数えた: %r" % o)

    def test_stops_after_cover_closes(self):
        """サイクル218b（指摘 P3）：題字を 閉じる（DOMContentLoaded）と 数えるのを やめる（あとから 読む スクリプトで ふえない）"""
        o = run("""for (let k = 0; k < 32; k++) arrive('nishio-go/s' + k + '.js'); const n0 = N(); listeners['DOMContentLoaded']();
for (let k = 0; k < 50; k++) arrive('nishio-go/lazy' + k + '.js');
console.log(JSON.stringify({ n0, n1: N(), live: (L.load || []).length + (L.error || []).length + (obs && !obs.dead ? 1 : 0) }));""")
        self.assertEqual(o["n0"], 32)
        self.assertEqual(o["n1"], 32, "題字を 閉じた あとも 数え続けた: %r" % o)
        self.assertEqual(o["live"], 0)

    def test_bar_grows_with_arrived_scripts(self):
        """届いた スクリプトの 数 だけ のびる（同じ ものは 1回・スクリプト で ない もの（画像・fetch）は 数えない）"""
        o = run("""feed([['script', 'a.js'], ['img', 'x.png'], ['script', 'a.js']]); const w1 = width();
for (let k = 0; k < 15; k++) feed([['script', 's' + k + '.js']]); const w2 = width();
feed([['fetch', 'chunks/1.json'], ['css', 'style.css']]); const w3 = width();
console.log(JSON.stringify({ w1, w2, w3, n: window.__bootBar && window.__bootBar.n, total: window.__bootBar && window.__bootBar.total }));""")
        self.assertEqual(o["n"], 16, "届いた スクリプトを 数えて いない: %r" % o)
        self.assertAlmostEqual(o["w1"], 1 / o["total"], places=3)
        self.assertAlmostEqual(o["w2"], 16 / o["total"], places=3)
        self.assertEqual(o["w2"], o["w3"])

    def test_shown_only_when_slow(self):
        """0.7秒 たっても 題字が ある とき だけ 見せる。それより 前に 題字が 消えたら 出さない（速い 回線）"""
        o = run("""const t = timers.find(q => q[0] >= 500 && q[0] <= 1000); t[1]();
const slow = cover.cls.has('slow');
console.log(JSON.stringify({ ms: t[0], slow }));""")
        self.assertTrue(o["slow"])
        o2 = run("""cover.cls.add('off'); const t = timers.find(q => q[0] >= 500 && q[0] <= 1000); t[1]();
console.log(JSON.stringify({ slow: cover.cls.has('slow') }));""")
        self.assertFalse(o2["slow"])

    def test_total_matches_sync_scripts(self):
        """線の 分母（BOOT_N）は ページの 同期の スクリプトの 数と 同じ（スクリプトを ふやしたら ここも かえる）"""
        m = re.search(r"var BOOT_N = (\d+)", HTML)
        self.assertTrue(m)
        body = HTML[HTML.index("<body>"):]
        n = len(re.findall(r'<script src="[^"]+"(?![^>]*\b(?:async|defer)\b)[^>]*></script>', body))
        self.assertEqual(int(m.group(1)), n)

    def test_style_and_rules(self):
        """線は 押せない（題字の 中・aria-hidden）。「動きを へらす」でも 見える（のびる 動き だけ 止める）。12秒の 文・米つぶ は かえない"""
        css = HTML[HTML.index("<style>/* 読みこみ中の 題字"):]
        self.assertRegex(css, r"#bootCover\.slow b\{visibility:visible\}")
        self.assertIn("@media (prefers-reduced-motion:reduce){#bootCover b s{transition:none}}", css)
        self.assertNotRegex(css, r"prefers-reduced-motion:reduce\)\{[^}]*#bootCover b\{[^}]*(display:none|visibility:hidden)")
        self.assertIn("@media (prefers-reduced-motion:reduce){#bootCover i{animation:none}}", HTML)
        self.assertIn("}, 12000);", HTML)
        self.assertIn("b.innerHTML = '読みこみに 時間が かかっています<br>このまま 待つか、タップで やりなおし';", HTML)
        self.assertIn("c.setAttribute('aria-hidden', 'true');", HTML)

    def test_doc(self):
        self.assertIn("サイクル218", DOC)


if __name__ == "__main__":
    unittest.main()
