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

    def test_map_tap_never_asks(self):
        i = PIX.index("cv.addEventListener('click', e => {\n")
        body = PIX[i:PIX.index("\n});\n", i)]
        self.assertNotIn("tiltAsk(", body)
        swipe = PIX[PIX.index("const swipeS = "):i]
        self.assertNotIn("tiltAsk(", swipe)

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
        self.assertIn("now - tapDemo.at >= DEMO_IDLE_MS", t)
        self.assertIn("if (rp.x !== tapDemo.x || rp.y !== tapDemo.y) { tapDemo.x = rp.x; tapDemo.y = rp.y; tapDemo.at = now; }", t)
        self.assertIn("const c = path[Math.min(2, path.length - 1)]", t)
        self.assertNotIn("localStorage", t)   # はじめての 人 だけ・1回だけ の 条件を もたない
        self.assertNotIn("lsGet", t)
        self.assertIn("document.addEventListener('pointerdown', tapDemoTouch, { capture: true, passive: true });", PIX)
        self.assertIn("setInterval(tapDemoTick, 250);", PIX)
        self.assertRegex(CSS, r"#tapDemo\{[^}]*pointer-events:none")
        self.assertRegex(CSS, r"#tiltHint\{[^}]*pointer-events:none")
        self.assertIn("@media (prefers-reduced-motion:reduce){#tiltHint,#tapDemo,#tapDemo::before,#pxTilt.pro .ic{animation:none}", CSS)
        self.assertNotIn("function tiltHintShow", PIX)

    def test_start_checks_cover_new_rules(self):
        for s in ["checks[kind + 'IdleDemo']", "mapOk = mapOnly.asks === 0 && !mapOnly.asked", "await page.click('#pxTilt')", "reaskMap === 0 && remembered",
                  "!btn0 && !first.btn && !last.btn && first.asks === 0", "last.saved === '0'", "last.saved === '1'"]:
            self.assertIn(s, START)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
