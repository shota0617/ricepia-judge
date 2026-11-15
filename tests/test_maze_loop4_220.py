"""第4弾サイクル220（設計の 案 N-e）：ゴールに 着いた しゅんかんに お米が 止まらず、紙ふぶきが 同じ こまに 出て、お米は つぎの 1歩へ 進んで いた（はかった：
ゴールの こまから 0.11秒で もう 1歩）。かべには 止め（45ms）が あるが ゴールには 無い。→ ゴールでは お米を 0.1秒 止めて から 紙ふぶき・★・「ついた〜！」。
本物の mzGoalFx・drawMzFx・tapWalkTick・tapDemoTick を、にせの 時計と 道具で 動かす（直す 前の ファイルで ふるまいで 落ちる）。
(a) 止める（mzHitStop が 0.09〜0.12秒 先）・紙ふぶきと ★は 止めの あと（長さは そのまま）
(b)「動きを へらす」の 人・窓が 開いて いる ときは 止めない（紙ふぶきは 今の まま すぐ）
(c) 止めの 間は 紙ふぶき・★を 描かない（★を 消しも しない）。止めの あとは 描く
(d) 止めの 間に タップの 歩きの 1歩が 来ても 落とさない（道を のこして 止めの あとに ふむ）
(e) 止めの 間は 手本を 出さない。つぎの 手本の 待ちは さいごに 動いて から 0.9秒 の まま（のばさない・縮めない。サイクル220b：待ちから 引く しくみは 取った）
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


def tap_src():
    return (BASE + line("const MZ_GOAL_STOP_MS", "") + line("const mzGoalStop = ", "") + line("const TAP_STEP_MS = ") + """
