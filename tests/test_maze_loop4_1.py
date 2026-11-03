"""第4弾サイクル1：止まらない窓（pxInfo・.medashi が開いても歩ける／ムービーは自動再生しない）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go/style.css").read_text(encoding="utf-8")


def fn(src, name):
    a = src.index("function " + name + "(")
    return src[a:src.index("\n}\n", a) + 3]


def guard(src, name):
    body = fn(src, name)
    return next(l for l in body.splitlines() if "sightBusy()" in l or "mapCovered(" in l and "return tapWalkStop" in l)


class StoppingWindows(unittest.TestCase):
    def test_roll_guard(self):
        g = guard(PIXEL, "rollStep")
        self.assertNotIn("medashiShown", g)
        self.assertNotIn("pxInfo", g)
        self.assertIn("sightBusy()", g)
        self.assertIn("jump-open", g)
        self.assertIn("mapCovered(true, true)", g)

    def test_step_guard(self):
        g = guard(PIXEL, "step")
        self.assertNotIn("medashiShown", g)
        self.assertIn("sightBusy()", g)

    def test_tapwalk_and_mapcovered(self):
        self.assertIn("mapCovered(false, true)", fn(PIXEL, "tapWalkTick"))
        mc = fn(PIXEL, "mapCovered")
        self.assertIn("function mapCovered(soft, free)", mc)
        self.assertIn("free ? '' : '#pxInfo:not([hidden]), '", mc)

    def test_css_pointer_events(self):
        for sel in (r"\.px-info", r"\.medashi"):
            self.assertRegex(CSS, sel + r"\{pointer-events:none;")
        self.assertRegex(CSS, r"\.px-info \.dq\{pointer-events:auto;")
        self.assertRegex(CSS, r"\.md-card\{pointer-events:auto;")

    def test_movie_manual_only(self):
        mc = fn(GAME, "movieCheck")
        self.assertNotIn("movieWhenFree", mc)
        self.assertNotIn("playMovie", mc)
        self.assertNotIn("movieWhenFree", GAME)
        self.assertIn('data-movie="', fn(GAME, "popupHtml") + GAME[GAME.index("data-movie=") - 200:GAME.index("data-movie=") + 50])
        self.assertIn("playMovie(", GAME)

    def test_diff_forbidden_words(self):
        d = subprocess.run(["git", "diff", "-U0", "origin/main", "--", "nishio-go", "nishio-go.html"],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
