"""第4弾サイクル206：はじめの 1分で やめる 人を へらす（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」・2026-11-11「最初の1分の改善はこのやり方に変更」）。
(1) おそい スマホ：絵を 描くのに 手いっぱいで タイマーが おくれても、タップ・なぞりで 歩く お米の 1歩は 0.18秒おき。
(2) さがし役が 見つけた 欠陥：歩きの 大きな はね・こまが おそいと お米が 消える・とちゅうで ためらう なぞり・置いた まま の 指・
    傾きの ふるえで 手本が 出ない・小さな 傾きが 歩きを 取り消す・ぎりぎりの 手本・縁の 矢印と 道すじ・小さい 画面の「とじる」・字の スタイルシート・かくれた あとの 傾き。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")

HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")

FRAME_LINE = "  if (tapS.timer && performance.now() >= tapS.due) { clearTimeout(tapS.timer); tapWalkTick(); }"


def fn(name):
    i = PIX.index("function %s(" % name)
    return PIX[i:PIX.index("\n}\n", i) + 2]


def line(start):
    i = PIX.index(start)
    return PIX[i:PIX.index("\n", i) + 1]


def node(code):
    return json.loads(subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout)


# にせの 時計と タイマー：late（ms）だけ おくれて 鳴る。frameMs が あれば、その 間ごとに 絵を 描く こま（frame の 1行）も 回す
STUB = """
let T = 1000, pos = [0, 0], seq = 0;
const performance = { now: () => T }, timers = new Map(), steps = [];
const setTimeout = (f, ms) => { timers.set(++seq, { f, at: T + ms, ms }); return seq; }, clearTimeout = id => { timers.delete(id); };
const G = { demo: true }, tapDemo = { walkT: 0 }, tapS = { path: [], timer: null, goal: null, due: 0 };
const active = true, worldMode = false, driving = false, mapCovered = () => false;
const targetTile = () => ({ x: pos[0] + 0.5, y: pos[1] + 0.5 });
const step = dir => { pos = [pos[0] + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), pos[1] + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0)]; steps.push(T); return true; };
function start(n) { tapS.path = []; for (let i = 1; i <= n; i++) tapS.path.push([pos[0] + i, pos[1]]); tapS.goal = tapS.path[n - 1]; tapS.due = performance.now(); tapWalkTick(); }
function run(late, frameMs, until) {   // late：数 か、(何回目) => 数
  let n = 0, nextFrame = T + (frameMs || 0);
  while (tapS.goal && T < until) {
    const t = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    const fireAt = t ? t[1].at + (typeof late === 'function' ? late(n) : late) : Infinity;
    if (frameMs && nextFrame <= fireAt) { T = nextFrame; nextFrame += frameMs; frame(); continue; }
    if (!t) break;
    T = Math.max(T, fireAt); timers.delete(t[0]); n++; t[1].f();
  }
  return steps.slice(1).map((s, i) => s - steps[i]);
}
"""


class TapStepPace206(unittest.TestCase):
    def run_js(self, tail):
        src = STUB + line("const TAP_STEP_MS = ") + line("function tapWalkStop() {") + fn("tapWalkTick") + "function frame() {\n" + FRAME_LINE + "\n}\n"
        return node(src + tail)

    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_on_time_is_180(self):
        """タイマーが おくれない スマホ：これまでどおり 1歩 0.18秒"""
        r = self.run_js("start(8); console.log(JSON.stringify(run(0, 0, 1e5)))")
        self.assertEqual(r, [180] * 7)

    def test_late_timer_is_caught_up(self):
        """タイマーが 毎回 0.1秒 おくれる：はじめの 1歩ぶんだけ おくれ、あとは 0.18秒おき（直す 前は 0.28秒おき）"""
        r = self.run_js("start(8); console.log(JSON.stringify(run(100, 0, 1e5)))")
        self.assertEqual(r, [280] + [180] * 6)

    def test_frame_steps_when_timer_starves(self):
        """タイマーが 0.4秒 おくれても、絵を 描く こま（0.1秒おき）で 次の 1歩を ふむ：1歩 0.2秒 まで（直す 前は 0.58秒）"""
        r = self.run_js("start(10); const g = run(400, 100, 1e5); console.log(JSON.stringify({ g, left: timers.size, goal: tapS.goal }))")
        self.assertEqual(len(r["g"]), 9)
        self.assertLessEqual(max(r["g"]), 200)
        self.assertGreaterEqual(min(r["g"]), 100)
        self.assertLessEqual(sum(r["g"]) / 9, 190)
        self.assertEqual(r["left"], 0)   # 着いたら タイマーは のこらない
        self.assertIsNone(r["goal"])

    def test_one_step_at_a_time_after_a_stall(self):
        """長く 止まった あと（5秒）：まとめて 歩かない。とりもどすのは 次の 1歩ぶん（0.06秒）だけ、あとは 0.18秒おき"""
        r = self.run_js("start(8); console.log(JSON.stringify(run(n => n === 2 ? 5000 : 0, 0, 1e6)))")
        self.assertEqual(r[:2], [180, 180])
        self.assertEqual(r[2], 5180)
        self.assertEqual(r[3], 60)
        self.assertEqual(r[4:], [180, 180, 180])

    def test_frame_does_nothing_when_not_walking(self):
        """歩いて いない 間・時刻が 来る 前は、こまは 何も しない"""
        r = self.run_js("frame(); const a = steps.length; start(5); T += 100; frame(); const b = steps.length; T += 100; frame(); const c = steps.length; tapWalkStop(); T += 1000; frame();"
                        "console.log(JSON.stringify({ a, b, c, d: steps.length, timer: tapS.timer }))")
        self.assertEqual(r, {"a": 0, "b": 1, "c": 2, "d": 2, "timer": None})

    def test_source(self):
        self.assertIn("const TAP_STEP_MS = 180, TAP_STEP_MIN = 60;", PIX)
        self.assertIn("const tapS = { path: [], timer: null, goal: null, due: 0 };", PIX)
        t = fn("tapWalkTick")
        self.assertIn("tapS.due = Math.max((tapS.due || now) + gap, now + Math.min(gap, TAP_STEP_MIN));", t)
        self.assertIn("tapS.timer = setTimeout(tapWalkTick, tapS.due - now);", t)
        self.assertIn("G.autoInterval ? Math.min(TAP_STEP_MS, G.autoInterval()) : TAP_STEP_MS", t)   # 速さの 強化は これまでどおり
        w = fn("tapWalk")
        self.assertLess(w.index("tapS.due = performance.now();"), w.index("tapWalkTick();"))   # 新しい 歩きは おくれを 持ちこさない
        f = fn("frame")
        self.assertIn(FRAME_LINE, f)
        self.assertLess(f.index("if (meiroPause) { lastT = 0; return; }"), f.index(FRAME_LINE))   # 盤の めいろの 間は うしろの 地図を 動かさない
        self.assertIn("tapStepCfg: { ms: TAP_STEP_MS, min: TAP_STEP_MIN }", PIX)

    def test_owner_rules_kept(self):
        """許可・手本・なぞり・長押しには さわらない"""
        t = fn("tapWalkTick")
        self.assertIn("tapDemo.walkT = performance.now();", t)   # サイクル198
        self.assertIn("mapCovered(false, true)", t)
        self.assertIn("const SWIPE_HOLD_MS = 300, SWIPE_HOLD_PX = 5;", PIX)
        self.assertIn("clearTimeout(swipeS.timer); swipeS.timer = setTimeout(swipeHold, SWIPE_HOLD_MS);", PIX)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("if (event.type === 'touchend') return;", PIX)
        self.assertIn("const first = tiltBtnWanted() && !tiltG.asked;", PIX)
        self.assertIn("const DEMO_TAP_MS = 900, DEMO_AHEAD = 3;", PIX)
        self.assertIn("setInterval(tapDemoTick, 250);", PIX)

    def test_playtest_and_doc(self):
        self.assertIn("tapStepPace: { ...(sw.pace || { why: 'no-route' }), ok: !!sw.paceOk }", PLAY)
        self.assertIn("  tapStepPace: '", PLAY)
        self.assertIn("- サイクル206：", DOC)


def block(head, tail):
    i = PIX.index(head)
    return PIX[i:PIX.index(tail, i)]


class Feel206(unittest.TestCase):
    """M1/K2：歩きの はねる 高さが こま数で 決まらない。M2/K1：つぶれの ばねが こわれない"""

    SRC = None

    def js(self, tail):
        src = line("const FEEL_V_MAX = ") + fn("feelSpeed") + line("const SQ_STEP = ") + fn("squashSpring")
        return node(src + tail)

    def test_step_speed_is_the_same_at_every_frame_rate(self):
        """1マスの 1歩（0.18秒おき）：どの こま数でも 速さは FEEL_V_MAX（6マス/秒）まで・速さ×時間の 合計は 歩いた 道のり・1歩は 約0.17秒ぶん"""
        r = self.js("""
