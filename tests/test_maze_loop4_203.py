"""第4弾サイクル203：はじめの 1分で やめる 人を へらす・なぞった 指を おいた まま 待つ 人（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」）。
なぞった 先で 指が 0.3秒 止まったら、指を はなさなくても そこへ 歩きだす。歩きだした あと、指を 追いつづける ことは しない。
サイクル206 で 変わった 所：止めた 所から 先へ 進めた 指は、次に 止まった とき・はなした ときに 行き先を かえる（とちゅうで ためらう 指。動きの 確かめは test_maze_loop4_206.py）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")
I = PIX.index("const swipeS = { down: null, at: -Infinity, timer: null };")
SW = PIX[I:PIX.index("// スポットをタップすると、ドラクエ風のウィンドウで説明", I)]


class SwipeHold203(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_hold_starts_the_walk_without_lifting(self):
        """指が 止まって SWIPE_HOLD_MS たったら swipeHold が 指の 下の マスへ tapWalk（はなした ときと 同じ 決め方）"""
        self.assertIn("const SWIPE_HOLD_MS = 300, SWIPE_HOLD_PX = 5;", SW)
        self.assertIn("clearTimeout(swipeS.timer); swipeS.timer = setTimeout(swipeHold, SWIPE_HOLD_MS);", SW)
        self.assertIn("if (Math.hypot(d.ex - d.ax, d.ey - d.ay) <= SWIPE_HOLD_PX) return;", SW)
        i = SW.index("function swipeHold() {")
        f = SW[i:SW.index("cv.addEventListener('pointermove'", i)]
        # サイクル206：止まった とき も はなした とき も 同じ swipeWalk（指の 所の マス。歩きだせた ときだけ 行き先を きめる）
        self.assertIn("swipeWalk(d, d.ex, d.ey);", f)
        self.assertIn("swipeWalk(d, e.clientX, e.clientY);", SW)
        w = SW[SW.index("function swipeWalk(d, cx, cy) {"):SW.index("function swipeHold() {")]
        self.assertIn("if (!tapWalk(q[0], q[1])) return false;", w)
        self.assertIn("d.key = key; d.hx = cx; d.hy = cy; d.wx = w.x; d.wy = w.y;", w)
        self.assertEqual(SW.count("function swipeTile(cx, cy) {"), 1)

    def test_no_walk_for_still_press_world_or_windows(self):
        """動かさない 長押し（タップに まかせる）・せかいちず・窓・車・地図の 外では 歩きださない"""
        i = SW.index("function swipeHold() {")
        f = SW[i:SW.index("cv.addEventListener('pointermove'", i)]
        self.assertIn("if (!d || !swipeOn(d, d.ex, d.ey) || worldMode || !G.demo || driving || !howtoEl.hidden || mapCovered(false, true)) return;", f)   # サイクル206：歩きだした あとは、止めた 所から 先へ 進んだ 指だけ
        self.assertIn("if (Math.hypot(d.ex - d.x, d.ey - d.y) < SWIPE_MIN) return;", f)
        self.assertIn("if (d.ex < r.left || d.ex > r.right || d.ey < r.top || d.ey > r.bottom) return;", f)
        self.assertIn("const SWIPE_MIN = 12;", SW)

    def test_goal_is_kept_until_the_finger_lifts(self):
        """歩きだした あと、止めた 所の そば（SWIPE_ON_PX より 近く）に いる 指は、うごかしても・はなしても 行き先を かえない（地図が 流れても 追わない）。
        サイクル206：止めた 所から 先へ 進めた 指だけ、次に 止まった とき・はなした ときに 行き先を かえる（指の 下の マスでは なく、止めた 所から 指が 進んだ ぶん 先の マス）"""
        self.assertIn("const SWIPE_ON_PX = 24;", SW)
        self.assertIn("const swipeOn = (d, x, y) => !d.key || Math.hypot(x - d.hx, y - d.hy) >= SWIPE_ON_PX;", SW)
        mv = SW[SW.index("cv.addEventListener('pointermove'"):SW.index("cv.addEventListener('pointerup'")]
        self.assertIn("if (!swipeOn(d, d.ex, d.ey)) { clearTimeout(swipeS.timer); return; }", mv)
        up = SW[SW.index("cv.addEventListener('pointerup'"):]
        self.assertLess(up.index("swipeS.at = performance.now();"), up.index("if (!swipeOn(d, e.clientX, e.clientY)) return;"))
        self.assertLess(up.index("if (!swipeOn(d, e.clientX, e.clientY)) return;"), up.index("swipeWalk(d, e.clientX, e.clientY);"))
        self.assertIn("clearTimeout(swipeS.timer);", up)
        w = SW[SW.index("function swipeWalk(d, cx, cy) {"):SW.index("function swipeHold() {")]
        self.assertIn("w = d.key ? { x: d.wx + (cx - d.hx) * a.k, y: d.wy + (cy - d.hy) * a.k } : a;", w)

    def test_two_fingers_and_cancel_stop_the_timer(self):
        """2本め の 指（isPrimary で ない）・とりけし で 待ちを やめる。サイクル206：ほかの 指が ぜんぶ「置いた まま の 指」の ときだけ、2本め を 受ける（second）"""
        self.assertIn("const second = map && touch && !e.isPrimary && restOthers(e.pointerId);", SW)
        self.assertIn("  if (map && !worldMode && (e.isPrimary || second) && e.button === 0) swipeBegin(e, second);\n  else if (map || touch) swipeCancel();", SW)   # 受けない 指が ついたら とりけし（待ちも やめる。地図の 外に ついた 指でも）
        self.assertIn("function swipeCancel() {", SW)
        self.assertIn("  clearTimeout(swipeS.timer);\n  swipeS.down = null;", SW[SW.index("function swipeCancel() {"):])
        self.assertIn("cv.addEventListener('pointercancel', () => swipeCancel(), { passive: true });", SW)

    def test_owner_rules_kept(self):
        """今日 決まった こと：最初の click で 許可（なぞり・長押しの 待ちでは 聞かない）・「タップ！」の 手本・素早い なぞりは はなした 所で 決まる"""
        self.assertNotIn("tiltAsk", SW)
        self.assertNotIn("requestPermission", SW)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("function tapDemoTick() {", PIX)
        self.assertIn("if (!d.key && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SWIPE_MIN) {", SW)   # サイクル206：あとから ついた 指の タップだけ、ここで click を 出す
        self.assertIn("if (d.key && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SWIPE_MIN) return;", SW)   # 歩きだした 指を はじめの 所へ もどして はなした：行き先は かえない
        self.assertIn("if (e.pointerType === 'mouse' && !e.buttons) { swipeCancel(); return; }", SW)   # 外で はなした マウスが もどって きても 歩きださない
        self.assertIn("cv.addEventListener('pointerleave', () => { clearTimeout(swipeS.timer); }, { passive: true });", PIX)   # 外へ 出たら 待たない
        self.assertIn("if (!tapWalk(q[0], q[1])) return false;", SW)   # 歩きだせた ときだけ 行き先を きめる   # 歩きだした 指は、もどして はなしても click を 使わない

    def test_playtest_and_doc(self):
        self.assertIn("swipeHold: { ...(sw.hold || { why: 'no-route' }), ok: !!sw.holdOk },", PLAY)
        self.assertIn("  swipeHold: '", PLAY)
        self.assertIn("swipeHoldCfg: { ms: SWIPE_HOLD_MS, px: SWIPE_HOLD_PX, min: SWIPE_MIN },", PIX)
        self.assertIn("- サイクル203：", DOC)


if __name__ == "__main__":
    unittest.main()
