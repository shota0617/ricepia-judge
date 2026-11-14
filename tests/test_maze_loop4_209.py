"""第4弾サイクル209：最初の タップの 手本を 大きく 分かりやすく（運営者の声 2026-11-12「最初のタップの文字を大きくわかりやすく」・実機の 画面写真つき）
＋ 低い 横向きで ゴールの 1〜2マス 手前に 止まると 手本の 指が 出ない（N1b。確かめ役が 再現：568×320 で 4回中 4回）。
(1) 最初の 手本（まだ 傾きの 許可を 聞いて いない 間＝.first）は、置ける 所が あれば 大きい 形（.big）：指 38 → 56px・札の 字 15 → 24px の 太字・ふち 3px・外の ふちと かげ。
    置けなければ これまでの 大きさ（大きく した ことで 手本が 出ない 場面を ふやさない）。2回めから の 手本の 大きさは かえない。
(2) 道すじの マスに 置けない（のこり 1〜2マス で、低い 横向きは 1マスの 絵が 8px・ゴールの マスが ぜんぶ お米から 40px の 内）ときは、
    ゴールの 着く 近さの 中の めいろの マス（お米の マスから 行ける 所）も 指す。
どの テストも、直す 前（サイクル208 の 前の main）にも ある 物（style.css の 札・tapDemoLayout・tapDemoSpot）を 動かして、ふるまいで 落ちる（新しい 物は ある ときだけ 入れる）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn(src, name, missing=None):
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


def node(code):
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise AssertionError(r.stderr[-1500:])
    return json.loads(r.stdout)


def css_value(selector_re, prop):
    """selector_re に 合う ルールの うち、prop を もつ さいごの 値（CSS は あとの ルールが かつ）"""
    val = None
    css = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)   # コメントを のぞく
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sels = [s.strip() for s in m.group(1).split(",")]
        if any(re.fullmatch(selector_re, s) for s in sels):
            p = re.search(r"(?:^|;)\s*%s\s*:\s*([^;]+)" % re.escape(prop), m.group(2))
            if p:
                val = p.group(1).strip()
    return val


def px(v):
    return float(re.match(r"([\d.]+)px", v).group(1))


class FirstTapBig209(unittest.TestCase):
    def test_first_label_is_big(self):
        """最初の 手本（置ける とき）の「タップ！」は 22px 以上の 太字・ふち 3px 以上・外に かげ。指は 38px の 1.4倍 以上"""
        lab = css_value(r"#tapDemo\.first(\.big)?::after", "font-size")
        self.assertGreaterEqual(px(lab), 22, "最初の タップの 札の 字が 小さい（%s）" % lab)
        self.assertGreaterEqual(int(css_value(r"#tapDemo\.first(\.big)?::after", "font-weight")), 800)
        self.assertGreaterEqual(px(css_value(r"#tapDemo\.first(\.big)?::after", "border-width") or "0px"), 3)
        self.assertRegex(css_value(r"#tapDemo\.first(\.big)?::after", "box-shadow") or "", r"0 0 0 \dpx #fff")   # 地図の 上で 見分ける 白い ふち
        hand = css_value(r"#tapDemo(\.first)?(\.big)?", "font-size")
        self.assertGreaterEqual(px(hand), 38 * 1.4, "最初の タップの 指が 小さい（%s）" % hand)

    def test_later_demo_unchanged(self):
        """2回めから の 手本（.first で ない）は これまでの 大きさ。札の 字も（大きい 形は .big だけ）"""
        self.assertEqual(css_value(r"#tapDemo", "font-size"), "38px")
        self.assertEqual(css_value(r"#tapDemo\.first::after", "font-size"), "15px")
        self.assertIn("const DEMO_HAND = { w: 44, h: 38, move: 14, pad: 2 }, DEMO_LAB = { w: 96, h: 32, gap: 4, top: 8, below: 46 };", PIX)

    def test_layout_sizes_match_css(self):
        """置き場の 計算の 大きさ（DEMO_HAND1・DEMO_LAB1）は CSS と そろう：指 60×56・札 136×48 ＋ 外の ふち 5px"""
        m = re.search(r"const DEMO_HAND1 = \{ w: (\d+), h: (\d+),[^}]*\}, DEMO_LAB1 = \{ w: (\d+), h: (\d+), gap: (\d+), top: (\d+), below: (\d+) \};", PIX)
        self.assertTrue(m, "最初の 大きい 手本の 大きさが ない")
        w, h, lw, lh, gap, top, below = map(int, m.groups())
        self.assertEqual((w, h), (px(css_value(r"#tapDemo\.first\.big", "width")), px(css_value(r"#tapDemo\.first\.big", "font-size"))))
        self.assertEqual(below, px(css_value(r"#tapDemo\.first\.big::after", "top")) - 5)
        self.assertEqual((lw, lh), (136 + 10, 48 + 10))


# ---------- tapDemoSpot を 小さな めいろで 動かす（低い 横向き 568×320：1マスの 絵 8px・見える 地図 52〜178px） ----------
SPOT_STUB = r"""
const MZ_K = 3, TILE_M = 8, T = 8, RICE = { x: 284, y: 139 };   // RICE：お米の 画面の 点（テストで かえる）
let rp = { x: 1.5, y: 1.5 }, BOX = [0, 52, 568, 178];
const mzRt = {}, tiltBtn = null, shopHits = [], mzMap = { arrow: null };
const tileClient = (x, y) => ({ x: RICE.x + (x - (rp.x - 0.5)) * T, y: RICE.y + (y - (rp.y - 0.5)) * T });
const camTile = () => ({ x: rp.x, y: rp.y }), toTile = (lat, lng) => ({ x: lng, y: lat }), mazeOn = () => true;
const G = { spots: [], guide: { kind: 'npc', id: 'g', lat: 1.5, lng: 6.5 }, reachOf: () => 40 };
// めいろ：よこに 長い 道（マス x = -3..6, y = 0）。ほかは 生け垣
const mzOpen = (x, y, dx, dy) => y === 0 && dy === 0 && x + dx >= -3 && x + dx <= 6;
const cv = { getBoundingClientRect: () => ({ left: BOX[0], top: BOX[1], right: BOX[2], bottom: 320, width: 568, height: 268 }) };
const $ = id => (id === 'sheet' ? { getBoundingClientRect: () => ({ top: BOX[3], height: 142 }) } : null);
const window = { innerWidth: 568 }, document = { querySelectorAll: () => [] };
// ゴールの 人の 絵（タップで 窓が 開く）：ゴールの 所の まわり 10px
const GOALPX = () => tileClient(6.5, 1.5);
const tapDemoWalks = (q, slop) => { const g = GOALPX(); return Math.hypot(q.x - g.x, q.y - g.y) > 10 + (slop || 0) && q.y > BOX[1] && q.y < BOX[3]; };
"""


def spot_code(run):
    defs = "".join(line(PIX, s, "") for s in ["const DEMO_AHEAD", "const DEMO_SLOP = ", "const DEMO_HAND_TAP = ", "const DEMO_HAND = ", "const DEMO_HAND1 = ", "const DEMO_HAND1_PTS = "])
    defs = defs.replace("const DEMO_TAP_MS = 900, DEMO_AHEAD = 3;", "const DEMO_AHEAD = 3;")
    if "DEMO_AHEAD" not in defs:
        defs += "const DEMO_AHEAD = 3;\n"
    return SPOT_STUB + defs + fn(PIX, "demoHandClear", "") + fn(PIX, "tapDemoLayout") + fn(PIX, "tapDemoGoalSpot", "") + fn(PIX, "tapDemoSpot") + run


class LowGoalDemo209(unittest.TestCase):
    def test_one_or_two_cells_before_goal(self):
        """N1b：低い 横向きで ゴールの 1・2マス 手前に 止まって いる（道すじの マスは ぜんぶ お米から 40px の 内）：指を 置く 所が ある（ゴールの 近さの 中の マス）。
        置いた 所は お米から 40px 以上・ゴールの 人の 絵の 上で ない"""
        out = node(spot_code("""
