"""第4弾サイクル208：はじめの 1分で やめる 人を へらす（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」・2026-11-11「最初の1分の改善はこのやり方に変更」）。
さがし役が 見つけた 欠陥を 直す：
(C5) 地図の 部品（Leaflet）が 読めない・来ない とき、押せる 物が 何も ない → 読めなかった ときは「もう 1回 読みこむ」、
     来ない まま 12秒 たったら「このまま 待つか、タップで やりなおし」。おそい だけ（8秒）の 人には 出さない。20秒 おくれの 人は 始まれば 消える。
(C1) はじめての ゴールへ 歩いて いる 間に ゴールを もう 1回 タップすると、縁の 矢印の 当たりに 入って せかいちずに 切りかわる。
(C2) 名所の 窓を 開いた タップと 同じ 所の 2回めの タップが、窓の ボタン（教える）に 当たる → 窓の 中身を タップの 点から はなす。
(C3)「🎁 すぐ近くに たからばこ！」の 知らせが 最初の ゴールの 輪に 重なる → 矢印が ない ときは 輪を よける。
どの テストも、直す 前（サイクル207）にも ある 物（head の 読みこみの スクリプト・game.js の 地図の 分かれ道・地図の タップの 矢印の 分かれ道・
名所の 窓・mzToastDodge）を 動かして、ふるまいで 落ちる（新しい 関数は ある ときだけ 入れる）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
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


# ---------- (C5) 読みこみ：head の スクリプト（地図の 部品より 前）を、にせの DOM と 時計で 動かす ----------
BOOT_DOM = r"""
let now = 0, reloads = 0; const timers = [], dcl = [];
global.setTimeout = (f, ms) => { timers.push({ t: now + (ms || 0), f }); return timers.length; };
function advance(to) { for (;;) { const x = timers.filter(q => !q.done && q.t <= to).sort((a, b) => a.t - b.t)[0]; if (!x) break; x.done = true; now = x.t; x.f(); } now = to; }
function mk(tag) {
  const e = { tagName: tag.toUpperCase(), id: '', attrs: {}, children: [], parent: null, style: {}, innerHTML: '', cls: new Set() };
  e.classList = { add: c => e.cls.add(c), remove: c => e.cls.delete(c), contains: c => e.cls.has(c) };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); }; e.removeAttribute = k => { delete e.attrs[k]; }; e.getAttribute = k => (k in e.attrs ? e.attrs[k] : null);
  e.appendChild = c => { c.parent = e; e.children.push(c); return c; };
  e.remove = () => { if (e.parent) { e.parent.children = e.parent.children.filter(x => x !== e); e.parent = null; } };
  e.addEventListener = () => {};
  return e;
}
const body = mk('body');
const all = () => { const out = []; const walk = e => { out.push(e); e.children.forEach(walk); }; walk(body); return out; };
global.window = global;
global.document = { body, createElement: mk, getElementById: id => all().find(e => e.id === id) || null, addEventListener: (t, f) => { if (t === 'DOMContentLoaded') dcl.push(f); } };
global.localStorage = { getItem: () => null, setItem() {} };
global.location = { reload: () => { reloads++; } };
"""


def boot_scripts():
    head = HTML[:HTML.index('<script src="https://unpkg.com/leaflet')]
    return re.findall(r"<script>(.*?)</script>", head, re.S)


def boot_run(load_at, loaded, end):
    """load_at 秒に 地図の 部品が 届く（loaded：読めた／False：読めなかった エラー。None：ずっと 来ない）。0.25秒 おきに 題字の 下の ボタンを 見る"""
    code = BOOT_DOM + "".join("try {\n%s\n} catch (e) {}\n" % s for s in boot_scripts()) + """
