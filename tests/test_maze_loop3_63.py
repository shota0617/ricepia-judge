"""第3弾サイクル63：速く転がると風が見える（mzGlideWind・drawMzGlide・迷路の描画行への配線）。"""
import json
import math
import re
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


WIND, DRAW = fn("mzGlideWind"), fn("drawMzGlide")
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def wind(*args):
    js = WIND + "\nconsole.log(JSON.stringify([" + ",".join("mzGlideWind(%s)" % a for a in args) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


class Wind(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzGlideWind("), 1)
        self.assertEqual(PIXEL.count("function drawMzGlide("), 1)

    def test_invalid_zero(self):
        zero = {"n": 0, "len": 0, "alpha": 0, "ang": 0, "phase": 0}
        r = wind("'1',1,0", "1,null,0", "NaN,1,0", "1,1,Infinity", "1,1,undefined", "Infinity,1,0")
        self.assertEqual(r, [zero] * 6)

    def test_slow_zero(self):
        for w in wind("0,0,5", "0.5,0.5,5", "0.79,0,5", "0,-0.79,5"):
            self.assertEqual(w["n"], 0)
            self.assertEqual((w["len"], w["alpha"]), (0, 0))

    def test_tiers(self):
        self.assertEqual([w["n"] for w in wind("0.8,0,0", "1.59,0,0", "1.6,0,0", "2.59,0,0", "2.6,0,0", "9,0,0")], [3, 3, 4, 4, 5, 5])

    def test_len_alpha_monotonic_capped(self):
        ws = wind(*["%s,0,0" % s for s in (0.8, 1.2, 1.6, 2.0, 2.6, 4, 9)])
        for a, b in zip(ws, ws[1:]):
            self.assertLessEqual(a["len"], b["len"])
            self.assertLessEqual(a["alpha"], b["alpha"])
        self.assertLess(ws[0]["len"], ws[3]["len"])
        self.assertLess(ws[0]["alpha"], ws[3]["alpha"])
        for w in ws:
            self.assertLessEqual(w["len"], 2.2)
            self.assertTrue(0 < w["alpha"] <= 0.85)

    def test_ang_and_phase(self):
        w = wind("-1,2,0", "3,-1,45", "1,1,90", "1,1,12345")
        self.assertAlmostEqual(w[0]["ang"], math.atan2(2, -1))
        self.assertAlmostEqual(w[1]["ang"], math.atan2(-1, 3))
        self.assertAlmostEqual(w[1]["phase"], 0.5)
        for x in w:
            self.assertTrue(0 <= x["phase"] < 1)


class Draw(unittest.TestCase):
    def test_guards(self):
        head = DRAW.split("\n", 3)[1:3]
        self.assertIn("rec || rp.x === null || rp.x === undefined", head[0])
        self.assertIn("mzGlideWind(rp.vx, rp.vy, now)", DRAW)
        self.assertIn("w.n === 0", DRAW)

    def test_read_only(self):
        body = WIND + DRAW
        self.assertNotIn("fillText", body)
        self.assertNotIn("G.", body)
        self.assertIsNone(re.search(r"\brp\.\w+\s*[-+*/]?=(?!=)", body))
        self.assertNotIn("floatText", body)
        self.assertIn("calmMotion ? 0 : w.phase", DRAW)

    def test_save_restore_paired(self):
        self.assertEqual(DRAW.count("ctx.save()"), 1)
        self.assertEqual(DRAW.count("ctx.restore()"), 1)
        self.assertIn("quadraticCurveTo", DRAW)
        self.assertIn("'round'", DRAW)


class Wire(unittest.TestCase):
    def test_call_once_after_pulse(self):
        row = next(l for l in PIXEL.splitlines() if "drawMzPulse(ox, oy, T, now);" in l and "mazeOn()" in l)
        self.assertEqual(row.count("drawMzGlide(ox, oy, T, now)"), 1)
        self.assertEqual(PIXEL.count(" drawMzGlide(ox, oy, T, now);"), 1)
        self.assertLess(row.index("drawMzPulse("), row.index("drawMzGlide("))


class Scope(unittest.TestCase):
    def test_files_allowed(self):
        out = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go.html") or f.startswith("tests/"), f)

    def test_no_banned_words(self):
        text = "\n".join(ADDED)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, text)