const out = {};
for (const [name, pat] of [['30', [1000 / 30]], ['60', [1000 / 60]], ['120', [1000 / 120]], ['144', [1000 / 144]], ['irr', [8, 40]], ['hitch', [16.7, 16.7, 16.7, 85]], ['slow', [100]]]) {
  const st = { carry: 0 }; let T = 0, next = 0, n = 0, vmax = 0, sum = 0, fast = 0, steps = 0;
  while (T < 5400) { const ms = pat[n++ % pat.length], dt = Math.min(0.1, ms / 1000); T += ms; let d = 0; while (next <= T && steps < 20) { d += 1; next += 180; steps++; }
    const v = feelSpeed(st, d, dt); vmax = Math.max(vmax, v); sum += v * dt; if (v > 5.9) fast += dt; }
  out[name] = { vmax, sum: +sum.toFixed(3), fast: +(fast / steps).toFixed(3), carry: st.carry, steps };
}
console.log(JSON.stringify(out));""")
        for k, o in r.items():
            self.assertLessEqual(o["vmax"], 6, k)
            self.assertEqual(o["steps"], 20, k)
            self.assertAlmostEqual(o["sum"], 20, delta=0.05, msg=k)   # 道のりは へらない・ふえない
            self.assertEqual(o["carry"], 0, k)
            self.assertGreaterEqual(o["fast"], 0.10, k)   # 1歩は 6マス/秒で 0.17秒ぶん（こまの 切れ目の ぶんだけ ずれる）
            self.assertLessEqual(o["fast"], 0.17, k)

    def test_hop_height_is_small(self):
        """はねる 強さ＝2.2＋(速さ−HOP_V)×0.4、落ちる 速さ 22：速さ 6 なら 高さ 0.17マス（直す 前は 60fps で 13マス・120fps で 53マス）"""
        f = fn("riceFeel")
        self.assertIn("roll.hv = (2.2 + (speed - hopV) * 0.4) * (KP.hopPow || 1); roll.h = 0.001; roll.kind = 'hop';", f)
        self.assertIn("roll.hv -= 22 * (KP.grav || 1) * dt; roll.h += roll.hv * dt;", f)
        self.assertIn("const WADDLE_V = 1.1, HOP_V = 4.6;", PIX)
        h = lambda v: (2.2 + (v - 4.6) * 0.4) ** 2 / 44
        self.assertLess(h(6), 0.2)
        self.assertGreater(h(60), 13)   # 直す 前：1マス ÷ 1/60秒
        s = fn("riceSpin")
        self.assertIn("const d = Math.hypot(dx, dy), v = feelSpeed(roll, d, dt), ft = Math.max(dt, 1e-3, d < 3 ? d / FEEL_V_MAX : 0);", s)
        self.assertIn("riceFeel(dt, v);", s)
        self.assertIn("roll.av = adv.dAng / ft; roll.pv = adv.dPitch / ft;", s)
        self.assertNotIn("v = d / Math.max(dt, 1e-3)", s)

    def test_rolling_speed_is_unchanged(self):
        """傾きの 転がり（いちばん 速くて 4.2マス/秒）は これまでと 同じ 数（道のり ÷ 時間。1ビットも ちがわない）"""
        r = self.js("""
const st = { carry: 0 }, bad = [];
for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 144, 0.1, 0.008, 0.04]) for (const sp of [0.01, 0.3, 1.7, 4.2]) for (let i = 0; i < 50; i++) {
  const d = sp * dt * (0.02 + i / 51), v = feelSpeed(st, d, dt);
  if (v !== d / Math.max(dt, 1e-3) || st.carry !== 0) bad.push([dt, sp, i, v, st.carry]);
}
console.log(JSON.stringify({ bad: bad.length, jump: feelSpeed({ carry: 0 }, 25, 1 / 60), zero: feelSpeed({ carry: 0 }, 0, 1 / 60) }));""")
        self.assertEqual(r, {"bad": 0, "jump": 6, "zero": 0})

    def test_squash_spring_never_diverges(self):
        """つぶれの ばね：4こまに 1こま 0.085秒・ずっと 0.1秒・0.5秒の 1こまでも、つぶれは ±0.5 の 中で 0 に もどる（直す 前の 式は 0.085秒で こわれる）"""
        r = self.js("""
