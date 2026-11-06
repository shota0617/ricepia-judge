import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
FN = PIX[PIX.index("function critterStep(x, y) {"):]
FN = FN[:FN.index("\n}\n") + 3]


class TestSoonForReturning(unittest.TestCase):
    def test_constants(self):
        self.assertIn("CRITTER_SOON_STEPS = 5, CRITTER_SOON_MS = 60000;", PIX)

    def test_soon_only_first_minute_once(self):
        self.assertIn("const soon = !critterS.metNow && critterS.steps >= CRITTER_SOON_STEPS && performance.now() < CRITTER_SOON_MS;", FN)
        self.assertLess(FN.index("critterS.metNow = true;"), FN.index("const m = G.meetCritter(where);"))
        self.assertLess(FN.index("const soon"), FN.index("critterS.metNow = true;"))

    def test_waits_for_open_map(self):
        self.assertIn("if ((sure || soon) && (mapCovered() || sightBusy())) return;", FN)

    def test_later_chance_unchanged(self):
        self.assertIn("(critterS.steps < 25 || Math.random() >= 1 / 40)", FN)
        self.assertIn("ROLL_MAX = 4.2", PIX)


if __name__ == "__main__":
    unittest.main()
