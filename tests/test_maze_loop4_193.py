"""第4弾サイクル193：ホーム画面に追加を 控えめに うながす（運営者の声 2026-11-10）。小さな 1行の 札・地図を ふさがない・はじめてのさんぽの あと・7日に1回・✕ で 30日。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
MAN = json.loads((ROOT / "nishio-go.webmanifest").read_text(encoding="utf-8"))
DOC = (ROOT / "docs" / "retention.md").read_text(encoding="utf-8")


def fn_src(name):
    i = GAME.index("function %s(" % name)
    return GAME[i:GAME.index("\n}\n", i) + 3]


def line_of(head):
    i = GAME.index(head)
    return GAME[i:GAME.index("\n", i)]


class A2hs193(unittest.TestCase):
    def test_pill_is_status_not_dialog(self):
        m = re.search(r'<div class="a2hs" id="a2hs" hidden role="status" aria-live="polite">\s*(.*?)\s*</div>', HTML, re.S)
        self.assertIsNotNone(m)
        inner = m.group(1)
        self.assertEqual(re.findall(r'id="(\w+)"', inner), ["a2hsAdd", "a2hsText", "a2hsNo"])
        self.assertIn('<button type="button" class="a2hs-go" id="a2hsAdd">📲 ホーム画面に 追加</button>', inner)
        self.assertNotIn("あとで", inner)
        self.assertNotIn('role="dialog"', inner)
        self.assertRegex(CSS, r"\.a2hs\{[^}]*pointer-events:none")
        self.assertRegex(CSS, r"\.a2hs>\*\{pointer-events:auto\}")
        self.assertNotRegex(CSS, r"\.a2hs\{[^}]*#fffbe8")   # 黄色い 窓では ない

    def test_eligibility_rules(self):
        code = """
let LS = {}, demo = true, sa = false, now = 1e12; const S = { checkins: 0 };
const store = { get: (k, d) => (k in LS ? LS[k] : d) }, standalone = () => sa; Date.now = () => now;
""" + line_of("const A2HS = ") + "\n" + fn_src("a2hsEligible") + """
const out = {};
out.fresh = a2hsEligible();
LS.nsg_mzgoals = 2; out.two = a2hsEligible();
LS.nsg_mzgoals = 3; out.three = a2hsEligible();
LS.nsg_a2hs_t = now - 6 * 86400000; out.day6 = a2hsEligible(); LS.nsg_a2hs_t = now - 8 * 86400000; out.day8 = a2hsEligible();
LS.nsg_a2hs_x = now - 29 * 86400000; out.x29 = a2hsEligible(); LS.nsg_a2hs_x = now - 31 * 86400000; out.x31 = a2hsEligible();
sa = true; out.standalone = a2hsEligible(); sa = false;
LS.nsg_a2hs_done = true; out.done = a2hsEligible(); delete LS.nsg_a2hs_done;
demo = false; out.walk0 = a2hsEligible(); S.checkins = 3; out.walk3 = a2hsEligible();
console.log(JSON.stringify(out));
"""
        r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout), {"fresh": False, "two": False, "three": True, "day6": False, "day8": True, "x29": False, "x31": True,
                                                "standalone": False, "done": False, "walk0": False, "walk3": True})

    def test_in_app_browsers(self):
        code = line_of("const inAppBrowser = ") + """
console.log(JSON.stringify(['Mozilla/5.0 (iPhone) Mobile/15E148 Safari Line/14.9.0', 'Mozilla/5.0 (iPhone) Instagram 300.0.0', 'Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (iPhone) CriOS/126.0 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36'].map(inAppBrowser)))"""
        r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
        self.assertEqual(json.loads(r.stdout), [True, True, True, False, False, False])
        self.assertIn("function a2hsHow() { return a2hsEvt ? 'prompt' : isIOS() && !inAppBrowser(navigator.userAgent) ? 'ios' : ''; }", GAME)

    def test_timing_and_calm(self):
        self.assertIn("const A2HS = { everyMs: 7 * 86400000, closedMs: 30 * 86400000, showMs: 11000, minPlayMs: 60000, returnMs: 20000, goals: 3, tryMs: 2000, tries: 20 };", GAME)
        calm = fn_src("a2hsCalm")
        for s in ["!ktBusy()", "!rewardBusy()", "$('toast').classList.contains('show')", "$('reactBar').hidden", "P.worldMode", '[role="dialog"]:not([hidden])']:
            self.assertIn(s, calm)
        later = fn_src("a2hsLater")
        self.assertIn("performance.now() < A2HS.minPlayMs || !a2hsCalm()", later)
        self.assertIn("if (!a2hsEligible() || !$('a2hs').hidden) return;", later)
        offer = fn_src("a2hsOffer")
        self.assertIn("a2hsTimer = setTimeout(() => { if (!el.hidden) { track('a2hs_later', { how: 'timeout' }); a2hsHide(); } }, A2HS.showMs);", offer)
        self.assertIn("$('a2hsText').textContent = '📲 □↑ →「ホーム画面に追加」で すぐ 開けるよ';", offer)
        self.assertIn("$('a2hsNo').addEventListener('click', () => { store.set('nsg_a2hs_x', Date.now()); track('a2hs_later', { how: 'close' }); a2hsHide(); });", GAME)

    def test_offered_after_goals_not_reward_cards(self):
        self.assertEqual(GAME.count("a2hsLater('goal')"), 3)   # チェックイン・人の ゴール・ごほうびの 窓の あと
        self.assertIn("  a2hsLater('goal');   // ホーム画面に追加の おすすめ", GAME)
        self.assertIn("      if (mz) a2hsLater('goal');   // ホーム画面に追加の おすすめ", GAME)
        self.assertIn("setTimeout(() => { if (store.get('nsg_started', false) && dayN() >= 1) a2hsLater('return'); }, A2HS.returnMs);", GAME)
        self.assertNotIn("setTimeout(a2hsOffer, 4200)", GAME)

    def test_manifest_and_icons_addable(self):
        self.assertEqual(MAN["short_name"], "さんぽGO")
        self.assertEqual(MAN["display"], "standalone")
        self.assertTrue(MAN["start_url"].endswith("?src=a2hs"))
        self.assertEqual(sorted(i["sizes"] for i in MAN["icons"]), ["192x192", "512x512"])
        for i in MAN["icons"]:
            self.assertTrue((ROOT / i["src"].lstrip("/")).exists())
        self.assertIn('<meta name="apple-mobile-web-app-title" content="さんぽGO"/>', HTML)
        self.assertIn('<link rel="apple-touch-icon" href="nishio-go/icon-192.png"/>', HTML)
        self.assertIn("if (/[?&]src=a2hs\\b/.test(location.search)) track('a2hs_open', {});", GAME)

    def test_docs_and_playtest(self):
        for ev in ["a2hs_shown", "a2hs_click", "a2hs_later", "a2hs_installed", "a2hs_open", "a2hs_skip"]:
            self.assertIn(ev, DOC)
        for k in ["a2hsFirstWalk", "a2hsShown", "a2hsAutoHide", "a2hsClose", "a2hsStandalone", "a2hsPrompt", "a2hsInApp"]:
            self.assertRegex(PLAY, r"\n  %s: '" % k)
        self.assertIn("need(String(c.tapWalkOnPill) === 'walk,walk',", PLAY)
        self.assertNotIn("tapWalkStopsOnCover", PLAY)


if __name__ == "__main__":
    unittest.main()
