"""第3弾サイクル67：夕立雲が近いほど嵐の輪が締まる（mzStormRing・drawMzStormRing・迷路の描画行への配線）。"""
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


RING, DRAW = fn("mzStormRing"), fn("drawMzStormRing")
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def ring(*args):
    js = RING + "\nconsole.log(JSON.stringify([" + ",".join("mzStormRing(%s)" % a for a in args) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


ZERO = {"r": 0, "a": 0, "period": 0}


class Ring(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzStormRing("), 1)
        self.assertEqual(PIXEL.count("function drawMzStormRing("), 1)

    def test_invalid_and_far_zero(self):
        for x in ring("-1", "NaN", "Infinity", "'5'", "null", "undefined", "10.5", "11", "99"):
            self.assertEqual(x, ZERO)

    def test_values(self):
        for d in ("0", "1", "2"):
            self.assertEqual(ring(d)[0], {"r": 0.80, "a": 0.85, "period": 700})
        for d in ("3", "5"):
            self.assertEqual(ring(d)[0], {"r": 1.05, "a": 0.65, "period": 1100})
        for d in ("6", "10"):
            self.assertEqual(ring(d)[0], {"r": 1.35, "a": 0.45, "period": 1600})

    def test_closer_is_tighter(self):
        n, m, f = ring("1", "4", "8")
        self.assertTrue(n["r"] < m["r"] < f["r"])
        self.assertTrue(n["a"] > m["a"] > f["a"])
        self.assertTrue(n["period"] < m["period"] < f["period"])


class Draw(unittest.TestCase):
    def test_guards(self):
        for w in ("if (rec || rp.x === null || rp.x === undefined) return;", "!mzChaseLive() || mzChase.cx < 0", "if (w.a === 0) return;"):
            self.assertIn(w, DRAW)

    def test_reads_dist_only(self):
        self.assertIn("mzStormRing(mzChase.dist)", DRAW)
        for w in ("fillText", "G.", "floatText", "mzChase.dist =", "mzChase.caught =", "mzChase.paid ="):
            self.assertNotIn(w, DRAW)

    def test_save_restore_paired(self):
        self.assertEqual(DRAW.count("ctx.save()"), 1)
        self.assertEqual(DRAW.count("ctx.restore()"), 1)

    def test_three_parts_and_calm(self):
        self.assertEqual(DRAW.count(".fill()"), 1)
        self.assertEqual(DRAW.count(".stroke()"), 2)
        self.assertIn("w.r * 1.15", DRAW)
        self.assertIn("w.r * 1.30", DRAW)
        self.assertIn("calmMotion ? 1 : 0.85 + 0.15 * Math.sin(now / (w.period / 4))", DRAW)


class Wire(unittest.TestCase):
    def test_call_once_between_glide_and_chase(self):
        row = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "mazeOn()" in l)
        self.assertEqual(PIXEL.count("drawMzStormRing(ox, oy, T, now);"), 0)   # 第4弾サイクル67：追いかけないので嵐の輪は呼ばない
        self.assertIn("drawMzGlide(ox, oy, T, now); drawMzChase(ox, oy, T, now);", row)


class Scope(unittest.TestCase):
    def test_files_allowed(self):
        out = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") or f.startswith("tests/"), f)

    def test_no_banned_words(self):
        text = "\n".join(ADDED)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, text)
