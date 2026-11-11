"""第4弾サイクル204：はじめの 1分で やめる 人を へらす・はじめの 手ごたえが 小さい（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」）。
ポイントが ふえたら、上の 数字の 札が ぽんと ふくらんで 金色に 光る（字は 足さない）。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn(name):
    i = GAME.index("function %s(" % name)
    return GAME[i:GAME.index("\n}\n", i) + 2]


def node(code):
    return json.loads(subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout)


# にせの 画面：札（.pts）の class と、止める 予約（setTimeout）を 記録する
STUB = """
const cls = new Set(), log = [], timers = [];
const el = { hidden: true, classList: { add: c => { cls.add(c); log.push('+' + c); }, remove: c => { if (cls.has(c)) log.push('-' + c); cls.delete(c); }, contains: c => cls.has(c) }, get offsetWidth() { log.push('reflow'); return 1; } };
const setTimeout = (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout = id => { if (timers[id - 1]) timers[id - 1].f = null; };
const node = { textContent: '', style: {}, closest: () => el };
const $ = () => node, document = { querySelectorAll: () => [] };
const needFor = lv => 25 * (lv - 1) * lv, levelOf = t => { let lv = 1; while (t >= needFor(lv + 1)) lv++; return lv; };
const S = { points: 0, total: 0, log: [] }, session = { gained: 0 }, store = { get: (k, d) => d };
let demo = true;
"""


class PtsPop204(unittest.TestCase):
    def run_js(self, tail):
        i = GAME.index("const PTS_POP_MIN = ")
        consts = GAME[i:GAME.index("\n", i) + 1]
        return node(STUB + consts + fn("ptsPop") + fn("renderHeader") + fn("gainPoints") + tail)

    def test_syntax(self):
        for f in ["nishio-go/game.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_gain_pops_the_pill(self):
        """たからばこの +30：札が 出て、pop が つき、0.6秒の 予約で はずれる"""
        r = self.run_js("gainPoints(30); const on = cls.has('pop'), ms = timers[0].ms; timers[0].f();"
                        "console.log(JSON.stringify({ on, ms, off: !cls.has('pop'), hidden: el.hidden, text: node.textContent, log }))")
        self.assertTrue(r["on"])
        self.assertEqual(r["ms"], 600)
        self.assertTrue(r["off"])
        self.assertFalse(r["hidden"])
        self.assertEqual(r["text"], "30")   # 字は 足さない（数字だけ）
        self.assertEqual(r["log"], ["reflow", "+pop", "-pop"])

    def test_small_gain_and_plain_render_do_not_pop(self):
        """歩いた 距離の +1・記録の 読みこみ（renderHeader だけ）・あるいて移動との 切りかえ（数字だけ かわる）では 光らない"""
        r = self.run_js("gainPoints(1); const a = cls.has('pop'); gainPoints(4); const b = cls.has('pop');"
                        "S.points = 500; renderHeader(); const c = cls.has('pop'); renderHeader(); const d = cls.has('pop');"
                        "console.log(JSON.stringify({ a, b, c, d, n: timers.length }))")
        self.assertEqual(r, {"a": False, "b": False, "c": False, "d": False, "n": 0})

    def test_gain_is_used_once(self):
        """ふえた 数は 1回だけ 使う（次の ただの 描きなおしで もう一度 光らない）。つづけて ふえたら はじめから"""
        r = self.run_js("gainPoints(5); timers[0].f(); renderHeader(); const again = cls.has('pop');"
                        "gainPoints(140); gainPoints(5); const live = timers.filter(t => t.f).length;"
                        "console.log(JSON.stringify({ again, on: cls.has('pop'), live, log }))")
        self.assertFalse(r["again"])
        self.assertTrue(r["on"])
        self.assertEqual(r["live"], 1)   # 前の 予約は 取りけす
        self.assertEqual(r["log"][-4:], ["+pop", "-pop", "reflow", "+pop"])

    def test_source(self):
        self.assertIn("const PTS_POP_MIN = 5, PTS_POP_MS = 600;", GAME)
        g = fn("gainPoints")
        self.assertLess(g.index("renderHeader.gained = n;"), g.index("renderHeader();"))
        h = fn("renderHeader")
        self.assertIn("const gained = renderHeader.gained; renderHeader.gained = 0;", h)
        self.assertIn("if (ptsEl && gained >= PTS_POP_MIN) ptsPop(ptsEl);", h)
        self.assertIn("ptsEl.hidden = !(S.points > 0)", h)   # 0pt の 間は 出さない（サイクル149）は そのまま

    def test_css(self):
        self.assertIn(".pts.pop{transform-origin:right center;animation:ptsPop .6s ease-out}", CSS)
        self.assertIn("@keyframes ptsPop{0%{transform:scale(1)}25%{transform:scale(1.5);background:#ffd84a;", CSS)
        self.assertIn("@media (prefers-reduced-motion:reduce){@keyframes ptsPop{0%,100%{transform:none}25%,60%{transform:none;background:#ffd84a;color:#3a2a00}}}", CSS)   # 動きを へらす 設定では 色だけ

    def test_owner_rules_kept(self):
        """字・カード・浮き文字は 足さない。紙ふぶき・許可・手本には さわらない"""
        self.assertIn('<div class="pts" hidden aria-live="polite"><i data-pi="coin" data-art="stat-coin"></i><b id="ptsNum">0</b><small class="tx">pt</small></div>', HTML)
        self.assertNotIn("toast(", fn("ptsPop"))
        self.assertNotIn("showReward", fn("ptsPop"))
        self.assertIn("if (demo && !(store.get('nsg_mzgoals', 0) >= 3)) return 0;", fn("gainPoints"))   # サイクル122
        self.assertIn("if (quietNumText(t)) return;", PIX)   # サイクル123
        self.assertIn("const MZ_GOAL_FX = { n: 24, bannerSec: 1.6, fadeSec: 0.4, lifeMin: 0.7, lifeVar: 0.4, vMin: 1.2, vVar: 2.4, up: 2.2, happyMs: 1600 };", PIX)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertIn("function tapDemoTick() {", PIX)

    def test_playtest_and_doc(self):
        self.assertIn("ptsPop: { ...(an.pop || { why: an.why || 'no-goal' }), ok: ", PLAY)
        self.assertIn("  ptsPop: '", PLAY)
        self.assertIn("- サイクル204：", DOC)


if __name__ == "__main__":
    unittest.main()
