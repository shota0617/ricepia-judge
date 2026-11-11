"""第4弾サイクル207：はじめの 1分で やめる 人を へらす（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」・2026-11-11「最初の1分の改善はこのやり方に変更」）。
さがし役が 見つけた 欠陥を 直す：
(1) 横向きの 低い 画面で、1回 歩くと「タップ！」の 指が 二度と 出ない → 地図を 道すじの 先へ 寄せる・たんけんの 1行を 出さない。
    🌀（西尾めいろ）の ボタンが 上の バーの 下・傾きの ボタンの 下に もぐる → 低い 横向きでは 傾きの ボタンの 下に 置く。
(2) 読みこみが おそいと、はじめての ゴールの すぐ あとに「めいろ、どうだった？」→ ゴールの 時間は はじめて 手で 動かした ときから。
(3) 傾けて 転がす だけの 人に 45秒で「お疲れ様です」の カード → 遊びの 入力で 無操作の 時計を もどす。
どの テストも、直す 前（サイクル206）にも ある 関数（tapDemoTick の 中・カメラ・下の 欄の 文・mazeGoal・notePlayInput）を
動かして、ふるまいで 落ちる（新しい 関数は ある ときだけ 入れる）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn(src, name, missing=None):
    """関数を 切りだす。missing を わたすと、ない ときは それを かえす（直す 前の ファイルでも 落ちずに 動かす ため）"""
    m = re.search(r"(?:async )?function %s\(" % re.escape(name), src)
    if not m:
        if missing is not None:
            return missing
        raise AssertionError("no function " + name)
    return src[m.start():src.index("\n}\n", m.start()) + 2]


def line(src, start, missing=None):
    if start not in src:
        if missing is not None:
            return missing
        raise AssertionError("no line " + start)
    i = src.index(start)
    return src[i:src.index("\n", i) + 1]


def block(src, head, tail):
    """head の 行から tail を ふくむ 行まで（どちらも 直す 前から ある 行）"""
    i = src.index(head)
    j = src.index(tail, i)
    return src[i:src.index("\n", j) + 1]


def node(code):
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise AssertionError(r.stderr)
    return json.loads(r.stdout)


# tapDemoTick の 中（置き場を さがした あと）と カメラの 1こま。お米（10.5, 10.5）・道すじは 下へ。見える 地図 106px（568×320 で 1回 歩いた あと）
LEAD_STUB = """
let rp = { x: 10.5, y: 10.5, vx: 0, vy: 0 }, cover = 214, sp = null, cam = { x: 10.5, y: 10.5 }, T = 16, dpr = 1, w = 568, h = 320;   // T：マスの 大きさ（px）・w・h：地図の 大きさ
const MZ_K = 3, DEMO_AHEAD = 3, path = [[3, 3], [3, 5], [3, 7], [4, 7]], first = false, dt = 0.016;
const cv = { getBoundingClientRect: () => ({ width: 568, height: 320 }) }, tileClient = (x, y) => ({ x: x * 16, y: y * 16 });
const tapDemo = { el: { hidden: false } }, tapDemoSpot = () => sp;
const camLead = { x: 0, y: 0 };
"""


def lead_code(frames):
    code = LEAD_STUB + line(PIX, "const demoLead = ", "const demoLead = { x: 0, y: 0, tx: 0, ty: 0 };\n") + line(PIX, "const DEMO_LEAD_PX = ", "") + fn(PIX, "demoLeadAim", "")
    pick = block(PIX, "  const sp = tapDemoSpot(path, first);", "  if (!sp) { if (!tapDemo.el.hidden) tapDemo.el.hidden = true; }").replace("  const sp = tapDemoSpot(path, first);", "  sp = tapDemoSpot(path, first);")
    cam = block(PIX, "  if (rolling) {   // 転がしているときは", "  } else camLead.x")
    return code + "function pick() {\n" + pick + "}\nfunction frame(rolling) {\n" + cam + "}\n" + frames


class DemoLead207(unittest.TestCase):
    def test_no_spot_moves_the_view_toward_the_route(self):
        """R2：止まって いて 指の 置き場が ない → 地図を 道すじの 先へ 寄せる（お米は 見える 所の ふちから 34px より 内がわ）"""
        o = node(lead_code("pick(); for (let i = 0; i < 200; i++) frame(true); console.log(JSON.stringify({ cam, hidden: tapDemo.el.hidden }));"))
        lim = (106 / 2 - 34) / 16
        self.assertTrue(o["hidden"])   # 置き場が ない 間は これまでどおり 指を 出さない
        self.assertAlmostEqual(o["cam"]["y"] - 10.5, lim, places=2, msg="置き場が ない とき 地図が 道すじの 先へ 寄らない")
        self.assertAlmostEqual(o["cam"]["x"] - 10.5, 3, places=2)   # よこは 広いので 3マス先の マスまで

    def test_found_spot_or_movement_does_not_move_the_view(self):
        o = node(lead_code("sp = { q: { x: 1, y: 1 } }; pick(); for (let i = 0; i < 200; i++) frame(true); const a = { ...cam };"
                           " sp = null; pick(); demoLead.tx = demoLead.ty = 0; for (let i = 0; i < 400; i++) frame(true); const b = { ...cam };"
                           " pick(); frame(false); console.log(JSON.stringify({ a, b, off: [demoLead.x, demoLead.y, demoLead.tx, demoLead.ty] }));"))
        self.assertEqual(o["a"], {"x": 10.5, "y": 10.5})
        self.assertAlmostEqual(o["b"]["y"], 10.5, places=3)   # 動いたら（tx・ty が 0）もどる
        self.assertEqual(o["off"], [0, 0, 0, 0])   # 転がす めいろで ない ときは 寄せない
        s = fn(PIX, "tapDemoSpot")   # 置き場の きまり（欄の 裏・お米の 上・窓の 開く 所には 置かない）は そのまま
        self.assertIn("if (!lay || !tapDemoWalks(q, slop, near)) continue;", s)
        self.assertIn("return null;   // どこも だめ", s)
        self.assertIn("  if (moved) demoLead.tx = demoLead.ty = 0;", fn(PIX, "tapDemoTick"))

    def test_view_stops_when_the_demo_stops(self):
        """Codex の 指摘：寄せる 目当てを 決めた あと 窓を 開くと、手本は 消えるのに 地図だけ 動きつづけた。手本を 出さない 間（tapDemoTick の ok が 偽）は その 場で 止める"""
        gate = line(PIX, "  if (!ok && !moved) { demoLead.tx", "")
        o = node(lead_code("function gate(ok, moved) {\n" + gate + "}\n"
                           "pick(); for (let i = 0; i < 8; i++) frame(true); const a = cam.y; gate(false, false); for (let i = 0; i < 200; i++) frame(true); const b = cam.y;"
                           " gate(true, false); pick(); for (let i = 0; i < 200; i++) frame(true); console.log(JSON.stringify({ a, b, c: cam.y }));"))
        self.assertGreater(o["a"], 10.5)
        self.assertAlmostEqual(o["b"], o["a"], places=6, msg="手本を 出さない 間も 地図が 動きつづける")
        self.assertAlmostEqual(o["c"] - 10.5, (106 / 2 - 34) / 16, places=2)   # また 出せる ように なったら つづきから

    def test_rice_stays_inside_through_view_changes(self):
        """Codex の 指摘（3回目）：寄せた あとに「＋」で 大きく すると、お米が 地図の 上の 外へ（16 → 64px で −23px）。
        きまり：どの こまでも、お米は 見える 地図の ふちから 34px（DEMO_LEAD_PX）より 内がわ。寄せる → 大きく ×1〜×4 → 小さく → 568 ↔ 480 → たて向き → 窓を 開く・とじる"""
        gate = line(PIX, "  if (!ok && !moved) { demoLead.tx", "")
        steps = [("寄せる", ""), ("大きく ×2", "T = 32;"), ("大きく ×3", "T = 48;"), ("大きく ×4", "T = 64;"), ("小さく", "T = 16;"),
                 ("480×320", "w = 480;"), ("568×320", "w = 568;"), ("たて向き 390×844", "w = 390; h = 844 - 214;"), ("よこ向きへ もどす", "w = 568; h = 320;"),
                 ("窓を 開く", "gate(false, false);"), ("「＋」（窓の 間）", "T = 64;"), ("窓を とじる", "gate(true, false); pick();"), ("小さく", "T = 16; pick();")]
        js = "function gate(ok, moved) {\n" + gate + "}\nconst out = [], M = 34;\n"
        js += "function riceAt() { const cy = (h - cover * dpr) / 2, cx = w / 2; return [cx + (rp.x - cam.x) * T, cy + (rp.y - cam.y) * T, h - cover * dpr]; }\n"
        js += "pick();\n"
        for name, code in steps:
            js += code + " { let worst = 1e9; for (let i = 0; i < 120; i++) { frame(true); const [x, y, vh] = riceAt(); worst = Math.min(worst, y, vh - y, x, w - x); } out.push([" + json.dumps(name) + ", +worst.toFixed(2)]); }\n"
        js += "console.log(JSON.stringify(out));"
        o = node(lead_code(js))
        bad = [(n, v) for n, v in o if v < 34 - 0.01]
        self.assertEqual(bad, [], "お米が 見える 地図の ふちから 34px より 外へ 出る こまが ある: %s" % o)
        self.assertGreater(dict(o)["寄せる"], 0)

    def test_low_landscape_hides_only_the_counter_row(self):
        """R2：高さ 340px より 低い 横向きの めいろでは「たんけん ○/100」の 1行を 下の 欄に 出さない（気をつける 知らせは 出す）"""
        body = block(GAME, "  const msgs = [];", "  setStatus(msgs.slice(0, 2).join('<br/>'), true);")
        stub = """