const res = [];
for (const [k, first] of [[1, false], [2, false], [1, true], [2, true]]) {
  rp = { x: (2 - k) * MZ_K + 1.5, y: 1.5 };   // ゴールの マス（x = 2）から k マス 手前
  const path = []; for (let x = 2 - k; x <= 2; x++) path.push([x, 0]);
  const sp = tapDemoSpot(path, first);
  res.push(sp ? { k, first, d: Math.round(Math.hypot(sp.q.x - RICE.x, sp.q.y - RICE.y)), goal: Math.round(Math.hypot(sp.q.x - GOALPX().x, sp.q.y - GOALPX().y)) } : { k, first, none: true });
}
console.log(JSON.stringify(res));"""))
        for r in out:
            self.assertNotIn("none", r, "ゴールの 手前で 指を 置く 所が ない: %r" % r)
            self.assertGreaterEqual(r["d"], 40)
            self.assertGreater(r["goal"], 10)

    def test_big_when_it_fits_else_old_size(self):
        """最初の 手本：広い 画面では 大きい 形（big）。低い 横向きで 大きい 形が 入らない ときは これまでの 大きさで 出す（出ない 場面を ふやさない）"""
        out = node(spot_code("""
rp = { x: 1.5, y: 1.5 };
const path = []; for (let x = 0; x <= 6; x++) path.push([x, 0]);
BOX = [0, 52, 568, 600]; const wide = tapDemoSpot(path, true);
RICE.y = 100; BOX = [0, 52, 568, 120]; const low = tapDemoSpot(path, true);   // 見える 地図 68px：大きい 指（のびる 72px）は 入らない
const later = tapDemoSpot(path, false);
console.log(JSON.stringify({ wide: wide && !!wide.big, low: low ? !!low.big : null, later: later ? !!later.big : null }));"""))
        self.assertTrue(out["wide"], "広い 画面で 最初の 手本が 大きく ならない: %r" % out)
        self.assertIs(out["low"], False, "低い 画面で 最初の 手本が 出ない（これまでの 大きさで 出す）: %r" % out)
        self.assertIs(out["later"], False)   # 2回めから は 大きく しない


# ---------- サイクル209 の 直し（Codex の 指摘 P2）：大きい 手の まん中・手首の タップ ----------
TAPWALK_STUB = r"""
let T = 5000, worldMode = false, driving = false, slopOk = false, spot = null; const performance = { now: () => T }, G = { demo: true }, howtoEl = { hidden: true }, rp = { x: 1 }, tapS = { goal: null }, mzRt = { path: [[0, 0], [1, 0]] };
const tapDemo = { last: null, at: T - 100 }, walks = [], DEMO_SLOP_PX = 18, tiltAsk = { at: -1e9 };
// 名所の 絵（タップで 窓が 開く 所）：(140〜154, 420〜430) と (147, 351) の まわり。地図は 画面と 同じ 大きさ（dpr 1）
let SPOTS = []; const shopHits = [], cv = { width: 390, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390 }) }, fieldHit = (x, y) => SPOTS.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) ? { spot: 1 } : null;
const tapDemoWalks = (q, slop) => slopOk, tapDemoSpot = () => spot, tiltBtnWanted = () => true, tiltG = { asked: false }, swipeTile = (x, y) => [Math.floor(x / 16), Math.floor(y / 16)], tapWalk = (x, y) => { walks.push([x, y]); return true; };
"""


class BigHandTap209(unittest.TestCase):
    def test_tap_on_big_hand_walks(self):
        """最初の 手本の 手の 上（大きい 手 56px の まん中 30px・手首 52px、入らない ときの ふつうの 手 38px の 手首 36px）の タップは 手本の マスへ 歩く（指先が 18px ずれても 歩ける 所でも。
        前は 24px より 外は ふつうの タップに なり、844×390 で 縁の 矢印の 当たりに 入って せかいちずに 切りかわった）。ふつうの 大きさの 手は これまでどおり"""
        code = TAPWALK_STUB + line(PIX, "const DEMO_HAND1 = ", "") + line(PIX, "const DEMO_TAP_R = ") + fn(PIX, "demoWinAt", "") + fn(PIX, "demoTapWalk") + """
