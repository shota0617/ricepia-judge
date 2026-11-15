"""第4弾サイクル220（設計の 案 N-e）：ゴールに 着いた しゅんかんに お米が 止まらず、紙ふぶきが 同じ こまに 出て、お米は つぎの 1歩へ 進んで いた（はかった：
ゴールの こまから 0.11秒で もう 1歩）。かべには 止め（45ms）が あるが ゴールには 無い。→ ゴールでは お米を 0.1秒 止めて から 紙ふぶき・★・「ついた〜！」。
本物の mzGoalFx・drawMzFx・tapWalkTick・tapDemoTick を、にせの 時計と 道具で 動かす（直す 前の ファイルで ふるまいで 落ちる）。
(a) 止める（mzHitStop が 0.09〜0.12秒 先）・紙ふぶきと ★は 止めの あと（長さは そのまま）
(b)「動きを へらす」の 人・窓が 開いて いる ときは 止めない（紙ふぶきは 今の まま すぐ）
(c) 止めの 間は 紙ふぶき・★を 描かない（★を 消しも しない）。止めの あとは 描く
(d) 止めの 間に タップの 歩きの 1歩が 来ても 落とさない（道を のこして 止めの あとに ふむ）。おくれた ぶんを おぼえる
(e) 止めの 間は 手本を 出さない。止めで おくれた ぶん、つぎの 手本は 早く 出る（止めの ぶん おそく ならない）
(f) 運営者が 決めた こと（着いた ときの カードなし・始まりの 画面なし）に ふれない。かべの 止めは そのまま"""
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


BASE = """
let T = 10000;
const performance = { now: () => T };
let calmMotion = false, covered = false;
const mapCovered = () => covered;
const rp = { x: 31.5, y: 31.5, vx: 0, vy: 0 };
let mzHitStop = 0;
"""
GOAL = """
const mzSpringShot = () => {}, mzHelpGoal = () => {}, mzGoalAsk = { id: '', at: 0 }, G = { spots: [] };
""" + line("const mzFx = [], mzBanner") + line("const MZ_GOAL_FX = ")


def goal_src():
    return BASE + GOAL + line("const MZ_GOAL_STOP_MS", "") + line("const mzGoalStop = ", "") + fn("mzGoalHold", "") + fn("mzGoalFx")


