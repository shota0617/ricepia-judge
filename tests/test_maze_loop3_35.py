"""第3弾サイクル35：30マスごとの大きな拠点リング（モンハンNow）。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class HubRing(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_hub_collected_before_cull(self):
        t = body("drawMzTrail")
        self.assertIn("hubAll = []", t)
        self.assertIn("seq % 30 === 0", t)
        self.assertLess(t.index("hubAll.push"), t.index("cy > r1) continue"))

    def test_order_link_hub_station(self):
        t = body("drawMzTrail")
        self.assertLess(t.index("i + 1 < stationAll.length"), t.index("of hubAll)"))
        self.assertLess(t.index("of hubAll)"), t.index("of stations)"))

    def test_radius_larger_than_station(self):
        t = body("drawMzTrail")
        self.assertIn("sr = Math.max(4, T * 0.38)", t)
        self.assertIn("hr = Math.max(10, T * 1.5, sr * 4)", t)   # 小さい倍率でも駅印の4倍を保つ
        self.assertLess(t.index("const sr ="), t.index("const hr ="))

    def test_three_elements(self):
        t = body("drawMzTrail")
        h = t[t.index("of hubAll)"):t.index("of stations)")]
        for s in ("',.14)'", "',.85)'", "Math.max(3, T * 0.14)", "'rgba(255,255,255,.7)'", "hr * 0.8", "Math.max(1.5, T * 0.06)"):
            self.assertIn(s, h)

    def test_deterministic_no_state_text(self):
        t = body("drawMzTrail")
        for bad in ("Math.random", "Date.now", "G.", "fillText", "floatText", "localStorage", "gainPoints", "save(", "mzHub"):
            self.assertNotIn(bad, t)

    def test_forbidden_words(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, check=True,
                           capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
