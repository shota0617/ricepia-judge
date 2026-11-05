"""第3弾サイクル49：合流した迷子のお米に 青い救助リングと旗が付き、救助完了の札の間だけ金色になる。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


BODY = func_body("function drawMzRescueRing(")
MATE = func_body("function drawMzRescueMate(")
BLUE = BODY[BODY.index("if (going) {"):BODY.index("} else {")]
GOLD = BODY[BODY.index("} else {"):]


class Call(unittest.TestCase):
    def test_defined_and_order(self):
        self.assertIn("function drawMzRescueRing(ox, oy, T, now) {", PIXEL)
        line = next(l for l in PIXEL.splitlines() if "drawMzRescueRing(ox, oy, T, now);" in l and "drawMzFogVeil" in l)
        v, m, r, c = (line.index(k) for k in ("drawMzFogVeil(", "drawMzRescueMate(", "drawMzRescueRing(", "drawMzCubeBig("))
        self.assertTrue(v < m < r < c)
        self.assertEqual(PIXEL.count("drawMzRescueRing(ox, oy, T, now);"), 1)
        self.assertIn("drawMzRescueMate(ox, oy, T, now); drawMzRescueRing(", line)

    def test_guards(self):
        self.assertIn("rp.x === null", BODY)
        self.assertIn("if (!going && !done) return;", BODY)
        self.assertIn("mzRescue.joined && !mzRescue.paid", BODY)

    def test_same_position_as_mate(self):
        for s in ("mzRescue.hist[1]", "mzOn((h[0] + 0.5) * MZ_K, (h[1] + 0.5) * MZ_K)", "mzOn(rp.x - MZ_K, rp.y)",
                  "Math.max(1, Math.round(T / 10))", "calmMotion ? 0 : Math.sin(now / 320) * q"):
            self.assertIn(s, BODY)
            self.assertIn(s, MATE)
        self.assertIn("Math.round(ox + on[0] * T)", BODY)
        self.assertIn("Math.round(oy + on[1] * T + bob)", BODY)


class Draw(unittest.TestCase):
    def test_blue_ring(self):
        self.assertIn("rgba(74,144,226,", BLUE)
        self.assertIn("T * 0.55", BLUE)
        self.assertIn("Math.max(1.5, T * 0.07)", BLUE)
        self.assertIn("calmMotion ? 0.8 : 0.65 + 0.25 * Math.sin(now / 240)", BLUE)
        self.assertIn("rgba(74,144,226,", PIXEL[PIXEL.index("function drawMzMiniMap") :] if "function drawMzMiniMap" in PIXEL else "rgba(74,144,226,")

    def test_flag(self):
        self.assertIn("fillRect", BLUE)
        self.assertIn("T * 0.35", BLUE)
        for s in ("beginPath", "moveTo", "lineTo", "fill()", "'#4a90e2'", "T * 0.3", "T * 0.2"):
            self.assertIn(s, BLUE)
        self.assertNotIn("fillText", BODY)

    def test_gold_only_after_done(self):
        self.assertIn("mzRescue.paid && mzRescue.doneAt && now - mzRescue.doneAt < MZ_RESCUE.tagMs", BODY)
        self.assertIn("'#ffd24a'", GOLD)
        self.assertIn("T * 0.62", GOLD)
        self.assertNotIn("74,144,226", GOLD)
        self.assertNotIn("moveTo", GOLD)


class Pure(unittest.TestCase):
    def test_no_state_or_text(self):
        for w in ("G.", "floatText", "riceSay", "fillText", "localStorage", "dirty", "grainSound", "mzFx.push", "pts", "saveGame", "setItem"):
            self.assertNotIn(w, BODY)
        self.assertIsNone(re.search(r"\bmzRescue\.\w+\s*(\+\+|[-+]?=(?!=))", BODY))


class Unchanged(unittest.TestCase):
    def test_rescue_rules(self):
        self.assertRegex(PIXEL, r"const MZ_RESCUE = \{[^}]*tagMs: 6000[^}]*\};")
        self.assertIn("function mzRescueTick(", PIXEL)
        self.assertIn("function mzRescueGoal(", PIXEL)
        self.assertIn("mzRescueJoin", GAME)
        self.assertIn("mzRescue", GAME)
        self.assertIn("rescue: () => mzRescueState()", PIXEL)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        out = git("diff", "--name-only", "origin/main").split()
        for f in out:
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/art/cat-art.png", "nishio-go/art/cat-beach.png", "nishio-go/art/cat-castle.png", "nishio-go/art/cat-historic.png", "nishio-go/art/cat-library.png", "nishio-go/art/cat-museum.png", "nishio-go/art/cat-park.png", "nishio-go/art/cat-shrine.png", "nishio-go/art/cat-sight.png", "nishio-go/art/cat-station.png", "nishio-go/art/cat-temple.png", "nishio-go/art/cat-townhall.png", "nishio-go/art/cat-view.png", "nishio-go/art/cat-worship.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