class GoalStop220(unittest.TestCase):
    def test_a_stop_then_confetti(self):
        o = node(goal_src() + """
rp.vx = 2; mzGoalFx('');
console.log(JSON.stringify({ stop: mzHitStop - T, fx0: Math.min(...mzFx.map(p => p.t0)) - T, n: mzFx.length, banner: mzBanner.t0 - T, life: Math.max(...mzFx.map(p => p.life)) }));""")
        self.assertGreaterEqual(o["stop"], 90, "ゴールで お米を 止めて いない: %r" % o)
        self.assertLessEqual(o["stop"], 120, o)
        self.assertEqual(o["fx0"], o["stop"], "紙ふぶきが 止めの あとで ない: %r" % o)
        self.assertEqual(o["banner"], o["stop"], o)
        self.assertEqual(o["n"], 24)
        self.assertLessEqual(o["life"], 1.1)   # 紙ふぶきの 長さは そのまま

    def test_b_calm_or_covered_no_stop(self):
        for setup in ["calmMotion = true;", "covered = true;"]:
            o = node(goal_src() + setup + """
rp.vx = 2; mzGoalFx('');
console.log(JSON.stringify({ stop: mzHitStop, fx0: Math.min(...mzFx.map(p => p.t0)) - T, banner: mzBanner.t0 - T }));""")
            self.assertEqual(o, {"stop": 0, "fx0": 0, "banner": 0}, setup)

    def test_c_nothing_drawn_during_stop(self):
        o = node(goal_src() + fn("drawMzFx") + """
let rects = 0, texts = 0; const ctx = { globalAlpha: 1, fillRect() { rects++; }, strokeText() { texts++; }, fillText() { texts++; }, drawImage() {} };
const riceSay = () => { texts++; }, giantOf = () => null, spriteOf = () => null;
rp.vx = 2; mzGoalFx('');
const draw = () => { rects = 0; texts = 0; drawMzFx(390, 400, 16, T, 16); return [rects, texts, mzBanner.t0 > 0]; };
T = 10050; const during = draw();
T = 10150; const after = draw();
console.log(JSON.stringify({ during, after }));""")
        self.assertEqual(o["during"], [0, 0, True], "止めの 間に 紙ふぶき・★を 描いた（か ★を 消した）: %r" % o)
        self.assertGreater(o["after"][0], 20)
        self.assertGreater(o["after"][1], 0)

    def test_d_tap_step_waits_not_dropped(self):
        o = node(BASE + line("const MZ_GOAL_STOP_MS", "") + line("const mzGoalStop = ", "") + line("const TAP_STEP_MS = ") + """
const tapDemo = { walkT: 0 }, tapS = { path: [], timer: null, due: 0, goal: null }, G = { demo: true }, active = true, worldMode = false, driving = false;
let pos = { x: 5, y: 5 }, steps = []; const targetTile = () => ({ x: pos.x + 0.5, y: pos.y + 0.5 });
const step = d => { pos = { x: pos.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), y: pos.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0) }; steps.push([T, d]); return true; };
const tapWalkStop = () => { tapS.timer = null; tapS.path = []; tapS.goal = null; };
const timers = []; const setTimeout = (f, ms) => { timers.push([T + ms, f]); return timers.length; }, clearTimeout = () => {};
""" + fn("tapWalkTick") + """
// ゴールの 止め（10000〜10100）の 間に 次の 1歩の 時刻が 来た（10040）
mzHitStop = 10100; if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 10000, until: 10100, shift: 0 });
tapS.path = [[6, 5], [7, 5]]; tapS.goal = [7, 5]; tapS.due = 10040;
T = 10040; tapWalkTick();
const during = { steps: steps.length, left: tapS.path.length, goal: !!tapS.goal, wake: timers.length ? timers[timers.length - 1][0] : null };
T = during.wake || 10300; const f = timers.pop(); if (f) f[1]();
console.log(JSON.stringify({ during, after: steps.map(s => s[0]), shift: typeof mzGoalStop === 'object' ? mzGoalStop.shift : null }));""")
        self.assertEqual(o["during"]["steps"], 0, "止めの 間に 1歩 ふんだ: %r" % o)
        self.assertEqual(o["during"]["left"], 2, "止めの 間の 歩きを 落とした: %r" % o)
        self.assertTrue(o["during"]["goal"])
        self.assertEqual(o["during"]["wake"], 10100)
        self.assertEqual(o["after"], [10100])
        self.assertEqual(o["shift"], 60)

    def test_e_demo_not_during_stop_and_not_later(self):
        stub = (ROOT / "tests" / "test_maze_loop4_214.py").read_text(encoding="utf-8")
        k = stub.index('STUB = """') + len('STUB = """')
        STUB = stub[k:stub.index('"""', k)]
        src = (STUB + "let mzHitStop = 0;\n" + line("const MZ_GOAL_STOP_MS", "") + line("const mzGoalStop = ", "") + fn("mzGoalCredit", "")
               + line("const DEMO_IDLE_MS = ") + line("const DEMO_WORLD_MS = ") + line("const DEMO_TAP_MS = ") + line("const DEMO_MOVE = ")
               + line("const tapDemo = {") + line("const DEMO_FAST_MS = ", "") + fn("tapDemoFresh", "") + fn("tapDemoHide") + fn("tapDemoTick"))
        o = node(src + """
const on = () => !!tapDemo.el && !tapDemo.el.hidden;
// 1) 止めの 間：止まって 2秒 たって いても 出さない
tapDemo.fresh = false; tapDemo.walked = false; T = 6000; tapDemoTick(); T = 9000; tapDemoTick();
if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 9000, until: 9100, shift: 0 });
T = 9050; tapDemo.el && (tapDemo.el.hidden = true); tapDemoTick(); const during = on();
T = 9150; tapDemoTick(); const after = on();
// 2) 歩いて ゴール → 止めで 最後の 1歩が 60ms おくれた：手本は 止め なしの ときと 同じ 時刻（さいごに 動いた 時刻 + 0.9秒）
const run = shift => {
  tapDemoHide(); tapDemo.walked = false; rp.x = 31.5; rp.y = 31.5; T = 20000; tapDemoTick();
  if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 20000, until: 20100, shift });
  tapDemo.walkT = 20000 + shift; T = 20000 + shift; rp.x = 32.5; tapDemoTick();   // 最後の 1歩（止めで shift ぶん おそい）
  for (let t = T + 10; t <= 23000; t += 10) { T = t; tapDemoTick(); if (on()) return t - (20000 + shift); }
  return null;
};
const plain = run(0), held = run(60);
console.log(JSON.stringify({ during, after, plain, held }));""")
        self.assertFalse(o["during"], "止めの 間に 手本を 出した: %r" % o)
        self.assertTrue(o["after"])
        self.assertEqual(o["plain"], 900)
        self.assertEqual(o["held"], 900 - 60, "止めの ぶん 手本が おそく なった: %r" % o)

    def test_f_rules_kept(self):
        self.assertIn("const MZ_HIT_STOP = 5, MZ_HIT_STOP_MS = 45;", PIX)   # かべの 止めは そのまま
        self.assertIn("if (!mzSoft.on && vn > MZ_HIT_STOP && !calmMotion) mzHitStop = performance.now() + MZ_HIT_STOP_MS;", PIX)
        self.assertIn("if (howtoEl.hidden && performance.now() >= mzHitStop) for (let rem = dt;", PIX)   # 止めて いる 間は 転がさない（画面は 描く）
        g = fn("mzGoalFx")
        for w in ["openCard", "arriveCard", "showCard", "intro"]:
            self.assertNotIn(w, g)
        self.assertIn("サイクル220", DOC)


if __name__ == "__main__":
    unittest.main()
