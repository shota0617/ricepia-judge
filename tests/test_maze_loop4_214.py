"""第4弾サイクル214：歩けなかった タップ（お米を つんつん・自分の マス・道の ない 所）の あと、次の「タップ！」の 手本が 2秒 来なかった
（iPhone は ぶるっ も ない ので、タップして 何も 起きない 2秒）。→ 歩いた あとと 同じ 待ち（DEMO_TAP_MS 0.9秒）で 手本を 出す。
早めない：傾きの 許可を 聞いた その タップ・窓が 開く タップ・転がって いる 間（止まって から は これまでどおり）。
本物の tapWalk・demoMissTap・tapDemoTouch・tapDemoTick を、にせの 時計と 道具で 動かす（直す 前の ファイルで ふるまいで 落ちる）。"""
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


# 手本の 見回り（サイクル210 の テストと 同じ にせもの）＋ tapWalk の 道具。お米は (31.5, 31.5)。planPath は 道が ある か ない か を 選べる
STUB = """
let T = 1000;
const performance = { now: () => T };
const mkEl = () => ({ hidden: true, style: {}, classList: { s: new Set(), contains(c) { return this.s.has(c); }, toggle(c, on) { if (on === undefined ? !this.s.has(c) : on) this.s.add(c); else this.s.delete(c); }, add(c) { this.s.add(c); }, remove(...c) { c.forEach(x => this.s.delete(x)); } }, setAttribute() {} });
const document = { hidden: false, createElement: () => mkEl(), body: { appendChild() {} } };
const rp = { x: 31.5, y: 31.5, vx: 0, vy: 0 };
const tiltG = { on: false, asked: false, x: 0, y: 0 }, tapS = { goal: null, path: [], timer: null, due: 0 }, mzRt = { path: [[10, 10], [11, 10], [12, 10], [13, 10]] };
const howtoEl = { hidden: true }, demoLead = { x: 0, y: 0, tx: 0, ty: 0 }, G = { demo: true, notePlayInput() {}, npcs: [], toast() {} };
const active = true, meiroPause = false, worldMode = false, rollOn = true, driving = false;
const tiltBtnSync = () => {}, tiltBtnWanted = () => false, mazeOn = () => true, mapCovered = () => false, demoLeadAim = () => {}, $ = () => null, firstWalk = () => true;
const tapDemoSpot = () => ({ q: { x: 200, y: 300 }, up: false, side: '' });
const DEMO_HAND = { h: 60, move: 6, pad: 4, w: 38 }, DEMO_HAND1 = DEMO_HAND;
function tiltAsk() {}
const idleTouch = () => {}, tapWalkStop = () => { tapS.goal = null; tapS.path = []; }, tapWalkTick = () => {};
const targetTile = () => ({ x: rp.x, y: rp.y }), MZ_K = 3, mzType = () => 0, BLOCK = new Set(), codeAt = () => 0, npcTile = n => n;
let hasPath = false, vib = 0; const navigator = { vibrate() { vib++; } };
const planPath = (sx, sy, gx, gy) => (hasPath ? [[gx, gy]] : []);
const TAP_TILT_OVER = 0.75, mzSoft = { on: false, x: 0, y: 0 };
"""


def src():
    return (STUB + line("const DEMO_IDLE_MS = ") + line("const DEMO_WORLD_MS = ") + line("const DEMO_TAP_MS = ") + line("const DEMO_MOVE = ")
            + line("const tapDemo = {") + line("const DEMO_FAST_MS = ", "") + fn("tapDemoFresh", "") + fn("demoMissTap", "")
            + fn("tapDemoTouch") + fn("tapDemoHide") + fn("tapDemoTick") + fn("tapWalk"))


# 止まって 手本が 出て いる 所から：T=10000 に 指を おろし（tapDemoTouch）、そのまま tapWalk(gx, gy)。手本が 出る 時刻を 250ms おきの 見回りで さがす
RUN = """
tapDemo.fresh = false; tapDemo.walked = false; rp.x = 31.5; rp.y = 31.5;
T = 6000; tapDemoTick(); T = 8250; tapDemoTick();   // 止まって 2秒：手本が 出る
const on = () => !!tapDemo.el && !tapDemo.el.hidden;
const shown0 = on();
T = 10000; tapDemoTouch(); %s
let at = null; for (let t = 10000; t <= 13000; t += 250) { T = t; %s tapDemoTick(); if (on() && at === null) at = t - 10000; }
console.log(JSON.stringify({ shown0, at, vib }));
"""


class MissTapDemo214(unittest.TestCase):
    def run_case(self, act, during=""):
        return node(src() + RUN % (act, during))

    def test_no_path_tap_quick_demo(self):
        """道の ない 所を タップ（tapWalk が false）：次の 手本は 0.9秒 ほど（2秒 待たない）。ぶるっ は これまでどおり"""
        o = self.run_case("const ok = tapWalk(50, 50);")
        self.assertTrue(o["shown0"])
        self.assertEqual(o["vib"], 1)
        self.assertIsNotNone(o["at"])
        self.assertLessEqual(o["at"], 1250, "歩けなかった タップの あと 手本が 2秒 来ない: %r" % o)
        self.assertGreaterEqual(o["at"], 900)

    def test_own_cell_tap_quick_demo(self):
        """自分の マスを タップ（sx === gx）：次の 手本は 0.9秒 ほど"""
        o = self.run_case("tapWalk(31, 31);")
        self.assertIsNotNone(o["at"])
        self.assertLessEqual(o["at"], 1250, "自分の マスの タップの あと 手本が 2秒 来ない: %r" % o)

    def test_permission_tap_unchanged(self):
        """傾きの 許可を 聞いた その タップ（tiltAsk の すぐ あと）は これまでどおり 2秒"""
        o = self.run_case("tiltAsk.at = T; tapWalk(50, 50);")
        self.assertGreaterEqual(o["at"], 2000)

    def test_permission_tap_after_a_miss_unchanged(self):
        """レビューの 指摘: 先に 歩けなかった なぞり（許可は 聞かない）→ その あと 許可を 聞く タップ。短い 待ちを 持ちこさず、これまでどおり 2秒"""
        o = self.run_case("tapWalk(50, 50); tiltAsk.at = T; tapWalk(50, 50);")
        self.assertGreaterEqual(o["at"], 2000, "許可を 聞いた タップの あと 手本が 早く 出た: %r" % o)

    def test_rolling_after_miss_unchanged(self):
        """歩けなかった あと 傾きで 転がった：止まって から 2秒（これまでどおり）"""
        o = self.run_case("tapWalk(50, 50);", "if (t <= 10750) { rp.x += 0.3; }")
        self.assertGreaterEqual(o["at"], 2750)

    def test_walk_tap_unchanged(self):
        """歩けた タップ：手本は 歩いて いる 間 出ない（tapS.goal）"""
        o = self.run_case("hasPath = true; tapWalk(33, 31);")
        self.assertIsNone(o["at"])


class Rules214(unittest.TestCase):
    def test_owner_rules_kept(self):
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", PIX)
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)
        self.assertIn("const DEMO_TAP_MS = 900, DEMO_AHEAD = 3;", PIX)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertNotIn("demoMissTap", fn("tiltFirstTouch"))

    def test_playtest_and_doc(self):
        self.assertIn("  missTapDemo: '", PLAY)
        self.assertIn("サイクル214", DOC)


if __name__ == "__main__":
    unittest.main()