const old = (st, dt) => { st.sqv += (-st.sq * 260 - st.sqv * 14) * dt; st.sq += st.sqv * dt; };
const run = (f, pat, n) => { const st = { sq: 0.3, sqv: 0 }; let max = 0; for (let i = 0; i < n; i++) { f(st, pat[i % pat.length]); max = Math.max(max, Math.abs(st.sq)); } return { max, end: Math.abs(st.sq), fin: Number.isFinite(st.sq) }; };
const a = { sq: 0.3, sqv: 0 }, b = { sq: 0.3, sqv: 0 }; squashSpring(a, 1 / 60); old(b, 1 / 60);
const c = { sq: 0.3, sqv: 0 }, e = { sq: 0.3, sqv: 0 }; squashSpring(c, 1 / 120); old(e, 1 / 120);
const bad = { sq: NaN, sqv: 5 }; squashSpring(bad, 0.016);
const big = { sq: 9, sqv: 0 }; squashSpring(big, 0.016);
console.log(JSON.stringify({ hitch: run(squashSpring, [0.0167, 0.0167, 0.0167, 0.085], 200), slow: run(squashSpring, [0.1], 60), huge: run(squashSpring, [0.5], 10), oldHitch: run(old, [0.0167, 0.0167, 0.0167, 0.085], 200).max > 100, oldSlow: run(old, [0.1], 60).max > 1e3,
  same60: a.sq === b.sq && a.sqv === b.sqv, same120: c.sq === e.sq && c.sqv === e.sqv, nan: [bad.sq, bad.sqv], big: big.sq }));""")
        for k in ["hitch", "slow", "huge"]:
            self.assertTrue(r[k]["fin"], k)
            self.assertLessEqual(r[k]["max"], 0.5, k)
            self.assertLess(r[k]["end"], 0.01, k)
        self.assertTrue(r["oldHitch"] and r["oldSlow"])   # 直す 前の 式は こわれる（この テストが 見分ける）
        self.assertTrue(r["same60"] and r["same120"])   # 60fps・120fps の 見た目は そのまま
        self.assertEqual(r["nan"], [0, 0])   # 数で なくなっても もどる
        self.assertEqual(r["big"], 0.5)
        self.assertIn("  squashSpring(roll, dt);   // つぶれの ばね", fn("riceFeel"))
        self.assertNotIn("roll.sqv += (-roll.sq * 260", PIX)


SW_HEAD = "const swipeS = { down: null, at: -Infinity, timer: null };"
SW_TAIL = "// スポットをタップすると、ドラクエ風のウィンドウで説明"
# にせの 画面：地図（cv）は 画面の (0,52)〜(390,752)。1マス 32点・画面の 倍率 2（画面の 16px ＝ 1マス）。にせの 時計と タイマー
SW_STUB = """
let T = 1000, seq = 0; const timers = new Map();
const performance = { now: () => T }, setTimeout = (f, ms) => { timers.set(++seq, { f, at: T + ms }); return seq; }, clearTimeout = id => { timers.delete(id); };
const adv = ms => { const end = T + ms; for (;;) { const t = [...timers.entries()].filter(e => e[1].at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!t) break; T = t[1].at; timers.delete(t[0]); t[1].f(); } T = end; };
const L = {}, D = {}, W = {}, clicks = [];
class MouseEvent { constructor(type, o) { this.type = type; Object.assign(this, o); } }
const cv = { width: 780, style: { touchAction: '' }, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); }, getBoundingClientRect: () => ({ left: 0, top: 52, right: 390, bottom: 752, width: 390 }), dispatchEvent: e => { clicks.push([e.type, e.clientX, e.clientY]); } };
const document = { hidden: false, addEventListener: (t, f) => { (D[t] = D[t] || []).push(f); } };
const window = { devicePixelRatio: 2, addEventListener: (t, f) => { (W[t] = W[t] || []).push(f); } };
let worldMode = false, covered = false, driving = false, fieldCy = 600, cam = { x: 100, y: 200 }, canWalk = true;
const walks = [], G = { demo: true }, howtoEl = { hidden: true };
const mapCovered = () => covered, fieldT = () => 32, camTile = () => cam, tapWalk = (x, y) => { if (!canWalk) return false; walks.push([x, y]); return true; };
// 指の イベント：地図の 上（onCv）なら 文書 → 地図の 順に とどく。地図の 外（タブ など）なら 文書だけ
const ev = (t, o, onCv = true) => { const e = { pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: 'touch', clientX: 0, clientY: 0, ...o }; (D[t] || []).forEach(f => f(e)); if (onCv) (L[t] || []).forEach(f => f(e)); };
"""


class Fingers206(unittest.TestCase):
    """R1（とちゅうで ためらう なぞり）・R3（置いた まま の 指）：指の 一生を にせの 画面で 動かす"""

    def js(self, run):
        r = subprocess.run(["node", "-e", SW_STUB + block(SW_HEAD, SW_TAIL) + run], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr[-800:])
        return json.loads(r.stdout)

    def test_hesitating_trace_follows_the_finger(self):
        """R1：なぞる とちゅうで 0.3秒 止めると そこへ 歩きだす。その あと 先へ 進めた 指は、はなした 所（止めた 所から 進んだ ぶん 先）へ 行き先を かえる。地図が 流れても 行きすぎない"""
        r = self.js("""
const out = {};
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); adv(310); out.hold = walks.slice();
cam = { x: 103, y: 200 };   // お米が 歩いて 地図が 3マス 流れた
ev('pointermove', { clientX: 275, clientY: 352 }); ev('pointermove', { clientX: 291, clientY: 352 }); out.moving = walks.length;
ev('pointerup', { clientX: 291, clientY: 352 }); out.release = walks.slice(); out.at = swipeS.at === T;
// 止めずに なぞった とき（地図は 流れない）と 同じ マス
walks.length = 0; cam = { x: 100, y: 200 }; adv(1000);
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); ev('pointermove', { clientX: 291, clientY: 352 }); ev('pointerup', { clientX: 291, clientY: 352 }); out.plain = walks.slice();
console.log(JSON.stringify(out));""")
        # (243,352)：x=486, y=600 → マス 100+(486-390)/32=103、200。(291,352)：100+(582-390)/32=106
        self.assertEqual(r["hold"], [[103, 200]])
        self.assertEqual(r["moving"], 1)   # 動いて いる 間は 追わない
        self.assertEqual(r["release"], [[103, 200], [106, 200]])   # 流れた 地図の 下の マス（109）では ない
        self.assertEqual(r["plain"], [[106, 200]])
        self.assertTrue(r["at"])

    def test_second_stop_retargets_once(self):
        """R1：先へ 進めて また 止めたら（0.3秒）、はなさなくても 行き先を かえる。同じ マスなら 歩きなおさない"""
        r = self.js("""
