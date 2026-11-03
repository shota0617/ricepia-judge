"""第3弾サイクル51：金のキューブが組み上がる（4つのかけらが飛んできて合体し、回転に合わせて菱形の視点フレームが回る）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


BODY = func_body("function drawMzCubeBig(")


class Call(unittest.TestCase):
    def test_defined_and_order(self):
        self.assertIn("function drawMzCubeBig(ox, oy, T, now) {", PIXEL)
        self.assertEqual(PIXEL.count("drawMzCubeBig(ox, oy, T, now);"), 1)
        line = next(l for l in PIXEL.splitlines() if "drawMzCubeBig(ox, oy, T, now);" in l and "drawMzFogVeil(" in l)
        self.assertTrue(line.index("drawMzFogVeil(") < line.index("drawMzRescueRing(") < line.index("drawMzCubeBig("))


class Assemble(unittest.TestCase):
    def test_asm(self):
        self.assertIn("calmMotion ? 1 : Math.min(1, el / 900)", BODY)
        self.assertIn("el = now - mzCube.doneAt", BODY)

    def test_pieces(self):
        self.assertIn("asm < 1", BODY)
        self.assertIn("i < 4", BODY)
        self.assertIn("i * Math.PI / 2 + Math.PI / 4", BODY)
        self.assertIn("s * 2.2 * (1 - asm)", BODY)
        self.assertIn("s * 0.38 * (1 - asm * 0.5), ang", BODY)

    def test_big_grows(self):
        self.assertIn("mzCubePoly(X, Y, s * (0.55 + 0.45 * asm), ang)", BODY)


class Frame(unittest.TestCase):
    def test_frame(self):
        for t in ("on[0] * T", "on[1] * T", "R = T * 1.35", "ang + i * Math.PI / 2", "rgba(255,210,70,", "ctx.stroke()"):
            self.assertIn(t, BODY)

    def test_order(self):
        self.assertLess(BODY.index("R = T * 1.35"), BODY.index("mzCubePoly(X, Y, s * (0.55"))
        self.assertLess(BODY.index("rgba(255,210,70,"), BODY.index("mzCubePoly("))

    def test_fade_kept(self):
        self.assertIn("ctx.save(); ctx.globalAlpha = Math.max(0, fade);", BODY)
        self.assertLess(BODY.index("R = T * 1.35"), BODY.index("ctx.restore()"))


class Pure(unittest.TestCase):
    def test_no_state_or_text(self):
        for w in ("fillText", "G.", "floatText", "mzCube.doneAt =", "mzCube.got", "grainSound"):
            self.assertNotIn(w, BODY)


class Unchanged(unittest.TestCase):
    def test_cube_rules(self):
        self.assertIn("n: 4", PIXEL[PIXEL.index("const MZ_CUBE"):][:80])
        self.assertIn("mzCubeReveal()", func_body("function mzCubeTick("))
        self.assertIn("mzCube", (ROOT / "nishio-go/game.js").read_text(encoding="utf-8"))

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        for f in git("diff", "--name-only", "origin/main").split():
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go.html") or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