const LOAD = %s, OK = %s, END = %s, seen = [];
let fired = false;
for (let t = 0; t <= END * 1000; t += 250) {
  advance(t);
  if (LOAD !== null && !fired && t >= LOAD * 1000) { fired = true; if (OK) window.L = {}; dcl.forEach(f => f()); }
  const c = document.getElementById('bootCover'), b = document.getElementById('bootSlow');
  if (b && c && !c.classList.contains('off')) seen.push(t / 1000);
}
const b = document.getElementById('bootSlow'), c = document.getElementById('bootCover');
let text = b ? b.innerHTML.replace(/<br>/g, '') : '', r0 = reloads;
if (b && b.onclick) b.onclick();
console.log(JSON.stringify({ seen, text, cover: !!c, coverOff: !!c && c.classList.contains('off'), coverHidden: c ? c.getAttribute('aria-hidden') : null, reload: reloads - r0, tag: b ? b.tagName : null }));
""" % ("null" if load_at is None else load_at, "true" if loaded else "false", end)
    return node(code)


class BootLoad208(unittest.TestCase):
    def test_loaded_shows_nothing(self):
        """読めた（0.3秒）：題字は すぐ 消え、待つ・やりなおしの ボタンは 出ない"""
        o = boot_run(0.3, True, 20)
        self.assertEqual(o["seen"], [])
        self.assertFalse(o["cover"])

    def test_failed_is_left_to_the_game(self):
        """読めなかった（エラー・0.5秒）：題字は 消える（game.js が すぐ「もう 1回 読みこむ」を 出す）。12秒の ボタンは 出さない"""
        o = boot_run(0.5, False, 20)
        self.assertEqual(o["seen"], [])
        self.assertFalse(o["cover"])

    def test_slow_8s_starts_without_retry(self):
        """おそい だけ（8秒）：やりなおしを すすめない。届けば これまでどおり 始まる"""
        o = boot_run(8, True, 20)
        self.assertEqual(o["seen"], [], "8秒 おくれて 届く 人に やりなおしを すすめた")
        self.assertFalse(o["cover"])

    def test_slow_20s_offers_wait_then_starts(self):
        """おそい（20秒）：12〜14秒で「待つか やりなおし」が 出て、届けば 題字ごと 消えて 始まる"""
        o = boot_run(20, True, 30)
        self.assertTrue(o["seen"], "20秒 待つ 間、何も 出ない")
        self.assertGreaterEqual(o["seen"][0], 11.5)
        self.assertLessEqual(o["seen"][0], 14)
        self.assertLess(max(o["seen"]), 20.5, "届いて 始まった あとも ボタンが 残る")
        self.assertFalse(o["cover"])

    def test_never_offers_wait_or_retry(self):
        """ずっと 来ない：14秒 までに 押せる ボタン（待つか、タップで やりなおし）が 題字の 下に 出て、60秒まで 残る。押すと 読みこみ なおす"""
        o = boot_run(None, False, 60)
        self.assertTrue(o["seen"], "ずっと 来ない とき、題字と 米つぶの まま 何も 出ない")
        self.assertLessEqual(o["seen"][0], 14)
        self.assertEqual(o["seen"][-1], 60)
        self.assertEqual(o["tag"], "BUTTON")
        self.assertIn("待", o["text"])   # 待つ・やりなおしの どちらも えらべる（おそい だけ かも しれない）
        self.assertIn("やりなおし", o["text"])
        self.assertEqual(o["reload"], 1)
        self.assertIsNone(o["coverHidden"], "ボタンが 出ても 題字が 読み上げから かくれた まま")

    def test_cover_iife_unchanged(self):
        """サイクル202 の 題字の スクリプト（ボタンなし・aria-hidden）は そのまま。見はりは 別の スクリプト"""
        s = boot_scripts()[0]
        self.assertIn("c.setAttribute('aria-hidden', 'true');", s)
        self.assertNotIn("<button", s)


GAME_FAIL_STUB = r"""
const window = {};   // 地図の 部品が 読めなかった（L が ない）
const els = {}, $ = id => (els[id] = els[id] || { id, hidden: true, innerHTML: '', textContent: '', on: {}, addEventListener(t, f) { this.on[t] = f; } });
let reloads = 0; const location = { reload: () => { reloads++; } };
"""


class MapFail208(unittest.TestCase):
    def test_failed_load_has_retry_button(self):
        """読めなかった（window.L が ない）：知らせの 中に 押せる「もう 1回 読みこむ」。押すと 読みこみ なおす"""
        br = block(GAME, "if (!window.L) {", "  return;")
        code = GAME_FAIL_STUB + "(function () {\n" + br + "}\n})();\n" + """