const out = {};
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); adv(310);
ev('pointermove', { clientX: 300, clientY: 352 }); adv(200); out.early = walks.length; adv(150); out.second = walks.slice();
adv(2000); out.waited = walks.length;
ev('pointerup', { clientX: 302, clientY: 353 }); out.up = walks.length;
console.log(JSON.stringify(out));""")
        self.assertEqual(r["early"], 1)
        self.assertEqual(r["second"], [[103, 200], [106, 200]])
        self.assertEqual(r["waited"], 2)
        self.assertEqual(r["up"], 2)

    def test_cycle203_guards_are_kept(self):
        """サイクル203 の 守り：止めた 所の そば（24px より 近く）で 動かす・はなす／はじめの 所へ もどして はなす／動かさない 長押し／マウスの ボタン／地図の 外／とりけし／歩けない マス"""
        r = self.js("""
const out = {}, start = () => { walks.length = 0; clicks.length = 0; adv(1000); ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); adv(310); };
start(); cam = { x: 105, y: 200 }; adv(3000); out.still = walks.length; ev('pointerup', { clientX: 243, clientY: 352 }); out.stillUp = walks.length;
cam = { x: 100, y: 200 };
start(); ev('pointermove', { clientX: 258, clientY: 360 }); adv(400); ev('pointerup', { clientX: 258, clientY: 360 }); out.near = walks.length;
start(); ev('pointermove', { clientX: 197, clientY: 352 }); adv(400); out.backHold = walks.length; ev('pointerup', { clientX: 197, clientY: 352 }); out.back = walks.length; out.backAt = swipeS.at === T; out.clicks = clicks.length;
walks.length = 0; adv(1000); ev('pointerdown', { clientX: 195, clientY: 352 }); adv(900); out.press = walks.length; ev('pointerup', { clientX: 195, clientY: 352 }); out.pressUp = walks.length; out.pressAt = swipeS.at;
walks.length = 0; adv(1000); ev('pointerdown', { pointerType: 'mouse', clientX: 195, clientY: 352 }); ev('pointermove', { pointerType: 'mouse', clientX: 243, clientY: 352 }); ev('pointermove', { pointerType: 'mouse', buttons: 0, clientX: 260, clientY: 352 }); adv(400); out.mouse = walks.length; out.mouseDown = swipeS.down;
adv(1000); ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); ev('pointerleave', {}); adv(400); out.leave = walks.length;
ev('pointerup', { clientX: 243, clientY: 20 }); out.outside = walks.slice();
walks.length = 0; adv(1000); ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 20 }); adv(400); out.holdOutside = walks.length; ev('pointercancel', {}); ev('pointerup', { clientX: 243, clientY: 352 }); out.cancel = walks.length;
canWalk = false; adv(1000); ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); adv(310); out.noPathKey = swipeS.down.key; canWalk = true; ev('pointermove', { clientX: 291, clientY: 352 }); ev('pointerup', { clientX: 291, clientY: 352 }); out.noPathThen = walks.slice();
walks.length = 0; adv(1000); ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointermove', { clientX: 243, clientY: 352 }); ev('pointerup', { pointerId: 9, clientX: 300, clientY: 352 }); out.otherUp = [walks.length, !!swipeS.down];
ev('pointerup', { clientX: 243, clientY: 352 }); out.ownUp = walks.length;
console.log(JSON.stringify(out));""")
        self.assertEqual([r["still"], r["stillUp"]], [1, 1])   # 動かさない 指：地図が 流れても 追わない・はなしても 歩きなおさない
        self.assertEqual(r["near"], 1)   # 17px ずらして 止めて はなす：かえない
        self.assertEqual([r["backHold"], r["back"], r["backAt"], r["clicks"]], [1, 1, True, 0])   # はじめの 所へ もどして 止めても・はなしても かえない。あとの click は 使わない
        self.assertEqual([r["press"], r["pressUp"]], [0, 0])   # 動かさない 長押しは click に まかせる
        self.assertIsNone(r["pressAt"])   # -Infinity（JSON では null）：あとの click を 捨てない
        self.assertEqual(r["mouse"], 0)
        self.assertIsNone(r["mouseDown"])
        self.assertEqual(r["leave"], 0)   # 地図の 外へ 出たら 待たない
        self.assertEqual(len(r["outside"]), 1)   # 外で はなした：はなした 所で 決まる（サイクル192 から）
        self.assertEqual([r["holdOutside"], r["cancel"]], [0, 0])
        self.assertEqual(r["noPathKey"], "")   # 歩きだせない マスでは 行き先を きめない
        self.assertEqual(r["noPathThen"], [[106, 200]])
        self.assertEqual(r["otherUp"], [0, True])   # ほかの 指が はなれても、受けて いる 指は そのまま
        self.assertEqual(r["ownUp"], 1)

    def test_resting_finger_does_not_block(self):
        """R3：置いた まま の 指（0.3秒 以上・10px より 動かない）が あっても、あとから ついた 指の タップ・なぞりが 効く。どちらを 先に はなしても よい"""
        r = self.js("""
