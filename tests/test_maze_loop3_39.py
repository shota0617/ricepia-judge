"""第3弾サイクル39：宝探しの探知リング（Geocaching）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Signal(unittest.TestCase):
    def test_const(self):
        self.assertIn("const MZ_PULSE = { baseMs: 2400, fastMs: 1000, near: 3, mid: 8, far: 18 };", PIXEL)

    def test_signal_tiers(self):
        t = body("mzPulseSignal")
        self.assertIn("mzCache.cx < 0 || mzCache.done || mzCache.dist < 0", t)
        self.assertIn("d <= MZ_PULSE.near ? 1 : d <= MZ_PULSE.mid ? 0.66 : d <= MZ_PULSE.far ? 0.33 : 0", t)

    def test_signal_pure(self):
        t = body("mzPulseSignal")
        self.assertNotRegex(t, r"mzCache\.\w+\s*=[^=]|Object\.assign|\+\+|--|G\.\w+|gainPoints|\bsave\(|\btrack\(|floatText|fillText|localStorage|Sound")


class Pulse(unittest.TestCase):
    def test_uses_signal(self):
        t = body("drawMzPulse")
        self.assertIn("const sig = mzPulseSignal();", t)
        self.assertIn("Math.round(MZ_PULSE.baseMs - (MZ_PULSE.baseMs - MZ_PULSE.fastMs) * sig)", t)
        self.assertIn("count = sig >= 1 ? 3 : 2", t)
        self.assertIn("((now % period) / period + i / count) % 1", t)
        self.assertIn("Math.round(255 + (190 - 255) * sig)", t)
        self.assertIn("Math.round(246 + (150 - 246) * sig)", t)
        self.assertIn("Math.round(200 + (245 - 200) * sig)", t)
        self.assertIn("rgba(${r},${g},${b},", t)
        self.assertIn("(0.55 + 0.25 * sig) * (1 - phase)", t)
        self.assertIn("S * (0.3 + (2.9 + 0.9 * sig) * phase)", t)

    def test_deterministic_no_fill(self):
        t = body("drawMzPulse")
        self.assertNotIn("Math.random", t)
        self.assertNotIn("Date.now", t)
        self.assertNotIn("fill(", t)

    def test_order_and_guards(self):
        t = body("drawMzPulse")
        self.assertIn("rec ||", t)
        self.assertIn("rp.x === null", t)
        line = next(l for l in PIXEL.splitlines() if "if (mazeOn()) {" in l and "drawMzFogVeil(" in l)
        self.assertLess(line.index("drawMzFogVeil("), line.index("drawMzSightRing("))
        self.assertLess(line.index("drawMzSightRing("), line.index("drawMzPulse(ox, oy, T, now)"))

    def test_no_state_points_text(self):
        t = body("drawMzPulse")
        self.assertNotRegex(t, r"gainPoints|(?<!ctx\.)\bsave\(|\btrack\(|G\.\w+|floatText|fillText|riceSay|localStorage|Sound|mzCache\.\w+\s*=[^=]")
        self.assertIsNone(re.search(r"[ぁ-んァ-ン一-龥]", re.sub(r"//.*", "", t)))


class Diff(unittest.TestCase):
    def test_diff_clean(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotIn("ぼく", added)
        self.assertNotIn("だに", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")

    def test_only_pixel_changed(self):
        names = subprocess.run(["git", "diff", "origin/main", "--name-only"], cwd=ROOT, check=True,
                               capture_output=True, text=True, encoding="utf-8").stdout.split()
        self.assertTrue(set(n for n in names if not n.startswith("tests/") and n not in ("nishio-go.html", "nishio-go/style.css", "nishio-go/game.js", "nishio-go/kometalk.js")) <= {"nishio-go/pixel.js", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/art/cat-art.png", "nishio-go/art/cat-beach.png", "nishio-go/art/cat-castle.png", "nishio-go/art/cat-historic.png", "nishio-go/art/cat-library.png", "nishio-go/art/cat-museum.png", "nishio-go/art/cat-park.png", "nishio-go/art/cat-shrine.png", "nishio-go/art/cat-sight.png", "nishio-go/art/cat-station.png", "nishio-go/art/cat-temple.png", "nishio-go/art/cat-townhall.png", "nishio-go/art/cat-view.png", "nishio-go/art/cat-worship.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js"})   # 後のサイクルでは 吹き出し廃止の 4ファイルや ポストカードの ファイルも 差分に 入る


if __name__ == "__main__":
    unittest.main()
