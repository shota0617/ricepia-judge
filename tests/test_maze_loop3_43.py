"""第3弾サイクル43：歩いて貯まるエネルギーを かおりちゃんの オーラと 光粒で 見せる。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(src, head):
    i = src.index(head)
    return src[i:src.index("\n}\n", i)]


class Charge(unittest.TestCase):
    def test_pure_ratio(self):
        body = func_body(PIXEL, "function mzEnergyCharge(")
        self.assertIn("mzEnergy.steps / MZ_ENERGY.need", body)
        self.assertIn("Math.min(1", body)
        self.assertIn("Math.max(0", body)
        self.assertNotRegex(body, r"mzEnergy\.\w+\s*(=[^=]|\+\+|--|\+=)")

    def test_test_port(self):
        self.assertIn("energyCharge: () => mzEnergyCharge()", PIXEL)
        self.assertIn("energy: () => ({ steps: mzEnergy.steps", PIXEL)


class Aura(unittest.TestCase):
    def setUp(self):
        self.body = func_body(PIXEL, "function drawMzEnergyAura(")

    def test_guards(self):
        self.assertRegex(self.body, r"if \(rec \|\| rp\.x === null \|\| rp\.x === undefined\) return")
        self.assertRegex(self.body, r"if \(ratio <= 0\) return")

    def test_formulas(self):
        self.assertIn("MZ_K * T", self.body)
        self.assertIn("S * (0.5 + 0.9 * ratio)", self.body)
        self.assertIn("0.08 + 0.22 * ratio", self.body)
        self.assertIn("Math.round(ratio * 8)", self.body)
        self.assertIn("now / 600 + i * Math.PI * 2 / n", self.body)
        for c in ("#ffe27a", "#9ccc4f", "#ffffff"):
            self.assertIn(c, self.body)
        self.assertIn("Math.max(1.5, T * 0.09)", self.body)

    def test_center_and_save_restore(self):
        self.assertIn("mzOn(rp.x, rp.y)", self.body)
        self.assertEqual(self.body.count("ctx.save()"), self.body.count("ctx.restore()"))
        self.assertEqual(self.body.count("ctx.save()"), 1)

    def test_no_state_points_text(self):
        self.assertNotRegex(self.body, r"mzEnergy\.\w+\s*(=[^=]|\+\+|--|\+=)")
        self.assertNotIn("G.", self.body)
        self.assertNotRegex(self.body, r"fillText|measureText|riceSay|Say\(")


class Order(unittest.TestCase):
    def test_after_veil_right_after_ring(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzEnergyRing(" in l)
        self.assertLess(line.index("drawMzFogVeil("), line.index("drawMzEnergyRing("))
        self.assertIn("drawMzEnergyRing(ox, oy, T, now); drawMzEnergyAura(ox, oy, T, now);", line)
        self.assertEqual(PIXEL.count("drawMzEnergyAura(ox, oy, T, now);"), 1)


class Diff(unittest.TestCase):
    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_no_forbidden_words(self):
        for head in ("function mzEnergyCharge(", "function drawMzEnergyAura("):
            body = func_body(PIXEL, head)
            for w in ("ぼく", "だに", "約20%"):
                self.assertNotIn(w, body)


if __name__ == "__main__":
    unittest.main()
