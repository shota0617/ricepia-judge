"""第3弾サイクル34：駅と駅の光のリンク（Ingress Prime）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class StationLink(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_only_with_two_or_more(self):
        t = body("drawMzTrail")
        self.assertIn("i + 1 < stationAll.length", t)

    def test_consecutive_pair_two_layers(self):
        t = body("drawMzTrail")
        self.assertIn("p = stationAll[i], q = stationAll[i + 1]", t)
        self.assertIn("'rgba(' + p[2] + ',.28)'", t)
        self.assertIn("Math.max(3, T * 0.22)", t)
        self.assertIn("'rgba(255,255,255,.85)'", t)
        self.assertIn("Math.max(1.5, T * 0.07)", t)
        self.assertLess(t.index("T * 0.22"), t.index("T * 0.07"))

    def test_link_before_station_marks_after_flowers(self):
        t = body("drawMzTrail")
        self.assertLess(t.index("for (const [X, Y, rgb, scale, full] of flowers)"), t.index("i + 1 < stationAll.length"))
        self.assertLess(t.index("i + 1 < stationAll.length"), t.index("of stations)"))

    def test_station_all_includes_offscreen_before_cull(self):
        t = body("drawMzTrail")
        self.assertIn("stationAll = []", t)
        self.assertLess(t.index("stationAll.push"), t.index("cy > r1) continue"))
        self.assertIn("seq % 10 === 0", t)

    def test_deterministic_no_state_text(self):
        t = body("drawMzTrail")
        for bad in ("Math.random", "Date.now", "G.", "fillText", "floatText", "localStorage"):
            self.assertNotIn(bad, t)

    def test_diff_scope_and_forbidden_words(self):
        names = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, check=True,
                               capture_output=True, text=True).stdout.split()
        for n in names:
            self.assertTrue(n.startswith("nishio-go/") or n == "nishio-go.html" or n.startswith("tests/"), n)
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/", "nishio-go.html"], cwd=ROOT,
                           check=True, capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for bad in ("ぼく", "だに", "約20%"):
            self.assertNotIn(bad, added)


if __name__ == "__main__":
    unittest.main()
