"""第4弾サイクル210：開いて から 最初の 手本が 見える まで を 早く（確かめ役の 数：傾きの 許可を 聞かない 端末で 中央 3.06秒・3秒 以内 3/10、CPU 3倍で 約 4.3秒）。
(1) 開いて まだ 何も さわって いない・お米が 出た 所から 動いて いない 間の 手本は、2秒 待たずに 出す（聞かない 端末でも）。さわった・動いた あとは これまでどおり 2秒。
(2) 区画は 3つ 同時に 読む はずが、1つずつ 足されると 1つずつ しか 読んで いなかった：読んで いる 間に 足されても 3つ まで 同時に 読む（上限 3 は かえない）。
(3) はじめての 手本は、道すじが できた こまの すぐ あとに 見る（0.25秒の 見回りを 待たない）。
どの テストも 直す 前の pixel.js の 物（tapDemoTick・pump）を 動かして、ふるまいで 落ちる（新しい 物は ある ときだけ 入れる）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
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


# 手本の 見回り（tapDemoTick）を、にせの 時計・お米・道すじ で 動かす。聞かない 端末（tiltBtnWanted が false）
DEMO_STUB = """
let T = 1000;
const performance = { now: () => T };
const mkEl = () => ({ hidden: true, style: {}, classList: { s: new Set(), contains(c) { return this.s.has(c); }, toggle(c, on) { if (on === undefined ? !this.s.has(c) : on) this.s.add(c); else this.s.delete(c); }, add(c) { this.s.add(c); }, remove(...c) { c.forEach(x => this.s.delete(x)); } }, setAttribute() {} });
const document = { hidden: false, createElement: () => mkEl(), body: { appendChild() {} } };
const rp = { x: null, y: null, vx: 0, vy: 0 };
const tiltG = { on: false, asked: false }, tapS = { goal: null }, mzRt = { path: [[10, 10], [11, 10], [12, 10], [13, 10]] };
const howtoEl = { hidden: true }, demoLead = { x: 0, y: 0, tx: 0, ty: 0 }, G = { demo: true };
const active = true, meiroPause = false, worldMode = false, rollOn = true, driving = false;
const tiltBtnSync = () => {}, tiltBtnWanted = () => false, mazeOn = () => true, mapCovered = () => false, demoLeadAim = () => {}, $ = () => null, firstWalk = () => true;
const tapDemoSpot = () => ({ q: { x: 200, y: 300 }, up: false, side: '' });
const DEMO_HAND = { h: 60, move: 6, pad: 4, w: 38 }, DEMO_HAND1 = DEMO_HAND;
"""


def demo_src():
    return (DEMO_STUB + line("const DEMO_IDLE_MS = ") + line("const DEMO_WORLD_MS = ") + line("const DEMO_TAP_MS = ") + line("const DEMO_MOVE = ")
            + line("const tapDemo = {") + line("const DEMO_FAST_MS = ", "") + fn("tapDemoFresh", "") + fn("tapDemoTouch") + fn("tapDemoHide") + fn("tapDemoTick"))


class FreshDemo210(unittest.TestCase):
    def run_demo(self, tail):
        return node(demo_src() + "\nconst on = () => !!tapDemo.el && !tapDemo.el.hidden;\n" + tail)

    def test_first_demo_without_waiting(self):
        """開いて お米が 出た：聞かない 端末でも、次の 見回りで 手本（2秒 待たない）"""
        o = self.run_demo("rp.x = 31.5; rp.y = 31.5; T = 1650; tapDemoTick(); const a = on(); T = 1900; tapDemoTick();"
                          "console.log(JSON.stringify({ a, b: on() }))")
        self.assertEqual(o, {"a": True, "b": True}, "まだ 何も して いないのに、はじめての 手本を 2秒 待った: %r" % o)

    def test_after_touch_waits_two_seconds(self):
        """1度 さわった あとの 手本は これまでどおり 2秒（さわって すぐ・1.9秒では 出ない）"""
        o = self.run_demo("rp.x = 31.5; rp.y = 31.5; T = 1250; tapDemoTick(); const a = on(); T = 1300; tapDemoTouch();"
                          "T = 1500; tapDemoTick(); const b = on(); T = 3200; tapDemoTick(); const c = on(); T = 3350; tapDemoTick();"
                          "console.log(JSON.stringify({ a, b, c, d: on() }))")
        self.assertEqual(o, {"a": True, "b": False, "c": False, "d": True})

    def test_rolling_or_moved_waits(self):
        """開いて すぐ 傾けて 転がして いる：手本は 出ない。転がって 止まった あとは 2秒"""
        o = self.run_demo("rp.x = 31.5; rp.y = 31.5; T = 1250; rp.vx = 0.8; rp.x += 0.02; tapDemoTick(); const a = on();"
                          "T = 1500; rp.x += 0.4; tapDemoTick(); const b = on(); rp.vx = 0; T = 1750; tapDemoTick(); const c = on();"
                          "T = 3600; tapDemoTick(); console.log(JSON.stringify({ a, b, c, d: on() }))")
        self.assertEqual(o, {"a": False, "b": False, "c": False, "d": True})

    def test_still_needs_route_and_free_map(self):
        """道すじが まだ ない・歩いて いる 間は 出ない（これまでの きまり）"""
        o = self.run_demo("rp.x = 31.5; rp.y = 31.5; mzRt.path = null; T = 1250; tapDemoTick(); const a = on();"
                          "mzRt.path = [[10, 10], [11, 10]]; tapS.goal = [11, 10]; T = 1500; tapDemoTick(); const b = on();"
                          "tapS.goal = null; T = 1750; tapDemoTick(); console.log(JSON.stringify({ a, b, c: on() }))")
        self.assertEqual(o, {"a": False, "b": False, "c": True})


# 区画の 読みこみ（pump）：にせの loadChunk は 手で おわらせる。同時に 読んで いる 数の 最大を 数える
PUMP_STUB = """
const CHUNK = 128, PUMP_PAR = 3, queue = [];
let pumping = false, live = 0, top = 0, done = [];
const camTile = () => ({ x: 14 * CHUNK, y: 14 * CHUNK }), waits = [];
const loadChunk = (cx, cy) => new Promise(res => { live++; top = Math.max(top, live); waits.push(() => { live--; done.push(cx + '_' + cy); res(); }); });
const tick = () => new Promise(r => setTimeout(r, 0));
"""


def pump_src():
    return PUMP_STUB + line("let pumpLive = ", "") + fn("pump") + fn("pumpWorker", "")


class PumpPar210(unittest.TestCase):
    def test_added_one_by_one_reads_three_at_once(self):
        """区画が 1つずつ 足されても（見えて いる 所・めいろの 区域）、3つ まで 同時に 読む"""
        o = node(pump_src() + """
