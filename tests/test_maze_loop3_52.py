"""第3弾サイクル52：通路の米粒ドットが主人公から波打つ（近くのドットが波のように膨らんで金色に光る）。"""
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


BODY = func_body("function drawMzPebs(")
WAVE = next(l for l in PIXEL.splitlines() if l.startswith("function mzPebWave("))


class Wave(unittest.TestCase):
    def test_defined(self):
        self.assertEqual(PIXEL.count("function mzPebWave(d, now)"), 1)

    def test_range_and_null(self):
        for t in ("d === null", "d > 7", "calmMotion", "Math.max(0, Math.sin(now / 280 - d * 0.9))"):
            self.assertIn(t, WAVE)

    def test_pure(self):
        for w in ("G.", "=  ", "floatText"):
            self.assertNotIn(w, WAVE)


class Draw(unittest.TestCase):
    def test_signature_and_call(self):
        self.assertIn("function drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T, now) {", PIXEL)
        self.assertEqual(PIXEL.count("drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T, now);"), 1)
        self.assertNotIn("drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T);", PIXEL)

    def test_me_once(self):
        self.assertEqual(BODY.count("rp.x / MZ_K"), 1)
        self.assertIn("rp.x === null ? null", BODY)
        self.assertIn("Math.hypot(cx + 0.5 - me[0], cy + 0.5 - me[1])", BODY)

    def test_swell(self):
        self.assertIn("q * (1 + 0.9 * w)", BODY)
        self.assertIn("fillRect(X - qq - 1, Y - qq - 1, qq * 2 + 2, qq * 2 + 2)", BODY)
        self.assertIn("fillRect(X - qq, Y - qq, qq * 2, qq * 2)", BODY)

    def test_gold(self):
        self.assertIn("w > 0.5 ? 'rgba(255,214,102,.95)' : 'rgba(255,250,232,.9)'", BODY)


class Unchanged(unittest.TestCase):
    def test_rules_untouched(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        for f in ("mzPebTick", "mzPebOk", "mzPebStat"):
            self.assertFalse([l for l in d.splitlines() if l[:1] in "+-" and f in l and "mzPebOk(a, cx, cy)" not in l], f)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l and "!G.demo" not in l and "//c82" not in l)
        for w in ("ぼく", "だに", "約20%", "G.", "fillText"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        for f in git("diff", "--name-only", "origin/main").split():
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
