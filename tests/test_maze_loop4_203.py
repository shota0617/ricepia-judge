"""第4弾サイクル203：はじめの 1分で やめる 人を へらす・なぞった 指を おいた まま 待つ 人（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」）。
なぞった 先で 指が 0.3秒 止まったら、指を はなさなくても そこへ 歩きだす。歩きだした あとは その 指で 行き先を かえない。"""
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
        self.assertIn("const q = swipeTile(d.ex, d.ey);", f)
        self.assertIn("tapWalk(q[0], q[1]);", f)
        # 同じ マスの 決め方を はなした ときも 使う
        self.assertIn("const q = swipeTile(e.clientX, e.clientY);", SW)
        self.assertEqual(SW.count("function swipeTile(cx, cy) {"), 1)

    def test_no_walk_for_still_press_world_or_windows(self):
        """動かさない 長押し（タップに まかせる）・せかいちず・窓・車・地図の 外では 歩きださない"""
        i = SW.index("function swipeHold() {")
        f = SW[i:SW.index("cv.addEventListener('pointermove'", i)]
        self.assertIn("if (!d || d.key || worldMode || !G.demo || driving || !howtoEl.hidden || mapCovered(false, true)) return;", f)
        self.assertIn("if (Math.hypot(d.ex - d.x, d.ey - d.y) < SWIPE_MIN) return;", f)
        self.assertIn("if (d.ex < r.left || d.ex > r.right || d.ey < r.top || d.ey > r.bottom) return;", f)
        self.assertIn("const SWIPE_MIN = 12;", SW)

    def test_goal_is_kept_until_the_finger_lifts(self):
        """歩きだした あとは、指を うごかしても・はなしても 行き先を かえない（地図が 流れて 指の 下の マスが ずれる ため）"""
        self.assertIn("if (!d || e.pointerId !== d.id || d.key) return;", SW)
        up = SW[SW.index("cv.addEventListener('pointerup'"):]
        self.assertLess(up.index("swipeS.at = performance.now();"), up.index("if (d.key) return;"))
        self.assertLess(up.index("if (d.key) return;"), up.index("tapWalk(q[0], q[1]);"))
        self.assertIn("clearTimeout(swipeS.timer);", up)

    def test_two_fingers_and_cancel_stop_the_timer(self):
        """2本め の 指（isPrimary で ない）・とりけし で 待ちを やめる"""
        self.assertIn("clearTimeout(swipeS.timer);\n  swipeS.down = !worldMode && e.isPrimary && e.button === 0 ?", SW)
        self.assertIn("cv.addEventListener('pointercancel', () => { clearTimeout(swipeS.timer); swipeS.down = null; }, { passive: true });", SW)

    def test_owner_rules_kept(self):
        """今日 決まった こと：最初の click で 許可（なぞり・長押しの 待ちでは 聞かない）・「タップ！」の 手本・素早い なぞりは はなした 所で 決まる"""
        self.assertNotIn("tiltAsk", SW)
        self.assertNotIn("requestPermission", SW)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("function tapDemoTick() {", PIX)
        self.assertIn("if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < SWIPE_MIN) return;", SW)

    def test_playtest_and_doc(self):
        self.assertIn("swipeHold: { ...(sw.hold || { why: 'no-route' }), ok: !!sw.holdOk },", PLAY)
        self.assertIn("  swipeHold: '", PLAY)
        self.assertIn("swipeHoldCfg: { ms: SWIPE_HOLD_MS, px: SWIPE_HOLD_PX, min: SWIPE_MIN },", PIX)
        self.assertIn("- サイクル203：", DOC)


if __name__ == "__main__":
    unittest.main()
