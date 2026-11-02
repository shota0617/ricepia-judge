"""第3弾サイクル26：迷路の中の回転キューブ（FEZ。金のかけら4つで大きなキューブが組み上がり、視点が回って隠れていた印がミニマップに記録される）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def func_body(head, src=PIXEL):
    i = src.index(head)
    return src[i:src.index("\n}\n", i)]


class Cube(unittest.TestCase):
    def test_constants_state_functions(self):
        self.assertIn("const MZ_CUBE = { n: 4, min: 6, reach: 18, pts: 5, done: 20, bigMs: 6000 }", PIXEL)
        self.assertIn("const mzCube = {", PIXEL)
        for h in ("function mzCubeReset(", "function mzCubePick(", "function mzCubeTick(", "function mzCubeReveal(",
                  "function mzCubePoly(", "function drawMzCube(", "function drawMzCubeBig(", "function drawMzCubeShelf("):
            self.assertIn(h, PIXEL)

    def test_pick_exclusions(self):
        pick = func_body("function mzCubePick(")
        for k in ("mzFruitOk(x, y)", "MZ_CUBE.min", "MZ_CUBE.reach", "mzFruit.cx", "mzPiece.cx", "ls[0] === x"):
            self.assertIn(k, pick)
        self.assertIn("mzCube.cx === cx && mzCube.cy === cy) return false", func_body("function mzFruitOk("))
        tick = func_body("function mzCubeTick(")
        self.assertIn("now < mzCube.next", tick)
        self.assertIn("mzCube.next = now + 500", tick)

    def test_tick_wiring_and_api(self):
        self.assertIn("mzRescueTick(now); mzCubeTick(now); }", PIXEL)
        tick = func_body("function mzCubeTick(")
        self.assertIn("r = G.mzCube && G.mzCube(fin);\n  if (!r) return;", tick)
        self.assertIn("🎉 キューブ完成！ +${r.pts}pt", tick)
        self.assertIn("grainSound()", tick)
        self.assertIn("cube: () =>", PIXEL)
        self.assertRegex(GAME, r"mzRescue, mzCube, mzGrainHas")

    def test_game_points_and_save(self):
        body = func_body("function mzCube(done)", GAME)
        self.assertIn("MZ_CUBE_PTS + (done ? MZ_CUBE_DONE : 0)", body)
        self.assertIn("const MZ_CUBE_PTS = 5, MZ_CUBE_DONE = 20;", GAME)
        self.assertIn("if (done) S.cubeGot = (S.cubeGot || 0) + 1;", body)
        self.assertIn("save();", body)
        self.assertIn("track('maze_cube'", body)
        self.assertIn("return { pts };", body)
        self.assertIn("cubeGot: 0", GAME)

    def test_shelf_has_no_text(self):
        for h in ("function drawMzCubeShelf(", "function mzCubePoly(", "function drawMzCube(", "function drawMzCubeBig("):
            b = func_body(h)
            for w in ("fillText", "strokeText", "font"):
                self.assertNotIn(w, b)
            self.assertNotRegex(b, "[\U0001F300-\U0001FAFF]")   # 絵文字を使わない
        shelf = func_body("function drawMzCubeShelf(")
        self.assertIn("MZ_CUBE.n", shelf)
        self.assertIn("mzCube.got", shelf)
        self.assertIn("drawMzCacheChip(w, dpr, now); drawMzCubeShelf(w, dpr, now); drawMzMini(", PIXEL)
        self.assertIn("mzCubeShelfH(dpr)", func_body("function mzViewShelfY("))   # ピース棚の下に置き、後ろの札はその下へ

    def test_poly_is_rotating_isometric(self):
        poly = func_body("function mzCubePoly(")
        self.assertIn("ang", poly)
        self.assertIn("#f0b820", poly)
        self.assertIn("#c98f10", poly)
        self.assertIn("#8a5f08", poly)   # 明・中・暗
        self.assertIn("Math.sin(n) <= 0", poly)   # 奥の面は描かない
        self.assertIn("now / 900", func_body("function drawMzCube("))   # 時刻で回る

    def test_reveal_into_mini_seen(self):
        rev = func_body("function mzCubeReveal(")
        self.assertIn("mzMini.seen.set(", rev)
        self.assertIn("mzMiniMarks()", rev)
        marks = func_body("function mzMiniMarks(")
        self.assertIn("mzCache.dist >= 0 && mzCache.dist <= MZ_CACHE.show", marks)   # 宝箱は3歩条件
        self.assertIn("gp", marks)   # ゴールも
        self.assertIn("mzCubeReveal()", func_body("function mzCubeTick("))
        self.assertIn("mzCache", rev + marks)
        self.assertNotIn("mzCache.cx", rev)   # 宝箱を条件なしで漏らさない

    def test_big_cube_after_veil(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMaze(" in l)
        self.assertLess(line.index("drawMzCube(ox"), line.index("drawMzFogVeil("))
        self.assertGreater(line.index("drawMzCubeBig("), line.index("drawMzFogVeil("))
        big = func_body("function drawMzCubeBig(")
        self.assertIn("MZ_CUBE.bigMs", big)
        self.assertIn("mzOn(rp.x, rp.y)", big)   # かおりちゃんの周り

    def test_reset_outside_roll_block(self):
        self.assertRegex(PIXEL, r"!mazeOn\(\) && \(mzCube\.sx >= 0 \|\| mzCube\.got\)\) mzCubeReset\(\)")
        self.assertRegex(PIXEL, r"mzTrail\.clear\(\);[^\n]*\n\s*mzCubeReset\(\);")   # ゴール変更時

    def test_syntax_and_no_forbidden_words(self):
        for f in ("pixel.js", "game.js"):
            subprocess.run(["node", "--check", str(ROOT / "nishio-go" / f)], check=True)
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
