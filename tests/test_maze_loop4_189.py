"""第4弾サイクル189：スタートの1分。はじめてのゴールを 選びなおしで 遠くしない・手描きの名所の絵は 使うときに作る・すぐ着いたゴールでは「どうだった？」をたずねない。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")


def line_of(src, head):
    i = src.index(head)
    return src[i:src.index("\n", i)]


def fn_src(src, name):
    i = src.index("function %s(" % name)
    return src[i:src.index("\n}\n", i) + 3]


def node(code):
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


class FirstMinute189(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "nishio-go/game.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_first_best_is_shortest_and_stable(self):
        out = node(line_of(PIX, "const mzFirstBest = ") + """
const k = a => mzFirstBest(a.map(([gkey, cells]) => ({ gkey, cells }))).gkey;
console.log(JSON.stringify([k([['a', 21], ['b', 17], ['c', 18]]), k([['a', 17], ['b', 17]]), k([['a', 98]]), k([['a', 18], ['b', 19], ['c', 98]])]))""")
        self.assertEqual(out, ["b", "a", "a", "a"])

    def test_repick_stays_in_first_band_and_restores(self):
        self.assertIn("function guideNoPath(g, firstBand) {", GAME)
        self.assertIn("if (!next || (firstBand && dist(me, next) > FIRST_MAX)) { mzNoPath.delete(g.id); return false; }", GAME)
        self.assertIn("if (G.guideNoPath(g, true)) return;", PIX)
        self.assertIn("const best = mzFirstBest(tried);", PIX)
        self.assertIn("mzRt.simpleKey = best.gkey; mzRt.key = ''; G.setGuide(bg); return;", PIX)
        self.assertEqual(len(re.findall(r"G\.guideNoPath\(g\);", PIX)), 1)   # 道すじが 出ない とき（はなれ島）は これまでどおり 広い 範囲へ
        self.assertIn("const FIRST_MIN = 120, FIRST_MAX = 200;", GAME)

    def test_sprites_are_lazy(self):
        stub = """
let made = 0;
globalThis.document = { createElement: () => { made++; const d = { data: new Uint8ClampedArray(48 * 48 * 4) }; return { width: 0, height: 0, getContext: () => ({ fillRect() {}, getImageData: () => d, putImageData() {} }) }; } };
"""
        out = node(stub + fn_src(PIX, "shopCanvas") + fn_src(PIX, "shopCanvasNow") + line_of(PIX, "const sprW = ") + """
const a = shopCanvas(r => r(0, 0, 1, 1, '#fff'), true, 48), before = [made, a.made, a.size, a.length, sprW(a), made];
const c0 = a[0], c1 = a[1], again = a[0] === c0 && a[1] === c1, after = [made, a.made, c0.width];
a[0] = 'x';
const b = shopCanvas(() => {});
console.log(JSON.stringify({ before, again, after, set: a[0], b: [b.size, b.made], w: sprW([{ width: 96 }]) }))""")
        self.assertEqual(out["before"], [0, False, 48, 2, 48, 0])   # 幅を 聞く だけでは 作らない
        self.assertTrue(out["again"])
        self.assertEqual(out["after"], [2, True, 48])
        self.assertEqual(out["set"], "x")
        self.assertEqual(out["b"], [32, False])
        self.assertEqual(out["w"], 96)   # 特大の絵（ふつうの 配列）は 絵の 幅
        self.assertIn("const spotSize = (s, spr, T) => sprW(spr) * T / 16 * (s.shop && sprW(spr) <= 48 ? 2 : 1);", PIX)

    def test_play_ask_waits_in_first_walk(self):
        code = "const store = { get: (k, d) => (k in LS ? LS[k] : d) }; let LS = {}, demo = true;\n" + line_of(GAME, "const PLAY_ASK_MIN_S = ") + "\n" + line_of(GAME, "const playAskOk = ") + """
const out = [playAskOk({ sec: 15 }), playAskOk({ sec: 59.9 }), playAskOk({ sec: 60 })];
LS = { nsg_mzgoals: 3 }; out.push(playAskOk({ sec: 15 }));   // 3こめ（数は 着いた あとの もの）：たずねない
LS = { nsg_mzgoals: 4 }; out.push(playAskOk({ sec: 15 }));   // 4こめ：これまでどおり
LS = {}; demo = false; out.push(playAskOk({ sec: 15 }));
console.log(JSON.stringify(out))"""
        self.assertEqual(node(code), [False, False, True, False, True, True])
        # 数えるのが 先（mazeGoal の 中の goalFx → mzHelpGoal）、たずねるか 決めるのは その あと
        mg = fn_src(GAME, "mazeGoal")
        self.assertIn("MZ.goalFx('');", mg)
        self.assertLess(GAME.index("mb = mazeGoal(n.id, n.name, ml)"), GAME.index("if (playAskOk(mz)) playAsk(mz); }"))

    def test_manual_goal_is_not_replaced_by_tried(self):
        self.assertIn("guideKept: () => !!(S.guide && (S.guide.mine || S.guide.refer || S.guide.byId))", GAME)
        self.assertIn("const kept = !!(G.guideKept && G.guideKept());", PIX)
        self.assertIn("if (kept || mzFirstSimple(mzPathShape(mzRt.path), sm)) mzRt.firstTried = null;", PIX)
        self.assertIn("if (mz && !playAskOk(mz)) react.pending = null;", GAME)
        self.assertIn("if (playAskOk(mz)) playAsk(mz); }", GAME)

    def test_playtest_checks(self):
        for k in ["firstGoalNear", "lazySprites", "playAskQuick"]:
            self.assertRegex(PLAY, r"\n  %s: '" % k)
        self.assertIn("for (const k of Object.keys(FIRST_MINUTE_NEED)) need(c[k] && c[k].ok,", PLAY)
        self.assertIn("Object.assign(R.checks, await firstMinuteChecks(browser, R));", PLAY)
        self.assertIn("process.env.PLAYTEST_ONLY === 'firstMinute'", PLAY)

    def test_cycle151_export_kept(self):
        self.assertIn("firstRoute: { shape: mzPathShape, simple: mzFirstSimple, LIM: MZ_FIRST_SIMPLE }, firstBest: mzFirstBest", PIX)


if __name__ == "__main__":
    unittest.main()