const out = {}, A = { pointerId: 1, isPrimary: true, clientX: 40, clientY: 770 }, B = { pointerId: 2, isPrimary: false };
ev('pointerdown', A, false); adv(100); out.ta0 = cv.style.touchAction; adv(250); out.ta1 = cv.style.touchAction;
adv(100); ev('pointerdown', { ...B, clientX: 243, clientY: 352 }); adv(70); ev('pointerup', { ...B, clientX: 245, clientY: 353 }); out.tap = clicks.slice(); out.tapWalks = walks.length; out.tapAt = swipeS.at === T;
adv(600); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); ev('pointermove', { ...B, clientX: 243, clientY: 352 }); ev('pointerup', { ...B, clientX: 243, clientY: 352 }); out.swipe = walks.slice();
walks.length = 0; adv(600); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); ev('pointermove', { ...B, clientX: 243, clientY: 352 }); ev('pointerup', A, false); out.ta2 = cv.style.touchAction; ev('pointerup', { ...B, clientX: 243, clientY: 352 }); out.restFirst = walks.slice();
// 置いた 指が 地図の 上（はし）：主の 指。あとの 指を 受け、主の 指が はなれても そのまま
walks.length = 0; clicks.length = 0; adv(600); ev('pointerdown', { ...A, clientX: 12, clientY: 600 }); adv(450); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); ev('pointermove', { ...B, clientX: 243, clientY: 352 }); adv(310); out.edgeHold = walks.slice();
ev('pointerup', { ...A, clientX: 12, clientY: 600 }); ev('pointerup', { ...B, clientX: 243, clientY: 352 }); out.edge = walks.length; out.left = [restS.pts.size, cv.style.touchAction, timers.size];
console.log(JSON.stringify(out));""")
        self.assertEqual([r["ta0"], r["ta1"], r["ta2"]], ["", "none", ""])   # 置いた まま の 指が ある 間だけ none
        self.assertEqual(r["tap"], [["click", 245, 353]])   # タップ：同じ 所の click を 出す（click と 同じ 道）
        self.assertEqual([r["tapWalks"], r["tapAt"]], [0, True])
        self.assertEqual(r["swipe"], [[103, 200]])
        self.assertEqual(r["restFirst"], [[103, 200]])
        self.assertEqual(r["edgeHold"], [[103, 200]])
        self.assertEqual(r["edge"], 1)
        self.assertEqual(r["left"], [0, "", 0])

    def test_two_finger_gestures_do_not_walk(self):
        """R3：2本を ほぼ 同時に ついた／先の 指が 動いて いる／置いた 指が あとから 動いた／とりけし／画面が かくれた・前面で なくなった → 歩かない・click も 出さない"""
        r = self.js("""
const out = {}, A = { pointerId: 1, isPrimary: true }, B = { pointerId: 2, isPrimary: false }, end = () => { ev('pointerup', { ...A, clientX: 0, clientY: 0 }); ev('pointerup', { ...B, clientX: 0, clientY: 0 }); const n = walks.length + clicks.length; walks.length = 0; clicks.length = 0; adv(1000); return n; };
ev('pointerdown', { ...A, clientX: 120, clientY: 500 }); adv(40); ev('pointerdown', { ...B, clientX: 270, clientY: 300 }); out.quickDown = !!swipeS.down; ev('pointermove', { ...A, clientX: 170, clientY: 440 }); ev('pointermove', { ...B, clientX: 220, clientY: 360 }); adv(400); out.quick = end();
ev('pointerdown', { ...A, clientX: 195, clientY: 352 }); adv(400); ev('pointermove', { ...A, clientX: 243, clientY: 352 }); ev('pointerdown', { ...B, clientX: 300, clientY: 600 }); adv(400); out.moving = end();
ev('pointerdown', { ...A, clientX: 60, clientY: 600 }); adv(500); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); out.accepted = !!swipeS.down && swipeS.down.second; ev('pointermove', { ...B, clientX: 243, clientY: 352 }); ev('pointermove', { ...A, clientX: 80, clientY: 590 }); out.afterMove = !!swipeS.down; adv(400); out.lateMove = end();
ev('pointerdown', { ...A, clientX: 60, clientY: 600 }); adv(500); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); ev('pointermove', { ...B, clientX: 243, clientY: 352 }); ev('pointercancel', { ...B }); ev('pointercancel', { ...A }); adv(400); out.cancel = end();
ev('pointerdown', { ...A, clientX: 60, clientY: 600 }); adv(500); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); ev('pointermove', { ...B, clientX: 243, clientY: 352 }); document.hidden = true; D.visibilitychange.forEach(f => f()); document.hidden = false; adv(400); out.hidden = end(); out.hiddenLeft = [restS.pts.size, cv.style.touchAction];
ev('pointerdown', { ...A, clientX: 60, clientY: 600 }); adv(500); ev('pointerdown', { ...B, clientX: 195, clientY: 352 }); ev('pointermove', { ...B, clientX: 243, clientY: 352 }); W.blur.forEach(f => f()); adv(400); out.blur = end();
worldMode = true; ev('pointerdown', { ...A, clientX: 60, clientY: 600 }); adv(500); ev('pointerdown', { ...B, clientX: 243, clientY: 352 }); out.world = end(); worldMode = false;
ev('pointerdown', { pointerId: 5, isPrimary: false, pointerType: 'mouse', clientX: 243, clientY: 352 }); out.mouse2 = !!swipeS.down;
console.log(JSON.stringify(out));""")
        self.assertFalse(r["quickDown"])
        self.assertTrue(r["accepted"])
        self.assertFalse(r["afterMove"])
        for k in ["quick", "moving", "lateMove", "cancel", "hidden", "blur", "world"]:
            self.assertEqual(r[k], 0, k)
        self.assertEqual(r["hiddenLeft"], [0, ""])
        self.assertFalse(r["mouse2"])

    def test_rule_constants_and_click_path(self):
        sw = block(SW_HEAD, SW_TAIL)
        self.assertIn("const REST_MS = 300, REST_PX = 10;", sw)
        self.assertIn("const SWIPE_ON_PX = 24;", sw)
        self.assertNotIn("requestPermission", sw)
        self.assertNotIn("tiltAsk", sw)
        self.assertIn("if (d.second) { cv.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY })); swipeS.at = performance.now(); }", sw)
        self.assertIn("if (!event || !event.isTrusted || tiltG.asked || !tiltNeedsPermission()) return;", PIX)   # 作った click では 許可を 聞かない
        self.assertRegex(CSS, r"#pxCanvas\{[^}]*touch-action:pinch-zoom\}")   # ふだんは これまでどおり


TILT_STUB = """
let T = 0; const performance = { now: () => T }, L = {}, window = { addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); } }, document = { hidden: false }, screen = { orientation: { angle: 0 } };
const tiltG = { x: 0, y: 0, on: false, base: null, n: 0, deg: 12 }, rp = { vx: 1, vy: 1 }, G = { demo: true, toast: () => {} }, rollOn = true, active = true;
const ori = (g, b, n = 1) => { for (let i = 0; i < n; i++) { T += 16; L.deviceorientation.forEach(f => f({ gamma: g, beta: b, timeStamp: T })); } };
"""


class Tilt206(unittest.TestCase):
    """F1/K4・F2・K3：傾き（運営者の いちばんの 関心）。転がす 力の 計算は 変えない"""

    def tilt(self, run):
        return node(TILT_STUB + block("function tiltCurve(degrees) {", "function tiltNeedsPermission()") + run)

    def test_tilt_force_is_untouched(self):
        """傾きの 力（tiltCurve・ならし）と、転がりの 式（rollStep の 力の 行）は これまでどおり"""
        self.assertIn("""function tiltCurve(degrees) {
  const v = Math.min(1, Math.abs(degrees) / tiltG.deg);
  if (v <= 0.03) return 0;
  const force = v < 0.25 ? (v - 0.03) / 0.22 * 0.65 : 0.65 + (v - 0.25) / 0.75 * 0.35;
  return Math.sign(degrees) * force;
}""", PIX)
        self.assertIn("const k = 1 - Math.exp(-Math.min(0.1, Math.max(0.004, (te - tiltG.t) / 1000)) / 0.022);", PIX)
        self.assertIn("const ROLL_ACC = 7, ROLL_MAX = 4.2, ROLL_BOUNCE = 0.25, ROLL_STICK = 0.6;", PIX)
        r = fn("rollStep")
        self.assertIn("  const tk = tapWalkTilt();", r)
        self.assertIn("  const ax = tiltG.x * tk + rk.right - rk.left, ay = tiltG.y * tk + rk.down - rk.up;   // 傾きと 矢印キー", r)
        self.assertIn("let fx = Math.max(-1, Math.min(1, ax)) * acc + sl.x * up, fy = Math.max(-1, Math.min(1, ay)) * acc + sl.y * up;", r)
        out = self.tilt("ori(0, 40, 3); ori(-4, 40, 60); const a = tiltG.x; ori(0, 43, 60); console.log(JSON.stringify([a, tiltG.x, tiltG.y]));")
        self.assertAlmostEqual(out[0], -(0.65 + (4 / 12 - 0.25) / 0.75 * 0.35), places=6)
        self.assertEqual(out[1], 0)
        self.assertAlmostEqual(out[2], 0.65, places=6)

    def test_small_tilt_does_not_cancel_a_walk(self):
        """F2：歩いて いる 間、力が 0.75 より 小さい 傾き（ふつうの 設定で 5.6度 まで）は 入れない。0.75 以上は 歩きを やめて 傾きに まかせる。歩いて いない ときは いつも そのまま"""
        src = line("const TAP_TILT_OVER = ") + fn("tapWalkTilt") + fn("tiltCurve")
        r = node("const tapS = { goal: null }, tiltG = { x: 0, y: 0, deg: 12 }; let stops = 0; const tapWalkStop = () => { stops++; tapS.goal = null; };" + src + """
