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


# 寄り道の 一生の 表（docs/meiro.md の サイクル207）。本物の 関数（checkGuide・pickAlt・guideNoPath・weatherGuide・人に 着いた ときの 1かたまり）を
# にせの 世界で 動かす。dist は 緯度だけの 1次元（m）。のこした 行き先は どこに おいて あっても 見つける（savedRec：直す 前の 版でも ふるまいで くらべる）
DETOUR_STUB = r"""
let S = { guide: null, guides: 6, visits: {} }, me = { lat: 0, lng: 0 }, demo = true, spots = [{ id: 'w1' }], log = [], NEAR = [], WIDE = null, WX = null, spotsVersion = 1;
const MAZE_NEAR_MIN = 350, MAZE_NEAR = 900, FIRST_MAX = 200, GUIDE_RANGE = { walk: 2000, play: 3000 }, GUIDE_FAR = 12000, spotMeta = { loaded: true };
const dist = (a, b) => Math.abs(a.lat - b.lat), mazeNow = () => true, fixOk = () => true, guideRadius = () => 40, weatherNow = () => WX;
const guideTarget = () => S.guide && { ...S.guide }, glowArm = () => {}, save = () => {}, renderGuide = () => {}, track = k => log.push(k);
const guideArrived = {}, guideReward = () => 5, ktAskGuide = () => false, komeBanashi = () => [], komeNimotsu = () => [], arriveMsg = () => '', toast = () => {}, rivalSay = () => {};
const $ = () => ({ classList: { remove() {}, toggle() {} } }), placeNpcs = () => [], heardOf = () => '', guideDispName = g => g.name, giveParcel = () => null, hintSay = () => '';
const X1 = { kind: 'spot', id: 'x1', name: '寺', lat: 500, why: '', by: 'まわりのようす' };
const decideGuide0 = (from, wide, tooNearOk, back) => { if (wide) return WIDE; if (!back || tooNearOk) return null; const no = mzNoPathIds(); const c = NEAR.find(x => !no.includes(x.id)); return c ? { ...c, alts: [X1] } : null; };
const decideGuide = () => (WX && WX.raining ? { kind: 'spot', id: 'roof', name: '資料館', lat: 300, weather: true } : { kind: 'spot', id: 'other', name: 'ほか', lat: 600 });
"""

G = {"kind": "npc", "id": "ibun-parish", "name": "氏子のおばあさん（伊文神社）", "lat": 836, "why": "北の伊文神社に…", "by": "駅前の学生の話", "refer": True, "byId": "station-student", "near": True, "alts": [{"kind": "spot", "id": "f-kozenji", "name": "康全寺", "lat": 723}]}
P1 = {"kind": "spot", "id": "w1", "name": "名鉄高架下公園", "lat": 173, "why": "公園", "by": "まわりのようす"}
P2 = {"kind": "spot", "id": "w2", "name": "ちいさな 公園", "lat": 150, "why": "公園", "by": "まわりのようす"}
Q = {"kind": "spot", "id": "q", "name": "ふつうの 名所", "lat": 300, "why": "", "by": "まわりのようす"}

