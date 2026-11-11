"""第4弾サイクル194：スタートで 反応しない・タップすると 動作許可が 出る のを 直す（運営者の声 2026-11-10）。地図の タップは 歩く だけ・傾きは ボタンで・止まったら 手本。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
START = (ROOT / "tools" / "playtest-start.js").read_text(encoding="utf-8")


def fn_src(name):
    i = PIX.index("function %s(" % name)
    return PIX[i:PIX.index("\n}\n", i) + 3]


class Tilt194(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "tools/playtest-start.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_first_touch_asks_once_unless_refused_before(self):
        """サイクル195（運営者の声 2026-11-10「傾けた時に反応しなくなった。最優先で直して」「プレイスタート時にすぐ許可が出るように」）：
        画面の どこでも 最初に さわった ときに 1回 聞く。前に ことわった 人には 聞かない"""
        f = fn_src("tiltFirstTouch")
        # サイクル196（運営者の声「すぐ出るように修正」）：前に ことわった 人にも 開く たびに 1回 聞く。聞くのは click だけ
        self.assertIn("if ((tiltG.asked && !tiltG.retry) || !tiltBtnWanted()) return;", f)
        self.assertNotIn("=== '0') return;", f)
        self.assertNotIn("document.addEventListener('touchend', tiltFirstTouch", PIX)
        self.assertIn("tiltAsk(e);", f)
        self.assertIn("if (tiltAsk.ev === event || performance.now() - (tiltAsk.at || -1e9) < 250) return;", fn_src("tiltAsk"))
        self.assertIn("if (event.type === 'touchend') return;", fn_src("tiltAsk"))   # 聞くのは click で だけ（盤の めいろの touchend で 失敗して click が 捨てられない ように）   # 同じ タップで 2回 聞かない
        # Codex 指摘（PR #1083）：傾きの ボタンの タップは ボタンに まかせる。やりなおしは 同じ 指の 動きの 中では しない
        self.assertIn("if (e && e.target && e.target.closest && e.target.closest('#pxTilt')) return;", f)
        self.assertIn("if (now - (tiltFirstTouch.at || -1e9) < 700) return;", f)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("if (!event || !event.isTrusted || tiltG.asked || !tiltNeedsPermission()) return;", fn_src("tiltAsk"))

    def test_first_tap_demo_shows_at_once(self):
        """サイクル197（運営者の声 2026-11-10「１タップを促すお手本」）：まだ 許可を 聞いて いない 間は、待たずに タップの 手本と「タップ！」の 札を 出す"""
        t = fn_src("tapDemoTick")
        self.assertIn("const first = tiltBtnWanted() && !tiltG.asked;", t)
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", t)   # サイクル198：タップで 歩いた あとは 0.9秒
        self.assertIn("tapDemo.el.classList.toggle('first', first);", t)
        css = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
        self.assertIn('#tapDemo.first::after{content:"タップ！"', css)

    def test_tilt_button_asks_once_per_real_tap(self):
        self.assertIn("if (!event || !event.isTrusted || tiltG.asked || !tiltNeedsPermission()) return;", fn_src("tiltAsk"))
        i = PIX.index("if (tiltBtn) tiltBtn.addEventListener('click', e => {")
        h = PIX[i:PIX.index("\n});\n", i)]
        self.assertIn("if (tiltG.asked && !tiltG.retry) { G.toast('地図を タップして 遊べるよ'); return; }", h)
        self.assertIn("tiltAsk(e);", h)
        ask = fn_src("tiltAsk")
        self.assertIn("if (r === 'granted') { tiltG.granted = true; lsSet('nsg_tilt_ok', '1'); tiltReset(); tiltBtnOk(); } else denied();", ask)
        self.assertIn("const denied = () => { lsSet('nsg_tilt_ok', '0'); tiltBtnSync(); fallback(); };", ask)
        self.assertIn("if (e && e.name === 'NotAllowedError') { tiltG.asked = false; tiltG.retry = true;", ask)

    def test_button_only_where_permission_needed(self):
        w = fn_src("tiltBtnWanted")
        for s in ["tiltNeedsPermission()", "!tiltG.on", "!tiltG.granted", "navigator.maxTouchPoints > 0", "!!G.demo", "rollOn"]:
            self.assertIn(s, w)
        sync = fn_src("tiltBtnSync")
        self.assertIn("const prev = lsGet('nsg_tilt_ok', ''), quiet = (tiltG.asked && !tiltG.retry) || prev === '0', pro = !quiet && prev === '1';", sync)
        self.assertIn("const lab = !quiet && (pro || performance.now() < TILT_BTN.labelMs);", sync)
        self.assertIn('<button type="button" id="pxTilt" hidden aria-label="かたむけて ころがす（傾きの 許可を 聞きます）"><span class="ic" aria-hidden="true">📱</span><span class="tx">かたむけて ころがす</span></button>', HTML)
        self.assertRegex(CSS, r"#pxTilt\{position:absolute;left:10px;top:10px")
        self.assertIn("body.pxw #pxTilt{display:none}", CSS)

    def test_idle_demo_repeats_and_does_not_block(self):
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)
        t = fn_src("tapDemoTick")
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", t)   # サイクル198：タップで 歩いた あとは 0.9秒（その ほかは 2秒）
        # サイクル206：お米が 動いたか は、0.25秒の 見回りの 間に DEMO_MOVE マスより 動いたか で 決める（センサーの ふるえ・じわっと した ずれでは 待ち時間を もどさない）
        self.assertIn("const moved = rp.x === null || tapDemo.x === null ? rp.x !== tapDemo.x : Math.hypot(rp.x - tapDemo.x, rp.y - tapDemo.y) > DEMO_MOVE;", t)
        self.assertIn("if (moved) { tapDemo.at = now; tapDemo.walked = now - tapDemo.walkT < 700; }", t)
        self.assertIn("const sp = tapDemoSpot(path, first);", t)   # サイクル198：道しるべの 3マス先。窓が 開く 所は よける
        self.assertNotIn("localStorage", t)   # はじめての 人 だけ・1回だけ の 条件を もたない
        self.assertNotIn("lsGet", t)
        self.assertIn("document.addEventListener('pointerdown', tapDemoTouch, { capture: true, passive: true });", PIX)
        self.assertIn("setInterval(tapDemoTick, 250);", PIX)
        self.assertRegex(CSS, r"#tapDemo\{[^}]*pointer-events:none")
        self.assertRegex(CSS, r"#tiltHint\{[^}]*pointer-events:none")
        self.assertIn("@media (prefers-reduced-motion:reduce){#tiltHint,#tapDemo,#tapDemo::before,#pxTilt.pro .ic{animation:none}", CSS)
        self.assertNotIn("function tiltHintShow", PIX)

    def test_start_checks_cover_new_rules(self):
        for s in ["checks[kind + 'IdleDemo']", "mapOk = mapOnly.asks === mapWant && mapOnly.asked === (mapWant > 0)", "await page.click('#pxTilt')", "reaskMap === reaskMapWant",
                  "!btn0 && !first.btn && !last.btn && first.asks === 0", "last.saved === '0'", "last.saved === '1'"]:
            self.assertIn(s, START)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
