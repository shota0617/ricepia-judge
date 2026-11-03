"""第3弾サイクル66：きょうりゅうから緑のソナーの輪が広がる（mzDinoSonar・drawMzDinoSonar・迷路の描画行への配線）。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def fn(name):
    a = PIXEL.index("function " + name + "(")
    return PIXEL[a:PIXEL.index("\n}\n", a) + 3]


SON, DRAW = fn("mzDinoSonar"), fn("drawMzDinoSonar")
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def sonar(*args):
    js = SON + "\nconsole.log(JSON.stringify([" + ",".join("mzDinoSonar(%s)" % a for a in args) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


def close(t, a, b):
    t.assertEqual(len(a), len(b))
    for x, y in zip(a, b):
        t.assertAlmostEqual(x["r"], y["r"], places=6)
        t.assertAlmostEqual(x["a"], y["a"], places=6)


class Sonar(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzDinoSonar("), 1)
        self.assertEqual(PIXEL.count("function drawMzDinoSonar("), 1)

    def test_examples(self):
        r = sonar("0", "1300", "2600")
        close(self, r[0], [{"r": 1.3, "a": 0.62}, {"r": 2.9, "a": 0.31}])
        close(self, r[1], [{"r": 2.9, "a": 0.31}, {"r": 1.3, "a": 0.62}])
        close(self, r[2], r[0])

    def test_invalid_zero(self):
        for x in sonar("-1", "NaN", "Infinity", "'5'", "null", "undefined"):
            self.assertEqual(x, [{"r": 0, "a": 0}] * 2)

    def test_ranges(self):
        for t in range(0, 10000, 37):
            for w in sonar(str(t))[0]:
                self.assertTrue(0 <= w["a"] <= 0.62 and 1.3 <= w["r"] <= 4.5, (t, w))


class Draw(unittest.TestCase):
    def test_guards(self):
        self.assertIn("if (mzDino.found || mzDino.cx < 0) return;", DRAW)

    def test_read_only(self):
        for w in ("fillText", "G.", "floatText", "mzDino.cx =", "mzDino.cy =", "mzDino.found ="):
            self.assertNotIn(w, DRAW)

    def test_save_restore_paired(self):
        self.assertEqual(DRAW.count("ctx.save()"), 1)
        self.assertEqual(DRAW.count("ctx.restore()"), 1)

    def test_two_rings_and_calm(self):
        self.assertIn("mzDinoSonar(calmMotion ? 650 : now).forEach", DRAW)
        self.assertIn("if (w.a <= 0) return;", DRAW)


class Wire(unittest.TestCase):
    def test_call_once_after_dino_before_fog(self):
        row = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "mazeOn()" in l)
        self.assertEqual(PIXEL.count("drawMzDinoSonar(ox, oy, T, now);"), 1)
        self.assertIn("drawMzDino(ox, oy, T, now); drawMzDinoSonar(ox, oy, T, now);", row)
        self.assertLess(row.index("drawMzDinoSonar("), row.index("drawMzFogVeil("))


class Scope(unittest.TestCase):
    def test_files_allowed(self):
        out = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/meiro.js", "nishio-go.html") or f.startswith("tests/"), f)

    def test_no_banned_words(self):
        text = "\n".join(ADDED)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, text)
