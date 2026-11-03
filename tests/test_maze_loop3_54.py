"""第3弾サイクル54：歩き込んだ道ほど花が満開になる（近くに歩いたマスが多い場所ほど、道の花が大きく二重に咲く）。"""
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


BODY = func_body("function drawMzTrail(")
SCALE = func_body("function mzBloomScale(")
TICK = func_body("function mzTrailTick(")


class Scale(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzBloomScale(n)"), 1)

    def test_values(self):
        js = SCALE + "\n}\nconst r=[0,-1,1,2,3,4,9,'a',undefined,NaN].map(mzBloomScale);console.log(JSON.stringify(r));"
        out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
        r = __import__("json").loads(out)
        exp = [1, 1, 1.35, 1.7, 2.05, 2.4, 2.4, 1, 1, 1]
        for a, b in zip(r, exp):
            self.assertAlmostEqual(a, b)

    def test_pure(self):
        for w in ("G.", "mzTrail", "floatText", "ctx"):
            self.assertNotIn(w, SCALE)
        self.assertIn("Math.min(2.4, 1 + 0.35 * n)", SCALE)


class Draw(unittest.TestCase):
    def test_neighbour_count(self):
        self.assertIn("let nb = 0;", BODY)
        self.assertIn("if (mzTrail.has((cx + dx) + ',' + (cy + dy)) && mzOpen(cx, cy, dx, dy)) nb++;", BODY)
        self.assertIn("mzBloomScale(nb), nb >= 3]", BODY)

    def test_radius_scaled(self):
        self.assertIn("const pr0 = Math.max(1.5, T * 0.09);", BODY)
        self.assertIn("const pr = pr0 * scale;", BODY)
        self.assertIn("pr * 0.8", BODY)

    def test_full_bloom(self):
        self.assertIn("for (const [X, Y, rgb, scale, full] of flowers)", BODY)
        self.assertIn("if (full) {", BODY)
        self.assertIn("'rgba(' + rgb + ',.35)'", BODY)
        self.assertIn("pr * 1.55", BODY)
        self.assertIn("Math.PI / 5", BODY)

    def test_alpha_via_rgba(self):
        if "globalAlpha" in BODY:
            self.assertIn("globalAlpha = 1", BODY)


class Unchanged(unittest.TestCase):
    def test_tick_untouched(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        self.assertNotIn("mzTrailTick", "\n".join(l for l in d.splitlines() if l[:1] in "+-"))
        self.assertIn("mzTrail", TICK)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++") and "!G.demo" not in l)
        for w in ("ぼく", "だに", "約20%", "G.", "fillText", "floatText"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        for f in git("diff", "--name-only", "origin/main").split():
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go.html") or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
