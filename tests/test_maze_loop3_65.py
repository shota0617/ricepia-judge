"""第3弾サイクル65：歩いた範囲が領地として広がる（mzTerritory・drawMzTerritory・迷路の描画行への配線）。"""
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


TERR, DRAW = fn("mzTerritory"), fn("drawMzTerritory")
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def terr(*args):
    js = TERR + "\nconsole.log(JSON.stringify([" + ",".join("mzTerritory(%s)" % a for a in args) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


ZERO = {"r": 0, "a": 0}


class Territory(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzTerritory("), 1)
        self.assertEqual(PIXEL.count("function drawMzTerritory("), 1)

    def test_invalid_zero(self):
        self.assertEqual(terr("0", "-1", "-5.5", "'10'", "NaN", "Infinity", "-Infinity", "null", "undefined", "0.5"), [ZERO] * 10)

    def test_tiers(self):
        r = terr("1", "9", "10", "29", "30", "79", "80")
        self.assertEqual([x["r"] for x in r], [1.15, 1.15, 1.45, 1.45, 1.75, 1.75, 2.05])
        self.assertEqual([x["a"] for x in r], [0.16, 0.16, 0.22, 0.22, 0.28, 0.28, 0.34])

    def test_cap(self):
        self.assertEqual(terr("80", "500", "100000"), [{"r": 2.05, "a": 0.34}] * 3)

    def test_positive_decimal_floors(self):
        r = terr("1.9", "9.99", "10.5")
        self.assertEqual([x["r"] for x in r], [1.15, 1.15, 1.45])


class Draw(unittest.TestCase):
    def test_guards_and_gradient(self):
        self.assertIn("if (!mzTrail.size) return;", DRAW)
        self.assertIn("mzTerritory(mzTrail.size)", DRAW)
        self.assertIn("if (!t.r) return;", DRAW)
        self.assertIn("createRadialGradient", DRAW)
        self.assertIn("'255,214,102'", DRAW)
        self.assertIn("mzZoneTint(ar).rgb", DRAW)

    def test_read_only(self):
        body = TERR + DRAW
        for w in ("fillText", "G.", "floatText"):
            self.assertNotIn(w, body)
        self.assertIsNone(re.search(r"\b(?:mzTrail|t)\.\w+\s*[-+*/]?=(?!=)", body))

    def test_culling_margin_covers_radius(self):
        # 画面端で円が欠けないよう、対象範囲の余白は半径以上に取る（Codex指摘の修正）
        self.assertIn("Math.ceil(t.r)", DRAW)

    def test_save_restore_paired(self):
        self.assertEqual(DRAW.count("ctx.save()"), 1)
        self.assertEqual(DRAW.count("ctx.restore()"), 1)


class Wire(unittest.TestCase):
    def test_call_once_before_trail(self):
        row = next(l for l in PIXEL.splitlines() if "drawMzTrail(tx0" in l and "mazeOn()" in l)
        self.assertEqual(row.count("drawMzTerritory(tx0, ty0, tx1, ty1, ox, oy, T)"), 1)
        self.assertEqual(PIXEL.count("drawMzTerritory(tx0, ty0, tx1, ty1, ox, oy, T);"), 1)
        self.assertLess(row.index("drawMzTerritory("), row.index("drawMzTrail("))
        self.assertIn("drawMzTerritory(tx0, ty0, tx1, ty1, ox, oy, T); drawMzTrail(", row)


class Scope(unittest.TestCase):
    def test_files_allowed(self):
        out = git("diff", "--name-only", "origin/main").split() + git("ls-files", "--others", "--exclude-standard").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") or f.startswith("tests/"), f)

    def test_no_banned_words(self):
        text = "\n".join(ADDED)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, text)