const tapDemo = { walkT: 0 }, tapS = { path: [], timer: null, due: 0, goal: null }, G = { demo: true, spots: [] }, active = true, worldMode = false, driving = false;
let pos = { x: 5, y: 5 }, steps = []; const targetTile = () => ({ x: pos.x + 0.5, y: pos.y + 0.5 });
const step = d => { pos = { x: pos.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), y: pos.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0) }; steps.push([T, d]); return true; };
const tapWalkStop = () => { tapS.timer = null; tapS.path = []; tapS.goal = null; };
const timers = []; const setTimeout = (f, ms) => { timers.push([T + ms, f]); return timers.length; }, clearTimeout = () => {};
const mzSpringShot = () => {}, mzHelpGoal = () => {}, mzGoalAsk = { id: '', at: 0 };
""" + line("const mzFx = [], mzBanner") + line("const MZ_GOAL_FX = ") + fn("mzGoalHold", "") + fn("mzGoalFx") + fn("tapWalkTick"))



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
mzHitStop = 10100; if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 10000, until: 10100 });
tapS.path = [[6, 5], [7, 5]]; tapS.goal = [7, 5]; tapS.due = 10040;
T = 10040; tapWalkTick();
const during = { steps: steps.length, left: tapS.path.length, goal: !!tapS.goal, wake: timers.length ? timers[timers.length - 1][0] : null };
T = during.wake || 10300; const f = timers.pop(); if (f) f[1]();
console.log(JSON.stringify({ during, after: steps.map(s => s[0]) }));""")
        self.assertEqual(o["during"]["steps"], 0, "止めの 間に 1歩 ふんだ: %r" % o)
        self.assertEqual(o["during"]["left"], 2, "止めの 間の 歩きを 落とした: %r" % o)
        self.assertTrue(o["during"]["goal"])
        self.assertEqual(o["during"]["wake"], 10100)
        self.assertEqual(o["after"], [10100])

    def test_e_demo_not_during_stop_and_not_later(self):
        stub = (ROOT / "tests" / "test_maze_loop4_214.py").read_text(encoding="utf-8")
        k = stub.index('STUB = """') + len('STUB = """')
        STUB = stub[k:stub.index('"""', k)]
        src = (STUB + "let mzHitStop = 0;\n" + line("const MZ_GOAL_STOP_MS", "") + line("const mzGoalStop = ", "")
               + line("const DEMO_IDLE_MS = ") + line("const DEMO_WORLD_MS = ") + line("const DEMO_TAP_MS = ") + line("const DEMO_MOVE = ")
               + line("const tapDemo = {") + line("const DEMO_FAST_MS = ", "") + fn("tapDemoFresh", "") + fn("tapDemoHide") + fn("tapDemoTick"))
        o = node(src + """
const on = () => !!tapDemo.el && !tapDemo.el.hidden;
// 1) 止めの 間：止まって 2秒 たって いても 出さない
tapDemo.fresh = false; tapDemo.walked = false; T = 6000; tapDemoTick(); T = 9000; tapDemoTick();
if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 9000, until: 9100 });
T = 9050; tapDemo.el && (tapDemo.el.hidden = true); tapDemoTick(); const during = on();
T = 9150; tapDemoTick(); const after = on();
// 2) 歩いて ゴール → 止めで 最後の 1歩が 60ms おくれた：手本は、さいごに 動いた 時刻から 止め なしの ときと 同じ 0.9秒（止めの ほかに のばさない）
const run = shift => {
  tapDemoHide(); tapDemo.walked = false; rp.x = 31.5; rp.y = 31.5; T = 20000; tapDemoTick();
  if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 20000, until: 20100 });
  tapDemo.walkT = 20000 + shift; T = 20000 + shift; rp.x = 32.5; tapDemoTick();   // 最後の 1歩（止めで shift ぶん おそい）
  for (let t = T + 10; t <= 23000; t += 10) { T = t; tapDemoTick(); if (on()) return t - (20000 + shift); }
  return null;
};
const plain = run(0), held = run(60);
console.log(JSON.stringify({ during, after, plain, held }));""")
        self.assertFalse(o["during"], "止めの 間に 手本を 出した: %r" % o)
        self.assertTrue(o["after"])
        self.assertEqual(o["plain"], 900)
        self.assertEqual(o["held"], 900, "止めの ほかに 手本の 待ちが 変わった: %r" % o)

    def test_g_landmark_picture_kept(self):
        """見直し P1：goal(id) で 名所と 確かめた すぐ あとの goalFx で、大きな 名所の 絵（gid）が 出る（止めが 効く 人でも）"""
        o = node(goal_src() + """
G.spots.push({ id: 'castle' }); mzGoalAsk.id = 'castle'; mzGoalAsk.at = T; rp.vx = 2; mzGoalFx('');
console.log(JSON.stringify({ gid: mzBanner.gid, stop: mzHitStop - T }));""")
        self.assertEqual(o["gid"], "castle", "止めの せいで 名所の 絵が 出ない: %r" % o)
        self.assertGreaterEqual(o["stop"], 90)

    def test_h_wall_stop_does_not_hold_tap(self):
        """見直し P3：かべの 止め（45ms）の 間の タップの 歩きは 待たせない（ゴールの 止め だけ 待つ）"""
        o = node(tap_src() + """
mzHitStop = T + 45;   // かべに 当たった すぐ あと
tapS.path = [[6, 5], [7, 5]]; tapS.goal = [7, 5]; tapS.due = T; tapWalkTick();
console.log(JSON.stringify({ steps: steps.map(q => q[0] - 10000) }));""")
        self.assertEqual(o["steps"], [0], "かべの 止めで 歩きを 待たせた: %r" % o)

    def test_i_wall_then_goal_overlap(self):
        """かべの 止めの 間に ゴール：止めは ゴールの 長さ（100ms）まで のびる。歩きは その あとに 1歩 ふむ（落とさない）"""
        o = node(tap_src() + """
mzHitStop = T + 45; rp.vx = 2; mzGoalFx('');
const stop = mzHitStop - T, same = mzGoalStop.until === mzHitStop;
tapS.path = [[6, 5], [7, 5]]; tapS.goal = [7, 5]; tapS.due = T + 50; T += 50; tapWalkTick();
const during = steps.length; const f = timers.pop(); T = f[0]; f[1]();
console.log(JSON.stringify({ stop, same, during, after: steps.map(q => q[0] - 10000) }));""")
        self.assertEqual(o, {"stop": 100, "same": True, "during": 0, "after": [100]})

    def test_j_wait_not_shortened_after_stop(self):
        """見直し P3：ゴールの 止めの あとの 動きでも「歩いた あと 0.9秒」を 縮めない（前は 止めから 3秒 以内の 動きは 毎回 0.06秒 縮んだ）"""
        stub = (ROOT / "tests" / "test_maze_loop4_214.py").read_text(encoding="utf-8")
        k = stub.index('STUB = """') + len('STUB = """')
        STUB = stub[k:stub.index('"""', k)]
        src = (STUB + "let mzHitStop = 0;\n" + line("const MZ_GOAL_STOP_MS", "") + line("const mzGoalStop = ", "") + fn("mzGoalCredit", "")
               + line("const DEMO_IDLE_MS = ") + line("const DEMO_WORLD_MS = ") + line("const DEMO_TAP_MS = ") + line("const DEMO_MOVE = ")
               + line("const tapDemo = {") + line("const DEMO_FAST_MS = ", "") + fn("tapDemoFresh", "") + fn("tapDemoHide") + fn("tapDemoTick"))
        o = node(src + """
const on = () => !!tapDemo.el && !tapDemo.el.hidden;
tapDemo.fresh = false; tapDemo.walked = false; T = 20000; tapDemoTick();
Object.assign(mzGoalStop, { at: 20000, until: 20100, shift: 60 });   // 直す 前の 形（shift あり）でも 同じ 所から
tapDemo.walkT = 20160; T = 20160; rp.x = 32.5; tapDemoTick();   // 止めの あとの 最後の 1歩
for (T = 20170; T <= 20400; T += 10) tapDemoTick();   // 止まった（ここで 使いきる）
tapDemoHide(); tapDemo.walkT = 21000; T = 21000; rp.x = 33.5; tapDemoTick();   // 1秒 あとに また 歩いた（止めとは かかわりない 動き）
let at = null; for (T = 21010; T <= 23000; T += 10) { tapDemoTick(); if (on()) { at = T - 21000; break; } }
console.log(JSON.stringify({ at }));""")
        self.assertEqual(o["at"], 900, "あとの 動きの 待ちまで 縮めた: %r" % o)

    def test_k_no_stop_clears_old_values(self):
        """見直し P3：止めない ゴール（動きを へらす・窓）は、前の ゴールの 止めの 値を のこさない"""
        o = node(goal_src() + """
if (typeof mzGoalStop === 'object') Object.assign(mzGoalStop, { at: 5000, until: 5100 });
calmMotion = true; mzGoalFx('');
console.log(JSON.stringify(typeof mzGoalStop === 'object' ? mzGoalStop : null));""")
        self.assertEqual({k: o[k] for k in ("at", "until")}, {"at": 0, "until": 0})

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
