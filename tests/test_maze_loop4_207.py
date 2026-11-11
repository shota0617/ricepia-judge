"""第4弾サイクル207：はじめの 1分で やめる 人を へらす（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」・2026-11-11「最初の1分の改善はこのやり方に変更」）。
さがし役が 見つけた 欠陥を 直す：
(1) もどって きた 人の はじめの ゴールが 遠い（70〜100秒 先）→ はじめての 人と 同じ きまりで 近い ゴールを 先に。のこって いた 行き先は 消さずに 次へ。
(2) spots.json の 返事が 来ないと 行き先も 手本も 出ない → 6秒で あきらめて 先へ（裏で 1回 読みなおす）。
(3) 横向きの 低い 画面で、1回 歩くと「タップ！」の 指が 二度と 出ない → 地図を 道すじの 先へ 寄せる・たんけんの 1行を 出さない。
    🌀（西尾めいろ）の ボタンが 上の バーの 下・傾きの ボタンの 下に もぐる → 低い 横向きでは 傾きの ボタンの 下に 置く。
(4) 読みこみが おそいと、はじめての ゴールの すぐ あとに「めいろ、どうだった？」→ ゴールの 時間は はじめて 手で 動かした ときから。
どの テストも、直す 前（サイクル206）にも ある 関数（checkGuide・doLoadSpots・tapDemoTick の 中・カメラ・下の 欄の 文・mazeGoal）を
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


# checkGuide を にせの 世界で 動かす。dist は 緯度だけの 1次元（m）。decideGuide0（はじめての 人の きまり）は back の ときだけ 近い 公園、
# decideGuide（ふだん）は いつも 別の 所 'other' を かえす
GUIDE_STUB = """
let S = { guide: __GUIDE__, guides: 6 }, me = __ME__, demo = true, spots = [{ id: 'w1' }], log = [];
const MAZE_NEAR_MIN = 350, MAZE_NEAR = 900, GUIDE_RANGE = { walk: 2000, play: 3000 }, GUIDE_FAR = 12000, spotMeta = { loaded: true };
const dist = (a, b) => Math.abs(a.lat - b.lat), mazeNow = () => true, fixOk = () => true, guideRadius = () => 40;
const guideTarget = () => S.guide && { ...S.guide }, glowArm = () => {}, save = () => {}, renderGuide = () => {}, track = k => log.push(k);
const weatherGuide = () => {}, guideArrived = {}, guideReward = () => 5, ktAskGuide = () => false, komeBanashi = () => [], komeNimotsu = () => [], arriveMsg = () => '', toast = () => {}, rivalSay = () => {};
const PARK = { kind: 'spot', id: 'w1', name: '名鉄高架下公園', lat: 173 };
const decideGuide0 = (from, wide, tooNearOk, back) => (back && !tooNearOk ? { ...PARK, alts: [{ id: 'x1', lat: 500 }] } : null);
const decideGuide = () => ({ kind: 'spot', id: 'other', name: 'ほか', lat: 600 });
"""

FAR = {"kind": "npc", "id": "ibun-parish", "name": "氏子のおばあさん（伊文神社）", "lat": 836, "refer": True, "byId": "station-student", "near": True, "alts": [{"id": "f-kozenji", "lat": 723}], "t": 1}


def guide_run(guide, me, tail):
    code = GUIDE_STUB.replace("__GUIDE__", json.dumps(guide)).replace("__ME__", json.dumps(me))
    code += line(GAME, "const backNear = ", "") + line(GAME, "const guideKeep = ", "") + fn(GAME, "backNearCheck", "") + fn(GAME, "backPick", "")
    code += fn(GAME, "setGuide") + fn(GAME, "checkGuide") + tail
    return node(code)


class BackNear207(unittest.TestCase):
    def test_far_saved_goal_gets_a_near_goal_first(self):
        """R1：ひらいた ときの 行き先が 350m より 遠い → 近い ゴールが 先。遠い 行き先は 消えず、ほかの 行き先の 1つめ と 次の ゴール（back）"""
        o = guide_run(FAR, {"lat": 0}, "checkGuide(); const g1 = S.guide; checkGuide(); console.log(JSON.stringify({ g1, g2: S.guide.id, log }));")
        g = o["g1"]
        self.assertEqual(g["id"], "w1", "もどって きた 人の はじめの ゴールが 遠い まま")
        self.assertTrue(g.get("near"))
        self.assertEqual((g.get("back") or {}).get("id"), "ibun-parish")
        self.assertTrue(g["back"]["refer"])   # 人の すすめ・すすめた 人・ほかの 候補は そのまま
        self.assertEqual(g["back"]["byId"], "station-student")
        self.assertEqual(g["back"]["alts"], FAR["alts"])
        self.assertNotIn("back", g["back"])
        self.assertEqual([a["id"] for a in g["alts"]], ["ibun-parish", "x1"])   # 札から すぐ もどせる・同じ 所は 2回 出さない
        self.assertIn("guide_back_near", o["log"])
        self.assertEqual(o["g2"], "w1")   # 1回だけ

    def test_arriving_at_the_near_goal_goes_back_to_the_saved_one(self):
        """近い ゴールに 着いたら、次は のこして いた 行き先（ふだんの えらびなおしでは ない）"""
        near = {"kind": "spot", "id": "w1", "name": "名鉄高架下公園", "lat": 173, "near": True, "back": {k: v for k, v in FAR.items() if k != "t"}}
        o = guide_run(near, {"lat": 173}, "checkGuide(); console.log(JSON.stringify({ id: S.guide.id, refer: S.guide.refer, back: S.guide.back || null }));")
        self.assertEqual(o["id"], "ibun-parish", "近い ゴールの 次が のこして いた 行き先に ならない")
        self.assertTrue(o["refer"])
        self.assertIsNone(o["back"])

    def test_goal_the_player_picked_is_kept(self):
        """自分で 選んだ 遠い 行き先（mine：ほかの 行き先の 札・コース／picked：お米つぶの 会話で おすすめを タップ）は、もどって きても その まま。ゲームが えらんだ 行き先だけ 近い ゴールを 先に"""
        for k in ["mine", "picked"]:
            o = guide_run({**FAR, k: True}, {"lat": 0}, "checkGuide(); console.log(JSON.stringify([S.guide.id, !!S.guide.back]));")
            self.assertEqual(o, ["ibun-parish", False], k)
        o = guide_run(FAR, {"lat": 0}, "checkGuide(); console.log(JSON.stringify(S.guide.id));")
        self.assertEqual(o, "w1")   # ゲームが えらんだ（人の すすめを ゲームが たどった）行き先
        self.assertIn("      else { g.picked = true; save(); }", GAME)   # おすすめを タップ ＝ 自分で 選んだ
        self.assertIn("mine: true, alts: [keep(g)", GAME)   # ほかの 行き先の 札は これまでどおり mine

    def test_near_or_not_closer_is_left_alone(self):
        """のこって いた 行き先が 近い ときは かえない"""
        near_goal = {**FAR, "lat": 180}
        self.assertEqual(guide_run(near_goal, {"lat": 0}, "checkGuide(); console.log(JSON.stringify(S.guide.id));"), "ibun-parish")

    def test_same_order_as_a_fresh_player(self):
        """近い 帯 → 60m まで → 広い 範囲 → 広い 範囲で 60m まで（decideGuide と 同じ 順）。はじめての 人の きまりは そのまま"""
        self.assertIn("decideGuide0(null, false, false, true) || decideGuide0(null, false, true, true) || decideGuide0(null, true) || decideGuide0(null, true, true)", fn(GAME, "backPick", ""))
        self.assertIn("first1 = mazeNear && store.get('nsg_mzgoals', 0) < 1 || mazeNear && !!back;", GAME)
        self.assertIn("if (!mazeNow() || !fixOk() || !spotMeta.loaded) return;", fn(GAME, "backNearCheck", ""))   # 名所を ぜんぶ 読むまで 待つ
        self.assertIn("const g = mzKeep || back ? null : decideGuide(n);", GAME)   # 人の ゴールでも
        self.assertIn("if (cur.back) { setGuide(backPick(cur.back) || cur.back); return true; }", fn(GAME, "guideNoPath"))
        self.assertIn("if (!g || g.refer || g.mine || g.back ||", fn(GAME, "weatherGuide"))


class SpotsWait207(unittest.TestCase):
    STUB = """