(async () => {
  for (const c of [[14, 14], [13, 14], [14, 15], [13, 15], [15, 14]]) { queue.push(c); pump(); await tick(); }
  const early = top;
  while (waits.length) { waits.shift()(); await tick(); }
  console.log(JSON.stringify({ early, top, n: done.length, left: queue.length }));
})();""")
        self.assertEqual(o["early"], 3, "区画を 1つずつ しか 読んで いない: %r" % o)
        self.assertEqual(o["top"], 3)
        self.assertEqual((o["n"], o["left"]), (5, 0))

    def test_limit_kept(self):
        """一度に たくさん 足しても、同時に 読むのは 3つ まで（通信の 数は ふやさない）"""
        o = node(pump_src() + """
(async () => {
  for (let i = 0; i < 9; i++) queue.push([10 + i, 14]);
  pump(); pump(); await tick(); pump();
  for (let i = 0; i < 4; i++) { queue.push([20 + i, 14]); pump(); await tick(); }
  const mid = top;
  while (waits.length) { waits.shift()(); await tick(); pump(); }
  console.log(JSON.stringify({ mid, top, n: done.length, uniq: new Set(done).size, left: queue.length }));
})();""")
        self.assertEqual(o, {"mid": 3, "top": 3, "n": 13, "uniq": 13, "left": 0})

    def test_limit_kept_after_first_round(self):
        """はじめの ワーカが 終わって（pumping が もどって）も、あとから ふやした ワーカが 読んで いる 間に 足された ときも 3つ まで"""
        o = node(pump_src() + """
(async () => {
  queue.push([1, 1]); pump(); await tick();
  queue.push([2, 1]); pump(); await tick();
  waits.shift()(); await tick(); await tick();
  for (let i = 0; i < 3; i++) queue.push([3 + i, 1]);
  pump(); await tick();
  const mid = top;
  while (waits.length) { waits.shift()(); await tick(); }
  console.log(JSON.stringify({ mid, top, n: done.length, left: queue.length }));
})();""")
        self.assertEqual(o, {"mid": 3, "top": 3, "n": 5, "left": 0})


class FastTickAfterHits210(unittest.TestCase):
    """PR #1136 の 指摘：速い 見回り（はじめての 手本）は、その こまの 絵の 当たり（特大の 名所・当店の 札・街の 建物）を 作り直した あとで 見る。
    こまの はじめで 見ると 当たりが からで、手本を 絵の 上に 置き、手本どおりに 押すと 説明の 窓が 開く（ふつうの 0.25秒の タイマーは こまの 途中に 割りこまない）"""
    def test_fast_tick_after_hits_rebuilt(self):
        f = fn("frame")
        call = "tapDemo.fastT = now; tapDemoTick();"
        self.assertEqual(f.count(call), 1)
        i = f.index(call)
        for reset in ("shopHits = [];", "giantHits = [];", "poiHits = [];"):
            self.assertLess(f.index(reset), i, reset)
        last = max(f.rfind("shopHits.push("), f.rfind("giantHits.push("), f.rfind("poiHits.push("))
        self.assertGreater(last, 0)
        self.assertGreater(i, last, "速い 見回りが、こまの 絵の 当たりを 作り直す 前に 走る")
        self.assertGreater(i, f.index("dirty = false;"), "速い 見回りは こまの さいご（絵を ぜんぶ 描いた あと）")
        self.assertIn("setInterval(tapDemoTick, 250);", PIX)   # ふつうの 見回りは かえない


class Rules210(unittest.TestCase):
    def test_owner_rules_kept(self):
        """許可は 最初の 本当の タップ（click）で だけ・1タップで 2回 聞かない・止まって いる 間の 手本は 2秒・見回りは 0.25秒"""
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)
        self.assertIn("setInterval(tapDemoTick, 250);", PIX)
        self.assertIn("const PUMP_PAR = 3;", PIX)
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", PIX)

    def test_playtest_item(self):
        self.assertIn("  firstDemoFast: '", PLAY)

    def test_doc(self):
        self.assertIn("サイクル210", DOC)


if __name__ == "__main__":
    unittest.main()
