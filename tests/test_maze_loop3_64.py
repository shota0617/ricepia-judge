"""第3弾サイクル64：あつい／つめたいが色で分かる（mzCacheGlow・drawMzCacheGlow・迷路の描画行への配線）。"""
import json
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


GLOW, DRAW = fn("mzCacheGlow"), fn("drawMzCacheGlow")
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def glow(*args):
    js = GLOW + "\nconsole.log(JSON.stringify([" + ",".join("mzCacheGlow(%s)" % a for a in args) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


ZERO = {"a": 0, "r": 0, "rgb": ""}


class Glow(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzCacheGlow("), 1)
        self.assertEqual(PIXEL.count("function drawMzCacheGlow("), 1)

    def test_invalid_warm_zero(self):
        self.assertEqual(glow("0,5", "2,5", "'1',5", "null,5", "undefined,5"), [ZERO] * 5)

    def test_invalid_dist_zero(self):
        self.assertEqual(glow("1,-1", "1,'5'", "1,NaN", "-1,Infinity", "1,undefined"), [ZERO] * 5)

    def test_colors(self):
        a, b = glow("1,5", "-1,5")
        self.assertEqual(a["rgb"], "255,154,60")
        self.assertEqual(b["rgb"], "90,176,255")

    def test_tiers(self):
        r = glow("1,0", "1,3", "1,4", "1,8", "1,9", "-1,50")
        self.assertEqual([x["r"] for x in r], [0.75, 0.75, 0.95, 0.95, 1.15, 1.15])
        self.assertEqual([x["a"] for x in r], [0.85, 0.85, 0.65, 0.65, 0.45, 0.45])


class Draw(unittest.TestCase):
    def test_guards(self):
        self.assertIn("rec || rp.x === null || rp.x === undefined", DRAW)
        self.assertIn("mzCacheGlow(mzCache.warm, mzCache.dist)", DRAW)
        self.assertIn("g.a === 0", DRAW)

    def test_read_only(self):
        body = GLOW + DRAW
        for w in ("fillText", "G.", "floatText"):
            self.assertNotIn(w, body)
        self.assertIsNone(re.search(r"\b(?:rp|mzCache)\.\w+\s*[-+*/]?=(?!=)", body))

    def test_save_restore_and_three_elements(self):
        self.assertEqual(DRAW.count("ctx.save()"), 1)
        self.assertEqual(DRAW.count("ctx.restore()"), 1)
        self.assertEqual(DRAW.count(".fill()"), 1)
        self.assertEqual(DRAW.count(".stroke()"), 2)
        self.assertIn("S * g.r * 1.25", DRAW)
        self.assertIn("calmMotion ? 1 : 0.85 + 0.15 * Math.sin(now / 240)", DRAW)


class Wire(unittest.TestCase):
    def test_call_once_after_pulse(self):
        row = next(l for l in PIXEL.splitlines() if "drawMzPulse(ox, oy, T, now);" in l and "mazeOn()" in l)
        self.assertEqual(row.count("drawMzCacheGlow(ox, oy, T, now)"), 1)
        self.assertEqual(PIXEL.count(" drawMzCacheGlow(ox, oy, T, now);"), 1)
        self.assertLess(row.index("drawMzPulse("), row.index("drawMzCacheGlow("))


class Scope(unittest.TestCase):
    def test_files_allowed(self):
        out = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go.html") or f.startswith("tests/"), f)

    def test_no_banned_words(self):
        text = "\n".join(ADDED)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, text)