const out = {}, at = (deg, walking) => { tiltG.x = tiltCurve(deg); tiltG.y = 0; tapS.goal = walking ? [1, 1] : null; stops = 0; return [tapWalkTilt(), stops, !!tapS.goal]; };
out.idle0 = at(0, false); out.idle4 = at(4, false); out.idle12 = at(12, false);
out.walk3 = at(3, true); out.walk4 = at(4, true); out.walk5 = at(5.5, true); out.walk6 = at(6, true); out.walk12 = at(-12, true);
tiltG.x = 0.6; tiltG.y = 0.6; tapS.goal = [1, 1]; stops = 0; out.diag = [tapWalkTilt(), stops];
out.f = [tiltCurve(3), tiltCurve(4), tiltCurve(6)];
console.log(JSON.stringify(out));""")
        for k in ["idle0", "idle4", "idle12"]:
            self.assertEqual(r[k], [1, 0, False], k)   # 歩いて いない：傾きは そのまま
        for k in ["walk3", "walk4", "walk5"]:
            self.assertEqual(r[k], [0, 0, True], k)   # 小さな 傾き：歩きは つづく
        for k in ["walk6", "walk12"]:
            self.assertEqual(r[k], [1, 1, False], k)   # しっかり 傾けた：傾きが 勝つ
        self.assertEqual(r["diag"], [1, 1])   # ななめ（0.6, 0.6）＝ 0.85
        self.assertAlmostEqual(r["f"][0], 0.65, places=6)
        self.assertLess(r["f"][1], 0.75)
        self.assertGreater(r["f"][2], 0.75)

    def test_demo_wait_ignores_sensor_noise(self):
        """F1/K4：手本を 待つ 時間は、センサーの 値では もどさない（お米が 0.25秒で 0.05マスより 動いた とき・さわった とき・キーだけ）。ゆれる 📱 も 止まって いれば 出す"""
        self.assertNotIn("tapDemoTouch(); }, { passive: true });", PIX)
        self.assertEqual(len([m for m in PIX.split("\n") if "addEventListener('deviceorientation'" in m]), 1)   # 傾きを 読む 聞き手 だけ
        self.assertIn("const DEMO_MOVE = 0.05;", PIX)
        t = fn("tapDemoTick")
        self.assertIn("const moved = rp.x === null || tapDemo.x === null ? rp.x !== tapDemo.x : Math.hypot(rp.x - tapDemo.x, rp.y - tapDemo.y) > DEMO_MOVE;", t)
        self.assertIn("  tapDemo.x = rp.x; tapDemo.y = rp.y;\n  if (moved) { tapDemo.at = now; tapDemo.walked = now - tapDemo.walkT < 700; }", t)
        self.assertIn("  const ph = tiltG.on;", t)
        self.assertIn("document.addEventListener('pointerdown', tapDemoTouch, { capture: true, passive: true });", PIX)
        self.assertIn("window.addEventListener('keydown', tapDemoTouch, { passive: true });", PIX)
        r = node("const DEMO_MOVE = 0.05, tapDemo = { x: null, y: null }; let rp = { x: null, y: null };"
                 "const f = () => { const moved = rp.x === null || tapDemo.x === null ? rp.x !== tapDemo.x : Math.hypot(rp.x - tapDemo.x, rp.y - tapDemo.y) > DEMO_MOVE; tapDemo.x = rp.x; tapDemo.y = rp.y; return moved; };"
                 "const out = [f()]; rp = { x: 5, y: 5 }; out.push(f(), f()); rp = { x: 5.03, y: 5.03 }; out.push(f()); rp = { x: 5.07, y: 5.05 }; out.push(f()); rp = { x: 6.07, y: 5.05 }; out.push(f()); rp = { x: 6.2, y: 5.05 }; out.push(f());"
                 "console.log(JSON.stringify(out));")
        self.assertEqual(r, [False, True, False, False, False, True, True])   # じわっと した ずれ（0.04マス）は 動いた うちに 入れない・1歩（1マス）や 転がり（0.13マス）は 入る

    def test_baseline_survives_hide_with_same_posture(self):
        """K3：4度 傾けて 転がして いる とちゅうで かくれる・前面で なくなる → 同じ 持ち方で もどれば 力は もどる（直す 前は 0 の まま）。持ち方が 変わって いれば 取りなおす"""
        r = self.tilt("""