const BIG = [72, 60], SMALL = [54, 44];   // 手の 絵の 四角：長さ（指 56／38px ＋ 押す 動き 14 ＋ 2）・はば
const out = {}, last = (h, dn) => { tapDemo.last = { x: 147, y: 381, at: T - 100, hand: h && h[0], hw: h && h[1], dn }; walks.length = 0; };
last(BIG, false); out.mid = demoTapWalk(147, 411);
last(BIG, false); out.wrist = demoTapWalk(147, 433);
last(BIG, false); slopOk = true; out.midSafe = demoTapWalk(147, 411); slopOk = false;
last(BIG, true); out.midDn = demoTapWalk(147, 351);
last(BIG, false); out.side = demoTapWalk(190, 411);
last(SMALL, false); out.smallFirstWrist = demoTapWalk(147, 417);   // 入らない ときの ふつうの 大きさの 最初の 手本：手首（36px）
last(SMALL, false); out.smallFirstPast = demoTapWalk(147, 446);   // 手の 先（65px）は 手の 外
last(undefined, false); out.small30 = demoTapWalk(147, 411);   // 2回めから の 手本（hand なし）
last(BIG, false); slopOk = true; out.tipSafe = demoTapWalk(147, 390); slopOk = false;
// Codex の 指摘 1：許可の ボタンで 聞いた あと（この タップの 前）は 助けない。許可を 聞いた その タップ（この タップの はじめ より あと）は 助ける
last(BIG, false); tiltG.asked = true; tiltAsk.at = T - 500; out.askedBefore = demoTapWalk(147, 411);
last(BIG, false); tiltAsk.at = T - 50; out.askedNow = demoTapWalk(147, 411); tiltG.asked = false; tiltAsk.at = -1e9;
// Codex の 指摘 2：手の 絵の 四角の 外（長さ 72px より 先・前の 助けの 線は 80px まで）は ふつうの タップ
last(BIG, false); out.pastPicture = demoTapWalk(147, 381 + 77);
// Codex の 指摘 2：手の 絵の 下に 名所の 絵が ある 所の タップは ふつうの タップ（説明を 開く）
last(BIG, false); SPOTS = [[140, 420, 154, 430]]; out.spotUnderHand = demoTapWalk(147, 425); out.handBesideSpot = demoTapWalk(147, 411); SPOTS = [];
console.log(JSON.stringify(out));"""
        o = node(code)
        self.assertFalse(o["askedBefore"], "許可を 聞いた あとの タップを 手本の マスへ 歩かせた（名所の 説明が 開かない）: %r" % o)
        self.assertTrue(o["askedNow"], "許可を 聞いた その タップの 助けが ない: %r" % o)
        self.assertFalse(o["pastPicture"], "手の 絵の 外の タップを 手本の マスへ 歩かせた: %r" % o)
        self.assertFalse(o["spotUnderHand"], "手の 絵の 下の 名所を タップしても 説明が 開かない: %r" % o)
        self.assertTrue(o["handBesideSpot"])   # 名所で ない 手の 上は これまでどおり 手本の マスへ
        self.assertTrue(o["mid"], "大きい 手の まん中の タップで 歩かない: %r" % o)
        self.assertTrue(o["wrist"], "大きい 手の 手首の タップで 歩かない: %r" % o)
        self.assertTrue(o["midSafe"], "指先が 歩ける 所でも、大きい 手の まん中は 手本の マスへ: %r" % o)
        self.assertTrue(o["midDn"])   # さかさの 手（上へ のびる）
        self.assertFalse(o["side"])   # 手の 横 43px は 手の 外
        self.assertTrue(o["smallFirstWrist"], "最初の 手本（ふつうの 大きさ）の 手首の タップで 歩かない: %r" % o)
        self.assertFalse(o["smallFirstPast"])
        self.assertFalse(o["small30"])   # 2回めから の 手本は これまでどおり（24px まで）
        self.assertFalse(o["tipSafe"])   # 指先の すぐ そば（9px）で 18px ずれても 歩ける 所：これまでどおり タップした 所で 決まる

    def test_big_hand_needs_safe_middle(self):
        """大きい 手は、手の まん中（30px）・手首（52px）が 歩けない 所（縁の 矢印・名所の 絵）に かかる 置き方では 出さない（これまでの 大きさで 出す）"""
        # 道すじの 行（y 131〜147）の 下 13〜58px・上 13〜52px の 帯は 歩けない（大きい 手の まん中・手首が 来る 所。指先から 20px の 所は 一部 歩ける）
        r = node(spot_code("""
