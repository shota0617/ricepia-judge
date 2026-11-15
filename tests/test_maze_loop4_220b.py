"""第4弾サイクル220b：通し（PR #1197 の 2回め）で 落ちた 2つ（rollFeel・waterWatch）は、どちらも 前の 確かめから の 持ちこし（220 の ゴールの 止めとは かかわらない）。確かめを そろえる。
(a) waterWatch：前の 生きものの 確かめで お米が 水の となりに 置かれて 止まり、きょうの「じっと見る」2回を 使いきって いた（watch 2・出会い 0）。
    本物の 確かめの 文を、1日 2回までの にせの ゲームで 動かす：使いきった 状態から でも 通る（直す 前の 台本では 落ちる）。きまり（watch 1・出会い +1）は かえない
(b) rollFeel：まん中の 線で さがした「かべ」を、生け垣の かどで 丸い お米が すり ぬけ、12マス 先の かべに 4.5秒の 終わりに 着いて はね返る ところを はかって いた。
    押した かべを こえたら、止まるのを 待って かべを さがしなおす（3回まで）。押しなおす ときに 前の 10回を 使わない。ゆれ 0.02・速さ 0.2・押す 4.5秒・10回 は かえない"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")


def block(head, end):
    i = PLAY.index(head)
    return PLAY[i:PLAY.index(end, i) + len(end)]


class WaterWatch220b(unittest.TestCase):
    def run_check(self, watch0):
        h = "  R.checks.waterWatch = await page.evaluate("
        i = PLAY.index(h)
        body = PLAY[i + len(h):PLAY.index("\n  });\n", i) + 4]
        js = r"""
const day = { watch: %d, critters: 2 }, WATCH_DAILY = 2;
let pending = false;
const nishioGo = { state: { day }, me: { lat: 0, lng: 0 }, moveTo() { pending = true; } };
const nishioPixel = { C: { A: 9 }, toTile: () => ({ x: 10, y: 10 }), blockedAt: () => false, codeAt: (x, y) => (x === 12 && y === 10 ? 9 : 0), toLatLng: (x, y) => ({ lat: y, lng: x }) };
const el = { classList: { contains: () => false }, click() {}, hidden: false };
const document = { getElementById: () => el };
// 5.5秒 待つ 間に、水の となりで 止まって いる ゲームの「じっと見る」（1日 2回まで・出会いは 5回まで）
const setTimeout = (f) => { if (pending && (day.watch || 0) < WATCH_DAILY && (day.critters || 0) < 5) { day.watch = (day.watch || 0) + 1; day.critters++; } f(); };
(%s)().then(r => console.log(JSON.stringify(r)));
""" % (watch0, body)
        r = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=30)
        if r.returncode:
            raise AssertionError(r.stderr[-1200:])
        return json.loads(r.stdout)

    def test_used_up_before_still_measures(self):
        o = self.run_check(2)
        self.assertTrue(o["ok"], "前の 確かめで 2回 使った あとは 出会えない ままで 落ちる: %r" % o)
        self.assertEqual((o["watch"], o["critters"]), (1, 1))

    def test_fresh_unchanged(self):
        o = self.run_check(0)
        self.assertTrue(o["ok"], o)

    def test_rule_kept(self):
        b = block("  R.checks.waterWatch = await page.evaluate(", "\n  });\n")
        self.assertIn("ok: d.watch === 1 && (d.critters || 0) === c0 + 1", b)
        self.assertIn("if (c0 >= 5) return { ok: true, skipped: 'critter-cap' };", b)
        self.assertIn("await new Promise(r => setTimeout(r, 5500));", b)


class RollFeel220b(unittest.TestCase):
    def setUp(self):
        self.b = block("  R.checks.rollFeel = await (async () => {", "\n  })();\n")

    def test_refind_wall_when_passed(self):
        b = self.b
        self.assertIn("if (along <= wall[1] + 0.5 || ++rfTry >= 3) break;", b)
        self.assertLess(b.index("const p0 = await page.evaluate("), b.index("await page.keyboard.down(wall[0]);"))
        i = b.index("(dbg.passed = dbg.passed || []).push(")
        self.assertIn("if (r.vx === 0 && r.vy === 0) return g;", b[i:])   # 止まるのを 待って から さがしなおす

    def test_samples_reset_each_press(self):
        b = self.b
        self.assertLess(b.index("window.__rfS = null;"), b.index("const smp = (await gameTime("))
        self.assertGreater(b.index("window.__rfS = null;"), b.index("await page.keyboard.down(wall[0]);"))

    def test_rule_kept(self):
        b = self.b
        self.assertIn("still = pressed === true && smp.length === 10 && dbg.spread < 0.02 && dbg.vmax < 0.2;", b)
        self.assertIn("const pressed = await gameTime(g => (g >= 4500 ? true : undefined));", b)
        self.assertIn("if (S.length >= 10) return S;", b)
        self.assertIn("ok: stopped && stopS <= 3.5 && still !== false && rr.round && flatGrew === 0", b)


if __name__ == "__main__":
    unittest.main()
