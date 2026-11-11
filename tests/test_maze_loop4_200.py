"""第4弾サイクル200：はじめの 1分で やめる 人を へらす（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」）。
見えた 絵を タップする 人：手本の 手の 絵が 窓の 開く 所に のらない・せかいちずを 開いて しまった 人に もどり方の 手本。
「📱 OK」を 押しても ことわった ときの 知らせを 出さない。金の米つぶの 知らせは 2行。ときどき 落ちる 確かめ 2つは 台本を 直した。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn_src(name):
    i = PIX.index("function %s(" % name)
    return PIX[i:PIX.index("\n}\n", i) + 3]


class FirstMinute200(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "nishio-go/game.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_hand_picture_avoids_places_that_open_a_window(self):
        """手の 絵の まん中（指先から 20px）を 押しても 歩ける 向きを 先に。なければ これまでどおり（指先だけ 歩ける 置き方）"""
        self.assertIn("const DEMO_HAND_TAP = 20;", PIX)
        s = fn_src("tapDemoSpot")
        self.assertIn("const hand = tapDemoLayout(q, first, rc, box, up => tapDemoWalks({ x: q.x, y: q.y + (up ? -DEMO_HAND_TAP : DEMO_HAND_TAP) }, 0, near));", s)
        self.assertIn("if (hand) return { q, up: hand.up, side: hand.side, hand: true };", s)
        self.assertIn("if (!plain) plain = { q, up: lay.up, side: lay.side, hand: false };", s)
        self.assertIn("if (plain) return plain;", s)
        self.assertLess(s.index("if (hand) return"), s.index("if (plain) return plain;"))
        self.assertLess(s.index("if (plain) return plain;"), s.index("  return null;"))   # 18px ずれても 歩ける 所（手は のる）は、ぴったりの 所（手は のらない）より 先
        l = fn_src("tapDemoLayout")
        self.assertIn("if (upOk && !upOk(up)) continue;", l)
        self.assertIn("for (const up of [pref, !pref])", l)   # 行き先が 上なら さかさ が 先、は そのまま

    def test_world_map_shows_how_to_go_back(self):
        """めいろの とちゅうの せかいちず：止まって 2秒（はじめてのさんぽの あとは 6秒）で 👣 を 押す 手本。タップで 何が 開くかは かえて いない"""
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)
        self.assertIn("const DEMO_WORLD_MS = 6000;", PIX)
        t = fn_src("tapDemoTick")
        self.assertIn("const wb = worldMode && !!G.demo && rollOn && !driving ? $('pxWorld') : null;", t)
        self.assertIn("now - tapDemo.at >= (firstWalk() ? DEMO_IDLE_MS : DEMO_WORLD_MS)", t)
        self.assertIn("if (!top || !wb.contains(top)) { tapDemoHide(); return; }", t)   # ボタンが かくれて いる ときは 指さない
        self.assertIn("el.classList.remove('first', 'dn', 'lr', 'll');", t)   # 「タップ！」の 札・さかさは めいろの 手本だけ
        self.assertIn("el.style.top = Math.round(r.top + 2) + 'px';", t)
        # Codex 指摘（PR #1096）：押す 動きで 下がっても 手の まん中が ボタンの 中（小さな 動き .wb）
        self.assertIn("el.classList.add('wb');", PIX)
        self.assertIn('#tapDemo.wb{animation-name:tapDemoPressS}', (ROOT / 'nishio-go' / 'style.css').read_text(encoding='utf-8'))
        self.assertLess(t.index("if (wb) {"), t.index("if (!ok) { tapDemoHide(); return; }"))
        self.assertIn("mapCovered()", t[t.index("if (wb) {"):t.index("tapDemo.world = false;")])   # 窓が 開いて いる 間は 出さない
        g = fn_src("mzGoalWorld")
        self.assertIn("setWorld(true);", g)
        self.assertIn("G.toast('🌏 ゴールは 🏁 の 所（👣 で めいろに もどる）');", g)
        self.assertIn("if (inR(mzMap.arrow) && !arrowYields(px, py)) {", PIX)   # 縁の 矢印の タップは これまでどおり せかいちず（サイクル206：はんいに かぶった 道すじの マスは 歩きが 先）
        self.assertIn("world: !!tapDemo.world, worldMs: DEMO_WORLD_MS,", PIX)

    def test_ok_badge_is_silent(self):
        i = PIX.index("if (tiltBtn) tiltBtn.addEventListener('click', e => {")
        c = PIX[i:PIX.index("\n});\n", i)]
        self.assertIn("if (tiltBtn.classList.contains('ok')) return;", c)
        self.assertLess(c.index("classList.contains('ok')"), c.index("G.toast('地図を タップして 遊べるよ')"))
        self.assertIn("tiltAsk(e);", c)   # ふだんの ボタンは これまでどおり 許可を 聞く

    def test_operator_decisions_kept(self):
        a = fn_src("tiltAsk")
        self.assertIn("if (event.type === 'touchend') return;", a)
        self.assertIn("if (tiltAsk.ev === event || performance.now() - (tiltAsk.at || -1e9) < 250) return;", a)
        t = fn_src("tapDemoTick")
        self.assertIn("const first = tiltBtnWanted() && !tiltG.asked;", t)
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", t)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        h = fn_src("fieldHit")
        self.assertNotIn("tapWalk", h)   # 特大の 絵の タップは これまでどおり 説明の 窓

    def test_grain_toast_fits_two_lines(self):
        self.assertIn("'🌾 金の米つぶ：行き止まりに おちているよ（毎日 かわる）'", GAME)
        self.assertNotIn("めいろの 行き止まりに おちているよ", GAME)

    def test_flaky_checks_wait_for_conditions(self):
        """ときどき 落ちた 確かめ：ゆるめずに、条件を 待つ・測る 時を 合わせる"""
        i = PLAY.index("R.checks.tapWalkStopsOnTouch =")
        b = PLAY[PLAY.rindex("R.checks.tapWalkStopsOnPanel =", 0, i):i]
        self.assertIn("const home = await page.evaluate(g => nishioPixel.tileToClient(g[0], g[1]), goal);", b)
        self.assertIn("return !nishioPixel.tapGoal && Math.floor(a.x) === g[0] && Math.floor(a.y) === g[1]; }, goal, { timeout: 12000 })", b)
        self.assertIn("nishioPixel.tileToClient(Math.floor(a.x) - 3, Math.floor(a.y))", b)
        self.assertIn("await page.waitForTimeout(1200);", b)   # 止まった あとの 見はりは そのまま
        j = PLAY.index("R.checks.donguri = await (async () => {")
        d = PLAY[j:PLAY.index("R.checks.ambCap =", j)]
        self.assertIn("freeDir = (x, y) => dirs.find(([u, v]) => [1.6, 1.2, 0.8].every(k => !D.blocked(x + u * k, y + v * k)))", d)
        self.assertIn("if (!freeDir(r0.x, r0.y)) {", d)
        self.assertIn("await frame(); spawn = !!D.d; if (spawn) spawnGap = Math.hypot(D.d.x - P.roll.x, D.d.y - P.roll.y);", d)
        self.assertNotIn("await wait(80); spawn = !!D.d;", d)
        self.assertIn("r.spawnGap >= 0.6", d)   # 条件は 同じ
        self.assertIn("r.rolled && r.stopped && r.apart && r.free", d)

    def test_full_run_time_limit(self):
        """通しの 時間切れは 20分。時間切れで 止めた ときは そうと 分かる（「browser has been closed」を ゲームの 落ちと まちがえない）"""
        w = (ROOT / ".claude" / "skills" / "ricepia-flow" / "scripts" / "playtest.js").read_text(encoding="utf-8")
        self.assertIn("const LIMIT_MIN = 20, t0 = Date.now();", w)
        self.assertIn("timeout: LIMIT_MIN * 60 * 1000 });", w)
        self.assertIn("r.error.code === 'ETIMEDOUT'", w)
        self.assertNotIn("timeout: 15 * 60 * 1000", w)

    def test_playtest_and_doc(self):
        for k in ["tapDemoHand", "worldBackDemo", "tiltOkQuiet", "grainToast"]:
            self.assertIn("  %s: '" % k, PLAY)
            self.assertIn("`%s`" % k, DOC)
        self.assertIn("- サイクル200：", DOC)


if __name__ == "__main__":
    unittest.main()
