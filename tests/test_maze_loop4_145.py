import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def fn(name):
    i = PIX.index("function " + name + "(")
    j = PIX.index("\n}\n", i)
    return PIX[i:j + 3]


class TestFirstWalkGate(unittest.TestCase):
    def test_firstwalk_defined(self):
        self.assertIn("const firstWalk = () => { try { return !(Number(lsGet('nsg_mzgoals', '0')) >= 3); } catch (e) { return false; } };", PIX)
        self.assertLess(PIX.index("const firstWalk ="), PIX.index("const otomo = {"))

    def test_otomo_gated_nakama_kinds_not(self):
        f = fn("nakamaStep")
        self.assertIn("window.NISHIO_OTOMO && !firstWalk() &&", f)
        self.assertEqual(f.count("firstWalk"), 1)
        self.assertIn("nakamaKinds().length && ambN() < AMB_MAX) {", f)

    def test_deai_gated(self):
        f = fn("deaiStep")
        self.assertIn("window.NISHIO_DEAI && !firstWalk() &&", f)

    def test_otedama_gated_before_catch(self):
        f = fn("otedamaStep")
        i = f.index("if (firstWalk()) return;")
        self.assertGreater(i, f.index("if (!o.cur) {"))
        self.assertLess(i, f.index("if (!up ||"))
        self.assertLess(i, f.index("o.next = now;"))
        self.assertLess(i, f.index("// キャッチ"))

    def test_critter(self):
        f = fn("critterStep")
        self.assertIn("critterS.steps >= CRITTER_SURE || !!(G.critterFirst && G.critterFirst());", f)
        self.assertIn("const soon = !critterS.metNow", f)
        self.assertIn("const earlyOnly = critterS.steps < CRITTER_SURE && (soon || sure) && firstWalk();", f)
        self.assertIn("if (earlyOnly && (critterS.steps < 25 || Math.random() >= 1 / 40)) return;", f)
        self.assertLess(f.index("const soon"), f.index("const earlyOnly"))

    def test_kept_untouched(self):
        for n in ("suzumeStep", "nekoStep", "gochisoStep"):
            self.assertNotIn("firstWalk", fn(n), n)

    def test_physics_unchanged(self):
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")

    def test_no_forbidden_words(self):
        for line in PIX.splitlines():
            if "firstWalk" in line:
                for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
                    self.assertNotIn(w, line)


if __name__ == "__main__":
    unittest.main()
