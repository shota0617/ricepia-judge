"""第3弾サイクル55：ゴールの光の柱（ゴールに近づくほど、光の柱が高く・太く・明るく育つ）。"""
import json
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


BODY = func_body("function drawMzFogVeil(")
BEACON = next(l for l in PIXEL.splitlines() if l.startswith("function mzGoalBeacon("))


class Beacon(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzGoalBeacon(n)"), 1)

    def test_values(self):
        js = BEACON + "\nconsole.log(JSON.stringify([null,undefined,'a',NaN,-1,40,99,20,0,10].map(mzGoalBeacon)));"
        r = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
        for a, b in zip(r, [0, 0, 0, 0, 0, 0, 0, 0.5, 1, 0.75]):
            self.assertAlmostEqual(a, b)

    def test_pure(self):
        for w in ("G.", "mzRt", "ctx"):
            self.assertNotIn(w, BEACON)


class Draw(unittest.TestCase):
    def test_prox_from_path(self):
        self.assertIn("prox = mzGoalBeacon(mzRt.path ? mzRt.path.length - 1 : null)", BODY)

    def test_radius(self):
        self.assertIn("R = S * (0.9 + 0.6 * prox)", BODY)

    def test_center_brightness(self):
        self.assertIn("Math.min(0.95, 0.45 + pulse * 0.2 + prox * 0.25)", BODY)

    def test_pillar_height(self):
        self.assertIn("ph = S * (1.2 + 2.8 * prox)", BODY)
        self.assertIn("pw = S * (0.34 + 0.3 * prox)", BODY)

    def test_pillar_gold_gradient(self):
        self.assertIn("createLinearGradient(0, Y, 0, Y - ph)", BODY)
        self.assertIn("rgba(255,224,102,${0.28 + 0.4 * prox})", BODY)
        self.assertIn("ctx.fillRect(X - pw / 2, Y - ph, pw, ph)", BODY)

    def test_pillar_inside_onscreen_check(self):
        self.assertIn("Y - ph < ctx.canvas.height", BODY)
        self.assertLess(BODY.index("Y - ph < ctx.canvas.height"), BODY.index("createLinearGradient(0, Y"))

    def test_core_fades(self):
        self.assertIn("createLinearGradient(0, Y, 0, Y - ph * 0.7)", BODY)
        self.assertIn("rgba(255,246,214,0)", BODY)

    def test_pillar_not_pulse_dependent(self):
        line = next(l for l in BODY.splitlines() if "pg.addColorStop(0" in l)
        self.assertNotIn("pulse", line)
        self.assertNotIn("calmMotion", BODY)


class Unchanged(unittest.TestCase):
    def test_veil_and_fog(self):
        self.assertIn("mzFogFill(mzFogCells(tx0, ty0, tx1, ty1, ox, oy, T, 'veil'), S)", BODY)
        self.assertEqual(PIXEL.count("function mzFogAlpha("), 1)
        d = "\n".join(l for l in git("diff", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l[:1] in "+-")
        self.assertNotIn("mzFogAlpha", d)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l and "!G.demo" not in l)
        for w in ("ぼく", "だに", "約20%", "G.", "fillText", "floatText"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        for f in git("diff", "--name-only", "origin/main").split():
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go.html") or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