const out = {}, near = v => Math.round(v * 100) / 100;
ori(0, 40, 3); ori(-4, 40, 60); out.before = near(tiltG.x);
tiltPause(); out.paused = [tiltG.x, rp.vx, rp.vy, !!tiltG.keep]; tiltPause(); tiltPause(); out.again = !!tiltG.keep;
ori(-4.5, 40.5, 60); out.same = near(tiltG.x); out.keepGone = tiltG.keep;
tiltPause(); ori(-12, 40, 60); out.changed = near(tiltG.x);
ori(-12, 40, 3); tiltReset(); out.reset = tiltG.keep; ori(-12, 40, 60); out.afterReset = tiltG.x;
tiltPause(); screen.orientation.angle = 90; ori(-12, 40, 60); out.turned = [tiltG.x, tiltG.y];
console.log(JSON.stringify(out));""")
        self.assertEqual(r["before"], -0.69)
        self.assertEqual(r["paused"], [0, 0, 0, True])   # かくれた しゅんかん：力も いきおいも 0
        self.assertTrue(r["again"])   # blur → かくれる → もどる と つづけて 呼ばれても おぼえて いる
        self.assertEqual(r["same"], -0.71)   # 同じ 持ち方（0.5度の ずれ）：前の 基準で 4.5度
        self.assertIsNone(r["keepGone"])
        self.assertEqual(r["changed"], 0)   # 8度 変わった：いまの 持ち方が 新しい 基準
        self.assertIsNone(r["reset"])
        self.assertEqual(r["afterReset"], 0)   # 許可・説明を とじた ときの 取りなおしは これまでどおり
        self.assertEqual(r["turned"], [0, 0])   # 画面を 回した あとは 取りなおす
        self.assertIn("const TILT_KEEP_DEG = 4;", PIX)
        self.assertIn("document.addEventListener('visibilitychange', tiltPause);", PIX)
        self.assertIn("window.addEventListener('pageshow', tiltPause);", PIX)
        self.assertIn("window.addEventListener('blur', () => { for (const k in rk) rk[k] = 0; tiltPause(); });", PIX)
        self.assertIn("window.addEventListener('orientationchange', () => { tiltReset(); rp.vx = rp.vy = 0; });", PIX)
        self.assertIn("if (r === 'granted') { tiltG.granted = true; lsSet('nsg_tilt_ok', '1'); tiltReset(); tiltBtnOk(); }", PIX)


class Taps206(unittest.TestCase):
    """N1（ぎりぎりの 手本）・M3（縁の 矢印と 道すじ）"""

    def test_route_cell_wins_over_arrow_zone(self):
        """M3：矢印の はんいの 中でも、道すじの マスなら 歩きが 先。矢印の 絵（半径 R の 中）・道すじで ない マス・道すじが ない ときは これまでどおり せかいちず"""
        r = node("const MZ_K = 3, cv = { width: 780 }, fieldCy = 600, window = { devicePixelRatio: 2 }, fieldT = () => 32, camTile = () => ({ x: 100, y: 200 });"
                 "let driving = false; const G = { demo: true }, mzMap = { pin: [700, 200, 40, 0] }, mzRt = { path: [[33, 66], [34, 66], [35, 66], [36, 65]] };" + fn("arrowYields") + """
const out = {};
out.route = arrowYields(600, 500);   // マス 100+(600-390)/32=106, 200+(500-600)/32=196 → めいろの マス (35,65)…
out.cell = [Math.floor(Math.floor(100 + (600 - 390) / 32) / 3), Math.floor(Math.floor(200 + (500 - 600) / 32) / 3)];
out.onRoute = arrowYields(600, 540);   // 106, 198 → (35,66)
out.own = arrowYields(390, 600);   // お米の マス (33,66) は 数えない
out.pin = arrowYields(690, 210);
mzMap.pin = [600, 560, 40, 0]; out.pinOnRoute = arrowYields(600, 540);
mzMap.pin = [700, 200, 40, 0]; mzRt.path = null; out.noPath = arrowYields(600, 540);
mzRt.path = [[33, 66], [34, 66], [35, 66]]; G.demo = false; out.walkMode = arrowYields(600, 540); G.demo = true; driving = true; out.car = arrowYields(600, 540);
console.log(JSON.stringify(out));""")
        self.assertEqual(r["cell"], [35, 65])
        self.assertFalse(r["route"])   # 道すじで ない マス
        self.assertTrue(r["onRoute"])
        self.assertFalse(r["own"])
        self.assertFalse(r["pin"])
        self.assertFalse(r["pinOnRoute"])   # 矢印の 絵の 上は、道すじの マスでも せかいちず
        self.assertFalse(r["noPath"])
        self.assertFalse(r["walkMode"])
        self.assertFalse(r["car"])
        self.assertIn("    if (inR(mzMap.arrow) && !arrowYields(px, py)) { if (!mzMap.tapped)", PIX)
        self.assertIn("mzGoalWorld(); return; }", PIX)

    def test_tap_near_a_tight_demo_walks(self):
        """N1：まわり 18px の どこかで 窓が 開く 点を 手本が 指して いる とき、指先から 24px の 中の タップは 手本の マスへ 歩く。18px ずれても 歩ける 置き場では 何も 変えない"""
        stub = """
let T = 5000, worldMode = false, driving = false, slopOk = false, spot = null; const performance = { now: () => T }, G = { demo: true }, howtoEl = { hidden: true }, rp = { x: 1 }, tapS = { goal: null }, mzRt = { path: [[0, 0], [1, 0]] }, tiltG = { asked: true };
const tapDemo = { last: null }, walks = [], DEMO_SLOP_PX = 18, calls = [];
const tapDemoWalks = (q, slop) => { calls.push(slop); return slopOk; }, tapDemoSpot = () => spot, tiltBtnWanted = () => true, swipeTile = (x, y) => [Math.floor(x / 16), Math.floor(y / 16)], tapWalk = (x, y) => { walks.push([x, y]); return true; };
"""
        r = node(stub + line("const DEMO_TAP_R = ") + fn("demoTapWalk") + """