rp = { x: 1.5, y: 1.5 };
const path = []; for (let x = 0; x <= 6; x++) path.push([x, 0]);
BOX = [0, 52, 568, 600];
const sp = tapDemoSpot(path, true);
console.log(JSON.stringify(sp ? { big: !!sp.big, hand: sp.hand, y: Math.round(sp.q.y), up: sp.up } : null));""").replace("const tapDemoWalks = (q, slop) => {", "const tapDemoWalks = (q, slop) => { if ((q.y >= 160 && q.y <= 205) || (q.y >= 95 && q.y <= 118)) return false;"))
        self.assertIsNotNone(r)
        self.assertFalse(r["big"], "大きい 手の まん中・手首が 歩けない 所に かかる のに 大きい 形で 出た: %r" % r)


class HandPicture209(unittest.TestCase):
    def test_spot_under_hand_edge_blocks_big(self):
        """Codex の 指摘 2：手の 絵の 四角の はし（まん中の 線から 20〜28px）に 名所の 当たりが ある 置き方は 大きい 形に しない（前は まん中の 線 だけ 見て いた）"""
        code = """
const T = 8, rc = { x: 900, y: 900 }, box = [0, 0, 2000, 2000, null]; box.near = [];
const q = { x: 284, y: 300 }, document = { querySelectorAll: () => [] }, tiltBtn = null;
const tapDemoWalks = (p, slop) => !(p.x >= q.x + 20 && p.x <= q.x + 28);   // 手の 右の はし の 帯 だけ 名所
""" + "".join(line(PIX, s, "") for s in ["const DEMO_HAND = ", "const DEMO_HAND1 = ", "const DEMO_HAND1_PTS = "]) + fn(PIX, "demoHandClear", "") + fn(PIX, "tapDemoLayout") + """
console.log(JSON.stringify({ big: tapDemoLayout(q, 'big', rc, box, up => true), later: tapDemoLayout(q, false, rc, box, up => true) }));"""
        o = node(code)
        self.assertIsNone(o["big"], "手の 絵の はしに 名所が ある のに 大きい 手を 置いた: %r" % o)
        self.assertIsNotNone(o["later"])   # 2回めから の 手本は これまでどおり（手の 絵の 四角は 見ない）


class WalkStartMomentum209(unittest.TestCase):
    """4度で 転がって いる とちゅうの タップ：歩きは のこりの いきおいを 持ちこさない（確かめの tapWalkTilt が 20回に 1〜2回 落ちた もと）。
    しっかり 傾けて いる とき（TAP_TILT_OVER 以上）・歩けなかった ときは、いきおいを かえない"""
    def run_walk(self, tilt, path=True):
        src = line(PIX, "const TAP_TILT_OVER = ") + fn(PIX, "tapWalk")
        code = """