let out = null, driving = false, vehicleUntil = 0, selected = null, spotsLoading = null, nearest = null, nearestD = 0, IH = 320, IW = 568, outside = false;
const demo = true, me = { lat: 0, lng: 0, acc: 5 }, CFG = { maxAccuracy: 50 }, spots = [{}];
const window = { get innerHeight() { return IH; }, get innerWidth() { return IW; } };
const document = { body: { classList: { contains: () => true } } }, RESCUE_BTN = () => '', refreshNearby = { outTracked: true };
const inPlay = () => !outside, guideTarget = () => ({}), dayState = () => ({ h100: { steps: 11 }, done: [] }), simple = () => true, PIA = () => '', esc = s => s, fmtM = String;
const setStatus = h => { out = h; }, track = () => {}, todaysQuests = () => [], bagLine = () => null, knownFacts = () => 0;
function run() {
""" + body + "}\n"
        o = node(stub + "const r = []; run(); r.push(out); IH = 375; IW = 667; run(); r.push(out); IH = 844; IW = 390; run(); r.push(out); IH = 320; IW = 568; outside = true; run(); r.push(out); console.log(JSON.stringify(r));")
        self.assertEqual(o[0], "", "低い 横向きで たんけんの 1行が 下の 欄に 出る")
        self.assertIn("たんけん <b>11</b>/100", o[1])   # 667×375・たて向きは これまでどおり
        self.assertIn("たんけん <b>11</b>/100", o[2])
        self.assertIn("遊べる範囲", o[3])   # 気をつける 知らせは 出す


class MeiroBtn207(unittest.TestCase):
    def test_short_landscape_puts_the_button_under_the_tilt_button(self):
        """N1・N2：低い 横向き（高さ 340px まで）では 🌀 を 傾きの ボタン（上 10px・高さ 40px）の 下・地図の 中に。ほかの 画面は そのまま"""
        m = re.search(r"@media \(orientation:landscape\) and \(max-height:340px\)\{([^@]*?)\n\}", CSS)
        self.assertIsNotNone(m, "低い 横向きの 🌀 の 置き方が ない（上の バーと 傾きの ボタンの 下に もぐる）")
        self.assertIn(".px-pad{top:max(0px,min(58px,calc(100% - var(--sheet-h,0px) - 46px)));bottom:auto}", m.group(1))
        self.assertIn(".px-pad{position:absolute;left:12px;bottom:max(176px,calc(var(--sheet-h,0px) + 48px));display:flex;align-items:flex-end;gap:8px}", CSS)   # ふだんは そのまま
        self.assertIn("#pxTilt{position:absolute;left:10px;top:10px;z-index:2;height:40px;min-width:40px;", CSS)   # 傾きの ボタンは 動かさない


def mz_goal_code(goal_sec, tail):
    code = "let T = 0, playInteracted = false, mzShare = null, me = null; const performance = { now: () => T }, store = { get: (k, d) => d }, demo = true, tracked = [];\n"
    code += "const window = { nishioPixel: { maze: { goal: () => ({ sec: " + goal_sec + ", m: 400 }), goalFx: () => {} } } }, nishioPixel = window.nishioPixel;\n"
    code += "const glowArrive = () => 0, snapMaze = () => '', cityNear = () => null, track = (k, o) => tracked.push(o.sec);\n"
    code += line(GAME, "let playT0 = ", "") + line(GAME, "const notePlayInput = ") + line(GAME, "const playSec = ", "") + line(GAME, "const PLAY_ASK_MIN_S = ") + line(GAME, "const playAskOk = ") + fn(GAME, "mazeGoal")
    return code + tail


class PlaySec207(unittest.TestCase):
    def test_goal_time_counts_from_the_first_touch(self):
        """R4：道の 時計が 読みこみ中から 89秒 進んで いても、はじめて 手で 動かしてから 15秒で 着けば 15秒（たずねない）"""
        o = node(mz_goal_code("T / 1000", "T = 89000; notePlayInput(); T = 92000; notePlayInput(); T = 104000; mazeGoal('a', 'A', []); const s = mzShare;"
                              " console.log(JSON.stringify({ sec: s.sec, ask: playAskOk(s), tracked, hand: window.nsgHandMoved }));"))
        self.assertAlmostEqual(o["sec"], 15, places=3, msg="ゴールの 時間に 読みこみ中の 待ちが 入る")
        self.assertFalse(o["ask"])
        self.assertEqual(o["tracked"], [15])
        self.assertTrue(o["hand"])

    def test_untouched_or_short_clock_is_unchanged(self):
        o = node(mz_goal_code("9", "T = 50000; mazeGoal('a', 'A', []); const a = mzShare.sec; notePlayInput(); T = 70000; mazeGoal('a', 'A', []); console.log(JSON.stringify([a, mzShare.sec]));"))
        self.assertEqual(o, [9, 9])
        self.assertIn("const playAskOk = mz => !(demo && !(store.get('nsg_mzgoals', 0) > 3) && mz && mz.sec < PLAY_ASK_MIN_S);", GAME)   # きまり（3こめ まで・60秒）は そのまま


IDLE = (ROOT / "nishio-go" / "idlecard.js").read_text(encoding="utf-8")


def idle_run(script):
    """idlecard.js を にせの 画面・にせの 時計で 動かし、game.js の notePlayInput から 遊びの 入力を 入れる。script：[(秒, 'tap'|'play')]。60秒 まで 1秒ごとに 見る"""
    code = r"""
let NOW = 0; const RealDate = Date; Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } };
const els = { idleCard: { hidden: true, classList: { add() {}, remove() {} }, contains: () => false }, intro: { hidden: true } }, listeners = {}, ticks = [];
global.window = { requestAnimationFrame: f => f() }; global.document = { readyState: 'complete', hidden: false, getElementById: id => els[id] || null, querySelectorAll: () => [], addEventListener: (t, f) => { listeners[t] = f; } };
global.setInterval = f => ticks.push(f);
const performance = { now: () => NOW };
""" + IDLE + "\nlet playInteracted = false;\n" + line(GAME, "let playT0 = ", "") + line(GAME, "const notePlayInput = ") + r"""
const SCRIPT = __S__, out = { cardAt: null };
for (let ms = 0; ms <= 60000; ms += 100) {
  NOW = ms;
  for (const [t, k] of SCRIPT) if (Math.abs(t * 1000 - ms) < 1) { if (k === 'tap') listeners.pointerdown({ target: {} }); notePlayInput(); }
  if (ms % 1000 === 0) ticks.forEach(f => f());
  if (!els.idleCard.hidden && out.cardAt === null) out.cardAt = ms / 1000;
}
out.end = !els.idleCard.hidden;
console.log(JSON.stringify(out));
"""
    return node(code.replace("__S__", json.dumps(script)))


class IdleTilt207(unittest.TestCase):
    def test_tilting_counts_as_play(self):
        """傾けて 転がす だけの 人（はじめに 1回 タップ・あとは 傾き＝notePlayInput が 0.1秒ごと）：60秒 カードが 出ない（前は 45秒で カード → お米が 止まる）"""
        o = idle_run([[1, "tap"]] + [[round(1.1 + i * 0.1, 1), "play"] for i in range(589)])
        self.assertIsNone(o["cardAt"], "傾けて 遊んで いるのに 45秒で「お疲れ様です」の カードが 出る")

    def test_truly_idle_player_still_gets_the_card(self):
        """1回 タップして 机に おいた（傾きが 0.08 より 小さく notePlayInput が 来ない）：これまでどおり 45秒で カード"""
        o = idle_run([[1, "tap"]])
        self.assertEqual(o["cardAt"], 46)
        self.assertTrue(o["end"])
        o = idle_run([[1, "tap"], [20, "tap"]])   # タップする 人：これまでどおり 最後の タップから 45秒
        self.assertIsNone(o["cardAt"])
        self.assertIn("if (Math.hypot(ax, ay) > 0.08) G.notePlayInput();", PIX)   # 傾きは お米を 転がす 力が 0.08 より 大きい ときだけ（机の 上の ゆれは 数えない）
        self.assertIn("var IDLE_CARD_SEC = 45;", IDLE)


class Rules207(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/game.js", "nishio-go/pixel.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_owner_rules_kept(self):
        """運営者の 決まり：最初の click で すぐ 許可・聞く 前は「タップ！」・止まって いる 間は 手本・スタート画面なし・到着／ごほうびの カードなし"""
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("if (event.type === 'touchend') return;", PIX)
        self.assertIn("const first = tiltBtnWanted() && !tiltG.asked;", fn(PIX, "tapDemoTick"))
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"], cwd=ROOT, capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ["showReward(", "id=\"intro\"", "gtag(", "fetch(", "sendBeacon", "XMLHttpRequest"]:
            self.assertNotIn(w, added, w)

    def test_playtest_and_doc(self):
        for k in ["lowDemoKept", "playAskLate"]:
            self.assertIn("\n  %s: '" % k, PLAY, k)
            self.assertIn("out.%s = {" % k, PLAY, k)
        self.assertIn("...(await cycle207Checks(browser, R)), ...(await cycle206Checks(browser, R)), ...(await slowStartChecks(browser, R)) };", PLAY)
        self.assertIn("- サイクル207：", DOC)
        self.assertEqual(DOC.count("- サイクル207："), 1)


if __name__ == "__main__":
    unittest.main()