const out = {}, last = () => { tapDemo.last = { x: 147, y: 381, at: T - 100 }; walks.length = 0; };
last(); out.near = [demoTapWalk(147, 387), walks.slice(), tapDemo.last];
last(); out.diag = demoTapWalk(159, 393);
last(); out.hand = demoTapWalk(147, 401);
last(); out.far = [demoTapWalk(147, 406), walks.length];
last(); slopOk = true; out.safe = [demoTapWalk(147, 387), walks.length]; slopOk = false;
last(); tapDemo.last.at = T - 1600; out.old = demoTapWalk(147, 387);
tapDemo.last = null; walks.length = 0; spot = { q: { x: 200, y: 300 } }; out.notShown = [demoTapWalk(205, 310), walks.slice()];
tapS.goal = [1, 1]; out.walking = demoTapWalk(205, 310); tapS.goal = null;
worldMode = true; out.world = demoTapWalk(205, 310); worldMode = false; howtoEl.hidden = false; out.howto = demoTapWalk(205, 310); howtoEl.hidden = true; G.demo = false; out.walkMode = demoTapWalk(205, 310);
out.slop = [...new Set(calls)];
console.log(JSON.stringify(out));""")
        self.assertEqual(r["near"], [True, [[9, 23]], None])   # (147,381) の マスへ
        self.assertTrue(r["diag"])   # (12,12)：17px
        self.assertTrue(r["hand"])   # 手の 絵の まん中（指先から 20px）
        self.assertEqual(r["far"], [False, 0])   # 25px
        self.assertEqual(r["safe"], [False, 0])   # 18px ずれても 歩ける 置き場：これまでどおり
        self.assertFalse(r["old"])
        self.assertEqual(r["notShown"], [True, [[12, 18]]])   # 手本が まだ 出て いない ときは、いま 出すなら 指す 所で
        for k in ["walking", "world", "howto", "walkMode"]:
            self.assertFalse(r[k], k)
        self.assertEqual(r["slop"], [18])
        c = block("cv.addEventListener('click', e => {\n", "\n});\n")
        self.assertLess(c.index("demoTapWalk(e.clientX, e.clientY)"), c.index("if (inR(mzMap.arrow)"))   # 窓・矢印の 当たりより 先に 見る
        self.assertLess(c.index("demoTapWalk(e.clientX, e.clientY)"), c.index("const h = fieldHit(x, y);"))
        self.assertIn("  if (tapDemo.el && !tapDemo.el.hidden && tapDemo.sp) tapDemo.last = { ...tapDemo.sp, at: tapDemo.at };", fn("tapDemoTouch"))
        self.assertIn("  tapDemo.sp = sp ? { x: sp.q.x, y: sp.q.y } : null;", fn("tapDemoTick"))
        self.assertIn("for (const slop of [DEMO_SLOP_PX, 0]) {", fn("tapDemoSpot"))   # 置き場の えらび方は これまでどおり


class Small206(unittest.TestCase):
    def test_info_close_sticks_to_the_bottom(self):
        """M4：名所の 窓の「▶ とじる」は 窓の 下の はしに はりつく（文が 長くても 切れない）"""
        self.assertIn(".px-info .dq-close{position:sticky;bottom:0;width:100%;margin:0;padding:8px 0 0;text-align:right;background:#000;box-shadow:0 10px 0 #000}", CSS)
        self.assertIn(".px-info .dq{pointer-events:auto;width:100%;max-width:420px;max-height:70%;overflow-y:auto}", CSS)
        self.assertIn('<button type="button" class="dq-close" data-close>▶ とじる</button>', HTML)

    def test_font_stylesheet_does_not_block(self):
        """R4：字の スタイルシートは 待たずに 読む（同じ 字・同じ 順）"""
        self.assertIn('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap" media="print" onload="this.media=\'all\'"/>', HTML)
        self.assertEqual(HTML.count('rel="stylesheet"'), 3)
        self.assertLess(HTML.index("leaflet.css"), HTML.index("fonts.googleapis.com/css2"))
        self.assertLess(HTML.index("fonts.googleapis.com/css2"), HTML.index('href="nishio-go/style.css"'))

    def test_owner_rules_kept(self):
        """運営者の 決まり：最初の click で すぐ 許可（touchend では 聞かない・同じ タップで 2回 聞かない）・聞く 前は「タップ！」の 手本・止まったら 手本・始まりの 画面や カードを 足さない"""
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("if (event.type === 'touchend') return;", PIX)
        self.assertIn("if (tiltAsk.ev === event || performance.now() - (tiltAsk.at || -1e9) < 250) return;", PIX)
        self.assertIn("if ((tiltG.asked && !tiltG.retry) || !tiltBtnWanted()) return;", PIX)
        self.assertIn("  if (e && e.isTrusted === false) return;", fn("tiltFirstTouch"))   # 作った click は 間あけ（0.7秒）に 数えない：すぐ あとの 本当の タップで 聞ける
        t = fn("tapDemoTick")
        self.assertIn("const first = tiltBtnWanted() && !tiltG.asked;", t)
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", t)
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"], cwd=ROOT, capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ["showReward(", "id=\"intro\"", "gtag(", "fetch(", "sendBeacon", "XMLHttpRequest"]:
            self.assertNotIn(w, added, w)

    def test_playtest_and_doc(self):
        for k in ["walkHopSmall", "arrowRouteWalk", "restFinger", "tiltDemoShown", "tapWalkTilt", "infoCloseSmall", "fontNoBlock"]:
            self.assertIn("\n  %s: '" % k, PLAY, k)
            self.assertIn("out.%s = {" % k, PLAY, k)
        self.assertIn("...(await cycle206Checks(browser, R)), ...(await slowStartChecks(browser, R)) };", PLAY)
        self.assertIn("sw.holdOk = held && still === 'null' && g2 === g1 && hq.far && g4 === hq.want && (g3 === 'null' || g3 === g4) && !info2 && !!hp.cfg && hp.cfg.ms <= 400;", PLAY)
        self.assertIn("- サイクル206：", DOC)
        self.assertEqual(DOC.count("- サイクル206："), 1)
        self.assertNotIn("- サイクル205：", DOC)   # サイクル205 は 行き先の 札の 名前（別の 周）。この 記録は 206 に まとめた


if __name__ == "__main__":
    unittest.main()
