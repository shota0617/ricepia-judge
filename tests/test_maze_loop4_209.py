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
    return SPOT_STUB + defs + fn(PIX, "tapDemoLayout") + fn(PIX, "tapDemoGoalSpot", "") + fn(PIX, "tapDemoSpot") + run


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
const tapDemo = { last: null }, walks = [], DEMO_SLOP_PX = 18;
const tapDemoWalks = (q, slop) => slopOk, tapDemoSpot = () => spot, tiltBtnWanted = () => true, tiltG = { asked: false }, swipeTile = (x, y) => [Math.floor(x / 16), Math.floor(y / 16)], tapWalk = (x, y) => { walks.push([x, y]); return true; };
"""


class BigHandTap209(unittest.TestCase):
    def test_tap_on_big_hand_walks(self):
        """最初の 手本の 手の 上（大きい 手 56px の まん中 30px・手首 52px、入らない ときの ふつうの 手 38px の 手首 36px）の タップは 手本の マスへ 歩く（指先が 18px ずれても 歩ける 所でも。
        前は 24px より 外は ふつうの タップに なり、844×390 で 縁の 矢印の 当たりに 入って せかいちずに 切りかわった）。ふつうの 大きさの 手は これまでどおり"""
        code = TAPWALK_STUB + line(PIX, "const DEMO_HAND1 = ", "") + line(PIX, "const DEMO_TAP_R = ") + fn(PIX, "demoTapWalk") + """
const out = {}, last = (hand, dn) => { tapDemo.last = { x: 147, y: 381, at: T - 100, hand, dn }; walks.length = 0; };
last(56, false); out.mid = demoTapWalk(147, 411);
last(56, false); out.wrist = demoTapWalk(147, 433);
last(56, false); slopOk = true; out.midSafe = demoTapWalk(147, 411); slopOk = false;
last(56, true); out.midDn = demoTapWalk(147, 351);
last(56, false); out.side = demoTapWalk(190, 411);
last(38, false); out.smallFirstWrist = demoTapWalk(147, 417);   // 入らない ときの ふつうの 大きさの 最初の 手本：手首（36px）
last(38, false); out.smallFirstPast = demoTapWalk(147, 446);   // 手の 先（65px）は 手の 外
last(undefined, false); out.small30 = demoTapWalk(147, 411);   // 2回めから の 手本（hand なし）
last(56, false); slopOk = true; out.tipSafe = demoTapWalk(147, 390); slopOk = false;
console.log(JSON.stringify(out));"""
        o = node(code)
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


class Rules209(unittest.TestCase):
    def test_playtest_items(self):
        for k in ["firstTapBig", "firstTapFit6", "laterDemoSame", "lowGoalDemo", "bigHandTap"]:
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