const s = $('status'), m = els.mapRetry;
const html = s.innerHTML || s.textContent;
if (m && m.on.click) m.on.click();
console.log(JSON.stringify({ html, hidden: s.hidden, button: /<button[^>]*id="mapRetry"/.test(s.innerHTML), reload: reloads, intro: $('intro').hidden }));
"""
        o = node(code)
        self.assertIn("読み込めませんでした", o["html"])
        self.assertTrue(o["button"], "読めなかった とき、文だけで 押せる 物が ない")
        self.assertIn("もう 1回 読みこむ", o["html"])
        self.assertEqual(o["reload"], 1)
        self.assertFalse(o["hidden"])
        self.assertTrue(o["intro"])


# ---------- (C1) 地図の タップ：縁の 矢印の 分かれ道を そのまま 動かす（キャンバスの 点 = 画面の 点・dpr 1） ----------
ARROW_STUB = r"""
let opened = 0; const worldMode = false, MZ_K = 3, cv = { width: 390, height: 734 };
const mazeOn = () => true, arrowYields = () => false, mzGoalWorld = () => { opened++; };
let FW = true, GOAL = [211, 105];
const firstWalk = () => FW, tapS = { goal: null };
const mzMap = { arrow: [171, 42, 235, 141], pin: [204, 126, 30, -1.5], tapped: true };
const mzRt = { path: [[0, 0], [1, 1]] }, tileClient = () => ({ x: GOAL[0], y: GOAL[1] });
const localStorage = { setItem() {} };
"""


def arrow_code(cases):
    br = block(PIX, "  if (mazeOn() && !worldMode) {   // 縁の 矢印を タップで せかいちず", "mzGoalWorld(); return; }")
    open_ = re.sub(r"//[^\n]*|'[^'\n]*'", "", br)   # 閉じて いない かっこの 数（コメント・文字列を のぞいて）
    click = "function click(x, y) {\n  const e = { clientX: x, clientY: y }, r = { left: 0, top: 0 }, dpr = 1;\n" + br + "}\n" * (open_.count("{") - open_.count("}")) + "}\n"
    run = "const out = [];\nfor (const [fw, walking, goal, x, y] of %s) { FW = fw; tapS.goal = walking ? {} : null; GOAL = goal; opened = 0; click(x, y); out.push(opened); }\nconsole.log(JSON.stringify(out));" % json.dumps(cases)
    return ARROW_STUB + fn(PIX, "mzGoalOnCanvas", "") + click + run


class GoalTap208(unittest.TestCase):
    def test_goal_tap_in_first_walk_stays_on_map(self):
        """C1：はじめての さんぽ で、上の 帯の すぐ 下に 見える ゴール（矢印の 当たりの 中）を タップ → せかいちずに しない"""
        o = node(arrow_code([
            [True, True, [211, 105], 211, 105],    # ゴールを ねらった タップ
            [True, True, [211, 105], 211, 121],    # 地図が 動いて ゴールが 16px 上へ ずれた（指を おいた 時の ゴール）
            [True, False, [211, 105], 175, 50],    # 矢印の 当たりの 余白（絵の 外）
            [False, True, [211, 105], 175, 50],    # もどって きた 人でも 歩いて いる さいちゅうは 余白で 開かない
        ]))
        self.assertEqual(o, [0, 0, 0, 0], "ゴールを ねらった タップ・余白の タップで せかいちずに 切りかわる")

    def test_arrow_picture_still_opens_world(self):
        """矢印の 絵 そのもの（ゴールが 画面の 外・ゴールが 遠い）・もどって きた 人の 余白 → これまでどおり せかいちず（サイクル206）"""
        o = node(arrow_code([
            [True, False, [211, -40], 204, 126],   # ゴールが キャンバスの 外（横向きなど）：矢印の まん中
            [True, False, [300, 400], 204, 126],   # ゴールは 見えるが 遠い：矢印の まん中
            [True, True, [211, 105], 204, 126],    # ゴールが 矢印の すぐ 下（22px）に 見えて いても、矢印の 絵の まん中を 押せば せかいちず（運営者の 決めた うごき）
            [False, False, [211, -40], 175, 50],   # もどって きた 人・止まって いる：余白でも これまでどおり
        ]))
        self.assertEqual(o, [1, 1, 1, 1])


# ---------- (C2) 名所の 窓：開いた タップの 点と 窓の ボタンを はなす ----------
# 390×844 の 窓（さがし役の 再現と 同じ 形）：窓の 箱 52〜786・下の 欄 700〜・中身 68〜368（高さ 300）。
# ボタンの 列：中身の 上から 177〜213（ミニゲーム・ムービー・ここへ）・219〜255（シェア・教える）・255〜287（▶ とじる）
PXINFO_STUB = r"""
const ROWS = [[20, 370, 177, 213], [20, 370, 219, 255], [100, 290, 255, 287]], TEXT = [20, 370, 0, 170];
const dq = { style: { marginTop: '' } }, top0 = 68, H = 300;
const off = () => parseFloat(dq.style.marginTop) || 0;
dq.getBoundingClientRect = () => ({ top: top0 + off(), bottom: top0 + off() + H, left: 0, right: 390 });
const rect = q => ({ left: q[0], right: q[1], width: q[1] - q[0], top: top0 + off() + q[2], bottom: top0 + off() + q[3] });
dq.querySelectorAll = () => ROWS.map(q => ({ getBoundingClientRect: () => rect(q) }));
const el = { hidden: false, querySelector: () => dq, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, getBoundingClientRect: () => ({ top: 52, bottom: 786, height: 734 }) };
const sheet = { offsetParent: {}, getBoundingClientRect: () => ({ top: 700 }) };
const $ = id => (id === 'sheet' ? sheet : el);
"""


def pxinfo_code(cases):
    defs = line(PIX, "const pxInfoTap = ", "const pxInfoTap = { x: 0, y: 0, t: -1e9 };\n") + line(PIX, "const PXINFO_GAP = ", "")
    place = fn(PIX, "pxInfoPlace", "function pxInfoPlace() {}\n")
    run = """
