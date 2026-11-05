"""第3弾サイクル68：歩いて貯まるエネルギーが足あとを星屑に変える（mzEnergyStars・drawMzEnergyStars・迷路の描画行への配線）。"""
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


STARS, DRAW = fn("mzEnergyStars"), fn("drawMzEnergyStars")
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def stars(*args):
    js = STARS + "\nconsole.log(JSON.stringify([" + ",".join("mzEnergyStars(%s)" % a for a in args) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


ZERO = {"n": 0, "a": 0}


class Stars(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzEnergyStars("), 1)
        self.assertEqual(PIXEL.count("function drawMzEnergyStars("), 1)

    def test_invalid_and_low_zero(self):
        for x in stars("NaN", "Infinity", "'0.9'", "null", "undefined", "-1", "0", "0.24"):
            self.assertEqual(x, ZERO)

    def test_values(self):
        self.assertEqual(stars("0.25", "0.49")[0], {"n": 4, "a": 0.35})
        self.assertEqual(stars("0.5")[0], {"n": 8, "a": 0.6})
        for r in ("0.75", "1", "2"):
            self.assertEqual(stars(r)[0], {"n": 12, "a": 0.9})

    def test_more_charge_more_stars(self):
        a, b, c = stars("0.3", "0.6", "0.9")
        self.assertTrue(a["n"] < b["n"] < c["n"])
        self.assertTrue(a["a"] < b["a"] < c["a"])


class Draw(unittest.TestCase):
    def test_guards(self):
        self.assertIn("if (rec) return;", DRAW)
        self.assertIn("mzEnergyStars(mzEnergyCharge())", DRAW)
        self.assertIn("w.n === 0 || !mzTrail.size", DRAW)

    def test_read_only(self):
        for w in ("fillText", "G.", "floatText", "mzEnergy.", "mzTrail.set", "mzTrail.delete", "mzTrail.clear"):
            self.assertNotIn(w, DRAW)

    def test_save_restore_paired(self):
        self.assertEqual(DRAW.count("ctx.save()"), 1)
        self.assertEqual(DRAW.count("ctx.restore()"), 1)

    def test_star_and_calm(self):
        self.assertEqual(DRAW.count(".fill()"), 1)
        self.assertIn("S * 0.30", DRAW)
        self.assertIn("rgba(255, 210, 90, ", DRAW)
        self.assertIn("calmMotion ? 0.8 :", DRAW)
        self.assertIn("0.55 + 0.45 * Math.sin(now / 300 + i * 1.7)", DRAW)

    def test_newest_first_max_n(self):
        self.assertIn("mzTrail.values()].slice(-w.n).reverse()", DRAW)
        self.assertIn("mzOn(", DRAW)


class Wire(unittest.TestCase):
    def test_call_once_after_aura(self):
        row = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "mazeOn()" in l)
        self.assertEqual(PIXEL.count("drawMzEnergyStars(ox, oy, T, now);"), 1)
        self.assertIn("drawMzEnergyAura(ox, oy, T, now); drawMzEnergyStars(ox, oy, T, now);", row)


class Scope(unittest.TestCase):
    def test_files_allowed(self):
        out = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") or f.startswith("tests/"), f)

    def test_no_banned_words(self):
        text = "\n".join(ADDED)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, text)