if (typeof navigator === 'undefined') globalThis.navigator = {};   // Node 20 には navigator が 無い（歩けない ときの ぶるっ を 読む）
const G = { notePlayInput() {}, npcs: [], toast() {} }, tapS = { path: [], timer: null, goal: null, due: 0 };
const idleTouch = () => {}, tapWalkStop = () => { tapS.path = []; tapS.goal = null; }, tapWalkTick = () => {};
const driving = false, mazeOn = () => false, BLOCK = new Set(), codeAt = () => 0, npcTile = n => n;
const targetTile = () => ({ x: 10.9, y: 4.5 }), planPath = () => (%s ? [[11, 4], [12, 4], [13, 4]] : []);
const tiltG = { x: %r, y: 0.69 }, rp = { x: 11.3, y: 4.6, vx: 3.2, vy: 1.4 };
const mzSoft = { on: false, vin: 0, pen: 0 };   // サイクル213：tapWalk が 歩きだす ときに 生け垣の めりこみも ほどく（その 入れ物。ここの 求めは かえない）
%s
const ok = tapWalk(13, 4);
console.log(JSON.stringify({ ok, v: [rp.vx, rp.vy], goal: tapS.goal }));
""" % ("true" if path else "false", tilt, src)
        return node(code)

    def test_small_tilt_walk_starts_still(self):
        o = self.run_walk(0.0)
        self.assertTrue(o["ok"])
        self.assertEqual(o["goal"], [13, 4])
        self.assertEqual(o["v"], [0, 0], "転がって いる とちゅうの タップで、歩きに いきおいが のこった: %r" % o)

    def test_strong_tilt_and_no_path_keep_speed(self):
        o = self.run_walk(0.7)   # 力 0.99：歩きは 次の こまで やめて 傾きに まかせる（傾きが 勝つ。いきおいも そのまま）
        self.assertEqual(o["v"], [3.2, 1.4])
        o = self.run_walk(0.0, path=False)   # 歩けない：何も かえない
        self.assertFalse(o["ok"])
        self.assertEqual(o["v"], [3.2, 1.4])


class Rules209(unittest.TestCase):
    def test_playtest_items(self):
        for k in ["firstTapBig", "firstTapFit6", "laterDemoSame", "lowGoalDemo", "bigHandTap", "handHelpScope"]:
            self.assertIn("  %s: '" % k, PLAY, k)
        self.assertIn("...(await cycle209Checks(browser, R))", PLAY)

    def test_operator_decisions_kept(self):
        """札の 文は「タップ！」の まま・動きを へらす 設定でも 字は 出る（動き だけ 止める）"""
        self.assertIn('#tapDemo.first::after{content:"タップ！"', CSS)
        self.assertNotRegex(CSS, r"#tapDemo\.first\.big::after\{[^}]*content:")
        self.assertIn("@media (prefers-reduced-motion:reduce){#tiltHint,#tapDemo,#tapDemo::before,#pxTilt.pro .ic{animation:none}", CSS)

    def test_doc(self):
        self.assertIn("サイクル209", DOC)
        self.assertIn("最初のタップの文字を大きくわかりやすく", DOC)


if __name__ == "__main__":
    unittest.main()
