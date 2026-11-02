"""第3弾サイクル24：迷路の救助クエスト（ポケモン不思議のダンジョン 救助隊DX の救助依頼。迷子のお米をゴールまで連れて行く）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def func_body(head, src=PIXEL):
    i = src.index(head)
    return src[i:src.index("\n}\n", i)]


class Rescue(unittest.TestCase):
    def test_constants_state_functions(self):
        self.assertIn("const MZ_RESCUE = { join: 5, pts: 30, min: 10, reach: 18, tagMs: 6000 }", PIXEL)
        self.assertIn("const mzRescue = {", PIXEL)
        for h in ("function mzRescueReset(", "function mzRescuePick(", "function mzRescueTick(", "function mzRescueGoal(",
                  "function mzRescueState(", "function drawMzRescue(", "function drawMzRescueMate(", "function drawMzRescueTag("):
            self.assertIn(h, PIXEL)

    def test_pick_exclusions(self):
        pick = func_body("function mzRescuePick(")
        self.assertIn("mzFruitOk(x, y)", pick)
        self.assertIn("MZ_RESCUE.min", pick)
        self.assertIn("MZ_RESCUE.reach", pick)
        self.assertIn("mzFruit.cx", pick)
        self.assertIn("typeof mzRescue !== 'undefined' && mzRescue.cx === cx && mzRescue.cy === cy) return false", func_body("function mzFruitOk("))
        tick = func_body("function mzRescueTick(")
        self.assertIn("mzRescue.next = now + 500", tick)

    def test_tick_wiring(self):
        self.assertIn("mzPurifyTick(now); mzRescueTick(now); }", PIXEL)

    def test_join_and_public_api(self):
        tick = func_body("function mzRescueTick(")
        self.assertIn("r = G.mzRescueJoin && G.mzRescueJoin();\n  if (!r) return;", tick)
        self.assertIn("お米と 合流！ +${r.pts}pt　ゴールまで いっしょに 行こう", tick)
        self.assertIn("if (mzRescue.joined) return;", tick)    # 合流後は二度と湧かない
        j = func_body("function mzRescueJoin(", GAME)
        for k in ("gainPoints(MZ_RESCUE_JOIN)", "save()", "track('maze_rescue_join'", "return { pts: MZ_RESCUE_JOIN }"):
            self.assertIn(k, j)
        g = func_body("function mzRescue()", GAME)
        for k in ("gainPoints(MZ_RESCUE_PTS)", "S.rescueGot = (S.rescueGot || 0) + 1", "save()", "track('maze_rescue'", "return { pts: MZ_RESCUE_PTS }"):
            self.assertIn(k, g)
        self.assertIn("MZ_RESCUE_JOIN = 5, MZ_RESCUE_PTS = 30", GAME)
        self.assertRegex(GAME, r"mzPurify, mzRescueJoin, mzRescue,")
        self.assertIn("rescueGot: 0", GAME)
        self.assertNotIn("S.rescueGot || 0, '回']", GAME)

    def test_goal_hook_after_guard(self):
        body = func_body("function mazeGoal(", GAME)
        self.assertLess(body.index("gl.sec <= 3"), body.index("MZ.rescueGoal(id)"))
        self.assertLess(body.index("MZ.chaseGoal(id)"), body.index("MZ.rescueGoal(id)"))
        self.assertIn("rescueGoal: id => mzRescueGoal(id)", PIXEL)
        self.assertIn("rescue: () => mzRescueState()", PIXEL)

    def test_pay_once(self):
        goal = func_body("function mzRescueGoal(")
        self.assertIn("!mzRt.warp && mzRescueLive()", goal)   # warp は払わない
        self.assertIn("pv.rescue", goal)
        self.assertIn("mzRescue.paid = true", goal)
        self.assertIn("G.mzRescue && G.mzRescue()", goal)
        self.assertIn("function mzRescueLive() { return mzRescue.joined && !mzRescue.paid; }", PIXEL)
        self.assertIn("rescue: !mzRt.warp && mzRescueLive()", PIXEL)

    def test_reset_rules(self):
        self.assertRegex(PIXEL, r"mzPurifyReset\(\);[^\n]*\n\s*mzRescueReset\(\);")
        self.assertRegex(PIXEL, r"!mazeOn\(\) && \(mzRescue\.sx >= 0 \|\| mzRescue\.joined[^\n]*\) mzRescueReset\(\)")
        i = PIXEL.index("!mazeOn() && (mzRescue.sx >= 0")
        self.assertLess(PIXEL.rindex("if (G.demo && rollOn && !driving)", 0, i), i)
        self.assertIn("joined: false", func_body("function mzRescueReset("))

    def test_draw_order(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzRescue(" in l)
        self.assertLess(line.index("drawMzRescue("), line.index("drawMzFogVeil("))        # 対象は veil より前
        self.assertGreater(line.index("drawMzRescueMate("), line.index("drawMzFogVeil("))  # 追従は veil より後
        hud = next(l for l in PIXEL.splitlines() if "drawMzPurifyTag(w, dpr, now);" in l)
        self.assertLess(hud.index("drawMzPurifyTag("), hud.index("drawMzRescueTag("))
        self.assertLess(hud.index("drawMzRescueTag("), hud.index("drawMzMini("))

    def test_mate_uses_history(self):
        m = func_body("function drawMzRescueMate(")
        self.assertIn("mzRescue.hist[1]", m)
        self.assertIn("rp.x - MZ_K", m)
        t = func_body("function mzRescueTick(")
        self.assertIn("mzRescue.hist.length > 4", t)

    def test_tag_three_states(self):
        tag = func_body("function drawMzRescueTag(")
        for k in ("🆘 救助クエスト　迷子のお米", "あと ${mzRescue.dist}歩くらい", "🆘 救助中　お米が ついてきてるよ　ゴールまで いっしょに！",
                  "🎉 救助完了！ +30pt　かおりちゃん、ありがとう！", "MZ_RESCUE.tagMs", "mzPurify.doneAt", "mapCovered(true)"):
            self.assertIn(k, tag)
        self.assertIn("🆘 たすけて！", func_body("function drawMzRescue("))

    def test_non_blocking(self):
        seg = PIXEL[PIXEL.index("// 迷路の 救助クエスト（ポケモン"):PIXEL.index("// 手描き探索マップ")]
        for w in ("addEventListener", "confirm(", "alert(", "modal"):
            self.assertNotIn(w, seg)

    def test_syntax(self):
        for f in ("pixel.js", "game.js"):
            subprocess.run(["node", "--check", str(ROOT / "nishio-go" / f)], check=True)

    def test_no_forbidden_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertIn("mzRescue", added)
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