DETOUR_RUN = r"""
const savedRec = () => S.guideBack || (S.guide && S.guide.back) || null;
const snap = () => { const g = S.guide, b = savedRec(); return { id: g && g.id, saved: b, guide: g, chips: g ? (g.alts || []).map(a => a.id) : [] }; };
function act(a) {
  const [k, v] = a.split(':');
  if (k === 'load') { backNear.id = S.guide && S.guide.id; checkGuide(); }
  else if (k === 'reload') { S = JSON.parse(JSON.stringify(S)); backNear.id = S.guide && S.guide.id; checkGuide(); }
  else if (k === 'pick') { const i = (S.guide.alts || []).findIndex(x => x.id === v); if (i < 0) throw new Error('no chip ' + v + ' in ' + JSON.stringify(S.guide.alts)); pickAlt(i); }
  else if (k === 'tap') S.guide.picked = true;   // お米つぶの 会話で おすすめを タップ（ktAskGuide の then と 同じ しるし）
  else if (k === 'arrive') { me = { lat: S.guide.lat, lng: 0 }; if (S.guide.kind === 'npc') npcArrive({ id: S.guide.id, name: S.guide.name, spotName: '' }); else checkGuide(); }
  else if (k === 'nopath') guideNoPath(S.guide);
  else if (k === 'far') { me = { lat: 2000, lng: 0 }; checkGuide(); }
  else if (k === 'rain') { WX = { raining: true, kind: 'rain', icon: '☔', name: '雨' }; weatherGuide.key = ''; checkGuide(); }
  else throw new Error(a);
}
const out = [];
for (const r of ROWS) {
  S = { guide: { ...r.g, t: 1 }, guides: 6, visits: {} }; me = { lat: 0, lng: 0 }; NEAR = r.near || []; WIDE = r.wide || null; WX = null; mzNoPath.clear(); guideNoPath.ts = [];
  try { for (const a of r.steps) act(a); out.push(snap()); } catch (e) { out.push({ err: String(e.message || e).slice(0, 200) }); }
}
console.log(JSON.stringify(out));
"""


def detour_rows(rows):
    npc = block(GAME, "    const mzKeep = ", "    if (arrived) rivalSay(")
    code = DETOUR_STUB.replace("__G__", "")
    for name in ["const mzNoPath = ", "const mzNoPathIds = ", "const backNear = ", "const guideKeep = ", "const ownPick = ", "const guideFull = "]:
        code += line(GAME, name, "")
    for f in ["detourStart", "detourEnd", "detourPick", "backNearCheck", "backPick", "setGuide", "checkGuide", "guideNoPath", "weatherGuide", "pickAlt"]:
        code += fn(GAME, f, "")
    code += "function npcArrive(n) {\n  const arrived = S.guide && S.guide.kind === 'npc' && S.guide.id === n.id ? S.guide : null; const say = [], brief = { marks: '' };\n  if (arrived) guideReward(arrived);\n" + npc + "}\n"
    code += "const ROWS = " + json.dumps(rows, ensure_ascii=False) + ";\n" + DETOUR_RUN
    return node(code)