const out = [];
for (const [x, y, ago] of %s) {
  pxInfoTap.x = x; pxInfoTap.y = y; pxInfoTap.t = performance.now() - ago;
  dq.style.marginTop = '';
  pxInfoPlace();
  const btn = ROWS.map(rect), d = dq.getBoundingClientRect();
  // タップの 点から いちばん 近い ボタンまで（たて・よこ どちらか はなれて いれば その ぶん）
  const gap = Math.min(...btn.map(b => Math.max(b.left - x, x - b.right, b.top - y, y - b.bottom, 0)));
  out.push({ y, off: off(), gap, lowest: Math.max(...btn.map(b => b.bottom)), dqTop: d.top });
}
console.log(JSON.stringify(out));
""" % json.dumps(cases)
    return PXINFO_STUB + defs + place + run


class InfoWindow208(unittest.TestCase):
    def test_second_tap_misses_window_buttons(self):
        """C2：地図の 上の がわ（195, 286）を タップして 開いた 窓の「教える」が タップの 点に 来る → 中身を 下へ。同じ 点の 2回めの タップが ボタンに 当たらない（24px 以上）"""
        o = node(pxinfo_code([[195, 286, 0], [195, 250, 0]]))
        for r in o:
            self.assertGreaterEqual(r["gap"], 24, "タップの 点が 窓の ボタンに かかる: %r" % r)
            self.assertLessEqual(r["lowest"], 700, "ボタンが 下の 欄の 裏に もぐる: %r" % r)

    def test_window_stays_when_no_button_near(self):
        """ボタンが まわりに ない タップ（字の 上）・古い タップ（1秒 前。地図の タップで 開いて いない）では 窓を 動かさない（ほかの 開き方・画面の 大きさでは これまでどおり）"""
        o = node(pxinfo_code([[195, 120, 0], [195, 286, 1000]]))
        self.assertEqual([r["off"] for r in o], [0, 0])
        self.assertEqual(o[0]["dqTop"], 68)

    def test_window_is_wired(self):
        """窓が 開く・中身が かわる ときに 置き場を きめる（キャンバスの タップの 点を 地図の click より 先に おぼえる）"""
        self.assertIn("pxInfoTap.x = e.clientX; pxInfoTap.y = e.clientY;", PIX)
        self.assertIn("observe($('pxInfo'), { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true })", PIX)


# ---------- (C3) 知らせの よけ：mzToastDodge が わたす 札 ----------
DODGE_STUB = r"""
let got = 'unset'; const toastDodgeOff = false, rec = false, G = { guide: { id: 'g' } };
const mazeOn = () => true, worldToastDodge = (tag, avoid) => { got = tag; };
const document = { getElementById: () => ({ hidden: true }) };
const mzMap = { arrow: null, pin: null, ring: [400, -16, 748, 332] };
"""


class ToastRing208(unittest.TestCase):
    def test_toast_dodges_goal_ring_without_arrow(self):
        """C3：ゴールが 画面の 中（矢印が ない）ときは、知らせが ゴールの 輪と 旗を よける。矢印が ある ときは 矢印"""
        code = DODGE_STUB + fn(PIX, "mzToastDodge") + """
mzToastDodge(0); const a = got;
mzMap.arrow = [1, 2, 3, 4]; mzToastDodge(0); const b = got;
console.log(JSON.stringify({ a, b }));"""
        o = node(code)
        self.assertEqual(o["a"], [400, -16, 748, 332], "矢印が ない とき、知らせが ゴールの 輪を よけない")
        self.assertEqual(o["b"], [1, 2, 3, 4])

    def test_ring_box_recorded_while_drawn(self):
        """輪の わくは 輪を 描く ときだけ（毎こま はじめに 消す・ふくらむ いちばん 外で ゆれない）"""
        g = fn(PIX, "drawMzGoal")
        self.assertIn("mzMap.ring = null", g)
        self.assertRegex(g, r"mzMap\.ring = \[ex - R,")


class Playtest208(unittest.TestCase):
    def test_first_minute_items(self):
        """playtest の はじめの 1分に、読みこみの 4つ（読めた・読めなかった・おそい・来ない）と C1・C2・C3 の 確かめ"""
        for k in ["bootLoaded", "bootFailed", "bootSlow", "bootNever", "goalTapNoWorld", "arrowPinWorld", "infoSecondTap", "chestToastRing"]:
            self.assertIn("  %s: '" % k, PLAY, k)
        self.assertIn("...(await cycle208Checks(browser, R))", PLAY)

    def test_doc(self):
        self.assertIn("サイクル208", DOC)


if __name__ == "__main__":
    unittest.main()