let T = 0, seq = 0, loads = 0, spots = [], spotsVersion = 0;
const timers = new Map();
const setTimeout = (f, ms) => { timers.set(++seq, { f, at: T + ms }); return seq; }, clearTimeout = id => { timers.delete(id); };
async function tick(ms) { const end = T + ms; for (;;) { for (let i = 0; i < 20; i++) await null; const t = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!t || t[1].at > end) break; T = t[1].at; timers.delete(t[0]); t[1].f(); } T = end; for (let i = 0; i < 20; i++) await null; }
const loadSpots = () => { loads++; };
const buildSpots = (c, it) => [...c.map(x => ({ ...x, featured: true })), ...it.map(i => ({ id: i[0] }))];
const matchesOf = c => [c.id], buildQuery = n => 'q' + n.length, store = { get: () => null, set: () => true, del: () => {} }, OSM_KEY = 'k', CFG = { osmCacheDays: 7 };
const loadBaked = async () => ({ q: 'q0', items: [['n1']], t: 1 }), fetchOverpass = async () => { throw new Error('no'); };
const spotMeta = {}, markers = new Map(), npcMarkers = new Map(), toast = () => {};
const renderMarkers = () => {}, refreshNearby = () => {}, renderNpcMarkers = () => {}, glowRestore = () => {}, treasureRestore = () => {}, treasureArm = () => {}, renderSpotInfo = () => {};
"""

    def run_js(self, fetch, tail):
        src = self.STUB + "const fetch = " + fetch + ";\n" + fn(GAME, "spotsJson", "") + line(GAME, "const SPOTS_WAIT_MS = ", "") + line(GAME, "let spotsLate = ", "") + fn(GAME, "spotsConfig", "") + fn(GAME, "doLoadSpots")
        return node(src + "(async () => {" + tail + "})();")

    def test_hanging_file_gives_up_after_6s(self):
        """L1：返事が 来ない → 6秒で 注目スポットなしで 先へ（名所は できる）。20秒 あとに 1回だけ 読みなおす"""
        o = self.run_js("() => new Promise(() => {})",
                        "let done = false; doLoadSpots(false).then(() => { done = true; }); await tick(5900); const before = done; await tick(300);"
                        " const at6 = done, n = spots.length; await tick(20000); console.log(JSON.stringify({ before, at6, n, loads, loaded: !!spotMeta.loaded }));")
        self.assertFalse(o["before"])
        self.assertTrue(o["at6"], "spots.json の 返事が 来ないと 名所の 読みこみが おわらない")
        self.assertTrue(o["loaded"])
        self.assertGreater(o["n"], 0)
        self.assertEqual(o["loads"], 1)

    def test_retry_waits_longer_and_only_once(self):
        o = self.run_js("() => new Promise(() => {})",
                        "doLoadSpots(false); await tick(26500); let d2 = false; doLoadSpots(false).then(() => { d2 = true; }); await tick(7000); const mid = d2; await tick(60000);"
                        " await tick(30000); console.log(JSON.stringify({ mid, d2, loads }));")
        self.assertFalse(o["mid"])   # 裏の 読みなおしは 60秒 待つ
        self.assertTrue(o["d2"], "spots.json の 返事が 来ないと 名所の 読みこみが おわらない")
        self.assertEqual(o["loads"], 1)

    def test_normal_answer_is_unchanged(self):
        o = self.run_js("async () => ({ ok: true, json: async () => ({ spots: [{ id: 'f-a' }] }) })",
                        "await doLoadSpots(false); await tick(30000); console.log(JSON.stringify({ ids: spots.map(s => s.id), loads, left: timers.size }));")
        self.assertEqual(o, {"ids": ["f-a", "n1"], "loads": 0, "left": 0})
        o = self.run_js("async () => { throw new Error('offline'); }", "await doLoadSpots(false); await tick(30000); console.log(JSON.stringify({ ids: spots.map(s => s.id), loads }));")
        self.assertEqual(o, {"ids": ["n1"], "loads": 0})
        self.assertNotIn("AbortSignal.timeout(", GAME)   # 古い Safari に ない


# tapDemoTick の 中（置き場を さがした あと）と カメラの 1こま。お米（10.5, 10.5）・道すじは 下へ。見える 地図 106px（568×320 で 1回 歩いた あと）
LEAD_STUB = """
let rp = { x: 10.5, y: 10.5, vx: 0, vy: 0 }, cover = 214, sp = null, cam = { x: 10.5, y: 10.5 };
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
        for k in ["backNearGoal", "spotsHang", "lowDemoKept", "playAskLate"]:
            self.assertIn("\n  %s: '" % k, PLAY, k)
            self.assertIn("out.%s = {" % k, PLAY, k)
        self.assertIn("...(await cycle207Checks(browser, R)), ...(await cycle206Checks(browser, R)), ...(await slowStartChecks(browser, R)) };", PLAY)
        self.assertIn("- サイクル207：", DOC)
        self.assertEqual(DOC.count("- サイクル207："), 1)


if __name__ == "__main__":
    unittest.main()