NPC1 = {**P1, "kind": "npc", "id": "n1", "name": "公園の 人（公園）"}
# 寄り道の 一生（いま → できごと → のこした 行き先・札・しるし）。G：前回 ゲームが えらんだ 遠い 行き先（人の すすめ・ほかの 候補つき）
MATRIX = [
    ("ひらく：遠い・ゲームが えらんだ → 近い ゴールが 先", {"g": G, "near": [P1], "steps": ["load"]}, {"id": "w1", "saved": "G", "chips": ["ibun-parish", "x1"], "near": True}),
    ("ひらく：自分で 選んだ（mine）→ そのまま", {"g": {**G, "mine": True}, "near": [P1], "steps": ["load"]}, {"id": "ibun-parish", "saved": None, "mine": True}),
    ("ひらく：おすすめを タップした（picked）→ そのまま", {"g": {**G, "picked": True}, "near": [P1], "steps": ["load"]}, {"id": "ibun-parish", "saved": None, "picked": True}),
    ("ひらく：のこった 行き先が 近い → そのまま", {"g": {**G, "lat": 180}, "near": [P1], "steps": ["load"]}, {"id": "ibun-parish", "saved": None}),
    ("ひらく：近い 帯に 何も ない（広い 範囲の 1.5km 先だけ）→ 寄り道しない", {"g": G, "wide": {**Q, "id": "far1", "lat": 1500}, "steps": ["load"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道 → 保存・ひらきなおす → そのまま", {"g": G, "near": [P1], "steps": ["load", "reload"]}, {"id": "w1", "saved": "G"}),
    ("寄り道 → 札で のこした 行き先 → 記録の まま・自分で 選んだ", {"g": G, "near": [P1], "steps": ["load", "pick:ibun-parish"]}, {"id": "ibun-parish", "saved": None, "full": True, "mine": True}),
    ("寄り道 → のこした 行き先を えらぶ → 保存・ひらきなおす → そのまま", {"g": G, "near": [P1], "steps": ["load", "pick:ibun-parish", "reload"]}, {"id": "ibun-parish", "saved": None, "full": True, "mine": True}),
    ("寄り道 → 札で ほかの 所 → のこした 行き先は 札と 記録に", {"g": G, "near": [P1], "steps": ["load", "pick:x1"]}, {"id": "x1", "saved": "G", "chip": "ibun-parish", "mine": True}),
    ("寄り道 → ほかの 所 → 近い ゴールへ もどす → 着く → のこした 行き先", {"g": G, "near": [P1], "steps": ["load", "pick:x1", "pick:w1", "arrive"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道 → ほかの 所 → 保存・ひらきなおす → のこした 行き先を えらぶ", {"g": G, "near": [P1], "steps": ["load", "pick:x1", "reload", "pick:ibun-parish"]}, {"id": "ibun-parish", "saved": None, "full": True, "mine": True}),
    ("寄り道 → ほかの 所に 着く → のこした 行き先", {"g": G, "near": [P1], "steps": ["load", "pick:x1", "arrive"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道 → 近い ゴールに 着く → のこした 行き先", {"g": G, "near": [P1], "steps": ["load", "arrive"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道（人）→ 人に 着く → のこした 行き先", {"g": G, "near": [NPC1], "steps": ["load", "arrive"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道 → 道すじが ない → ほかの 近い ゴール", {"g": G, "near": [P1, P2], "steps": ["load", "nopath"]}, {"id": "w2", "saved": "G", "chip": "ibun-parish"}),
    ("寄り道 → 道すじが ない・ほかに ない → のこした 行き先", {"g": G, "near": [P1], "steps": ["load", "nopath"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道 → 遠くへ 行った（えらびなおし）→ のこした 行き先", {"g": G, "near": [P1], "steps": ["load", "far"]}, {"id": "ibun-parish", "saved": None, "full": True}),
    ("寄り道 → 雨 → そのまま", {"g": G, "near": [P1], "steps": ["load", "rain"]}, {"id": "w1", "saved": "G"}),
    ("寄り道 → ほかの 所 → 雨 → そのまま", {"g": G, "near": [P1], "steps": ["load", "pick:x1", "rain"]}, {"id": "x1", "saved": "G"}),
    ("寄り道なし・おすすめを タップ（picked）→ 雨 → そのまま", {"g": Q, "steps": ["tap", "rain"]}, {"id": "q", "saved": None, "picked": True}),
    ("寄り道なし・ゲームが えらんだ → 雨 → 屋根の ある 所（サイクル206 の まま）", {"g": Q, "steps": ["rain"]}, {"id": "roof", "saved": None}),
]


class DetourMatrix207(unittest.TestCase):
    def test_every_row(self):
        """のこした 行き先と その 記録は、ゲームが 自分から する ことでは なくならない。かえられるのは 自分の 選択だけ（その ときも 札に のこる）"""
        res = detour_rows([r[1] for r in MATRIX])
        bad = []
        for (name, row, want), got in zip(MATRIX, res):
            if "err" in got:
                bad.append("%s: %s" % (name, got["err"])); continue
            g, saved = got["guide"] or {}, got["saved"]
            why = []
            if got["id"] != want["id"]:
                why.append("行き先 %s（ほしい %s）" % (got["id"], want["id"]))
            if want["saved"] is None and saved:
                why.append("のこした 行き先が のこって いる")
            if want["saved"] == "G":
                if not saved or saved.get("id") != G["id"]:
                    why.append("のこした 行き先が きえた")
                elif saved.get("alts") != G["alts"] or saved.get("refer") is not True or saved.get("byId") != G["byId"]:
                    why.append("のこした 行き先の 記録が かけた %s" % json.dumps(saved, ensure_ascii=False)[:120])
            if want.get("full") and (g.get("alts") != G["alts"] or g.get("refer") is not True or g.get("byId") != G["byId"]):
                why.append("もどった 行き先の 記録が かけた（ほかの 候補・すすめた 人）%s" % json.dumps(g, ensure_ascii=False)[:160])
            if "chips" in want and got["chips"] != want["chips"]:
                why.append("札 %s" % got["chips"])
            if "chip" in want and want["chip"] not in got["chips"]:
                why.append("のこした 行き先が 札に ない %s" % got["chips"])
            for k in ["mine", "picked", "near"]:
                if k in want and bool(g.get(k)) != want[k]:
                    why.append("%s=%s" % (k, g.get(k)))
            if why:
                bad.append(name + "：" + "・".join(why))
        self.assertEqual(bad, [], "\n".join(bad))

    def test_one_place_and_exits(self):
        """のこした 行き先は 1か所（S.guideBack）。かえる 出口は detourStart（始める）・detourEnd（おわる）・detourPick（自分で えらぶ）だけ"""
        writes = re.findall(r"S\.guideBack = [^;]*;", GAME)
        self.assertEqual(sorted(set(writes)), ["S.guideBack = S.guide.back;", "S.guideBack = guideFull(g);", "S.guideBack = null;"])
        self.assertIn("first1 = mazeNear && store.get('nsg_mzgoals', 0) < 1 || mazeNear && !!back;", GAME)
        self.assertIn("const f = decideGuide0(null, false, false, true) || decideGuide0(null, false, true, true);", fn(GAME, "backPick", ""))   # はじめての ゴールの 帯だけ（広い 範囲は 近く ない）
        self.assertIn("      else { g.picked = true; save(); }", GAME)   # おすすめを タップ ＝ 自分で 選んだ
        for f in ["guideNoPath", "weatherGuide"]:
            self.assertIn("ownPick(", fn(GAME, f), f)   # picked も mine と 同じく ゲームの えらびなおしから まもる
        self.assertIn("const farLimit = mazeNow() && !ownPick(g) ?", GAME)
        self.assertIn("guideKept: () => !!(S.guide && (S.guide.mine || S.guide.refer || S.guide.byId)) || ownPick(S.guide)", GAME)


class SpotsWait207(unittest.TestCase):
    """L1：spots.json の 返事が 来ない・おそい。本物の loadSpots・doLoadSpots を にせの 時計で 動かす（FETCH_MS：spots.json の 返事・OSM_MS：Overpass の 返事。-1＝来ない）"""
    STUB = """
let T = 0, seq = 0, builds = 0, spots = [], spotsVersion = 0, FETCH_MS = -1, OSM_MS = -1, BAKED = true;
const timers = new Map();
const setTimeout = (f, ms) => { timers.set(++seq, { f, at: T + ms }); return seq; }, clearTimeout = id => { timers.delete(id); };
async function tick(ms) { const end = T + ms; for (;;) { for (let i = 0; i < 30; i++) await null; const t = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!t || t[1].at > end) break; T = t[1].at; timers.delete(t[0]); t[1].f(); } T = end; for (let i = 0; i < 30; i++) await null; }
const later = (ms, v) => new Promise((ok, no) => { if (ms >= 0) setTimeout(() => (v instanceof Error ? no(v) : ok(v)), ms); });
const fetch = () => later(FETCH_MS, { ok: true, json: async () => ({ spots: [{ id: 'f-a' }] }) });
const buildSpots = (c, it) => { builds++; return [...c.map(x => ({ ...x, featured: true })), ...it.map(i => ({ id: i[0] }))]; };
const matchesOf = c => [c.id], buildQuery = n => 'q' + n.length, store = { get: () => null, set: () => true, del: () => {} }, OSM_KEY = 'k', CFG = { osmCacheDays: 7 };
const loadBaked = async () => (BAKED ? { q: 'q1', items: [['n1']], t: 1 } : null), fetchOverpass = () => later(OSM_MS, [['n1']]);
const spotMeta = {}, markers = new Map(), npcMarkers = new Map(), toast = () => {};
const renderMarkers = () => {}, refreshNearby = () => {}, renderNpcMarkers = () => {}, glowRestore = () => {}, treasureRestore = () => {}, treasureArm = () => {}, renderSpotInfo = () => {};
const buildQueryParts = () => ['a'];
let spotsLoading = null;
const st = () => ({ T, loading: !!spotsLoading, feat: spots.filter(s => s.featured).length, ids: spots.map(s => s.id), builds });
"""

    def run_js(self, tail):
        src = self.STUB + fn(GAME, "spotsJson", "") + line(GAME, "const SPOTS_WAIT_MS = ", "") + line(GAME, "let spotsLate = ", "") + fn(GAME, "spotsConfig", "") + fn(GAME, "spotsAgain", "")
        src += fn(GAME, "loadSpots").replace("function loadSpots(", "function loadSpots(") + fn(GAME, "doLoadSpots")
        return node(src + "(async () => {" + tail + "})();")

    def test_hanging_file_gives_up_after_6s(self):
        """返事が 来ない → 6秒で 注目スポットなしで 先へ（名所は できる）。20秒 あとに 1回だけ 読みなおす"""
        o = self.run_js("OSM_MS = 100; loadSpots(); await tick(5900); const a = st(); await tick(400); const b = st(); await tick(20500); const c = st(); await tick(120000); console.log(JSON.stringify({ a, b, c, d: st() }));")
        self.assertTrue(o["a"]["loading"])
        self.assertFalse(o["b"]["loading"], "spots.json の 返事が 来ないと 名所の 読みこみが おわらない")
        self.assertEqual(o["b"]["ids"], ["n1"])
        self.assertTrue(o["c"]["loading"])   # 26秒：読みなおし（1回だけ）
        self.assertEqual(o["d"]["builds"], 3)   # はじめ（早い 札 ＋ 本番）＋ 読みなおし（本番）・その あとは ない
        self.assertFalse(o["d"]["loading"])

    def test_late_answer_is_used_even_when_the_first_load_is_slow(self):
        """Codex の 指摘：spots.json が 10秒・Overpass が 30秒 かかると、26秒の 読みなおしが 読みこみ中に 当たって 消え、注目スポットが ずっと 出なかった。
        → おくれて 来た 返事を すてずに、読みこみが おわってから 入れる（名所は 作りなおす だけ・ふえない）"""
        o = self.run_js("FETCH_MS = 10000; OSM_MS = 30000; BAKED = false; loadSpots(); await tick(26500); const a = st(); await tick(200000); console.log(JSON.stringify({ a, b: st() }));")
        self.assertTrue(o["a"]["loading"])
        self.assertEqual(o["b"]["feat"], 1, "おくれて 来た spots.json が 入らない（注目スポットが 出ない）")
        self.assertEqual(sorted(o["b"]["ids"]), ["f-a", "n1"])   # ふえない
        self.assertFalse(o["b"]["loading"])

    def test_normal_answer_is_unchanged(self):
        o = self.run_js("FETCH_MS = 300; loadSpots(); await tick(40000); console.log(JSON.stringify(st()));")
        self.assertEqual((o["ids"], o["builds"], o["loading"]), (["f-a", "n1"], 2, False))
        o = self.run_js("FETCH_MS = 61000; loadSpots(); await tick(30000); console.log(JSON.stringify(st()));")
        self.assertEqual(o["feat"], 0)   # 6秒で 先へ
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

    def test_view_stops_when_the_demo_stops(self):
        """Codex の 指摘：寄せる 目当てを 決めた あと 窓を 開くと、手本は 消えるのに 地図だけ 動きつづけた。手本を 出さない 間（tapDemoTick の ok が 偽）は その 場で 止める"""
        gate = line(PIX, "  if (!ok && !moved) { demoLead.tx", "")
        o = node(lead_code("function gate(ok, moved) {\n" + gate + "}\n"
                           "pick(); for (let i = 0; i < 8; i++) frame(true); const a = cam.y; gate(false, false); for (let i = 0; i < 200; i++) frame(true); const b = cam.y;"
                           " gate(true, false); pick(); for (let i = 0; i < 200; i++) frame(true); console.log(JSON.stringify({ a, b, c: cam.y }));"))
        self.assertGreater(o["a"], 10.5)
        self.assertAlmostEqual(o["b"], o["a"], places=6, msg="手本を 出さない 間も 地図が 動きつづける")
        self.assertAlmostEqual(o["c"] - 10.5, (106 / 2 - 34) / 16, places=2)   # また 出せる ように なったら つづきから

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
