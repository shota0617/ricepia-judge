import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
FN = PIX[PIX.index("function critterStep(x, y) {"):]
FN = FN[:FN.index("\n}\n") + 3]


class TestFirstCritterSoon(unittest.TestCase):
    def test_first_meet_is_three_steps(self):
        self.assertIn("CRITTER_FIRST_STEPS = 3;", PIX)
        self.assertIn("if (!where || critterS.steps < CRITTER_FIRST_STEPS) return;", FN)

    def test_later_meetings_unchanged(self):
        self.assertIn("const CRITTER_SURE = 100,", PIX)
        self.assertIn("if (!sure && !soon && (critterS.steps < 25 || Math.random() >= 1 / 40)) return;", FN)

    def test_first_meet_is_sure(self):
        self.assertIn("const sure = critterS.steps >= CRITTER_SURE || !!(G.critterFirst && G.critterFirst());", FN)
        self.assertLess(FN.index("critterS.steps < CRITTER_FIRST_STEPS"), FN.index("const sure"))

    def test_waits_for_open_map(self):
        self.assertIn("if ((sure || soon) && (mapCovered() || sightBusy())) return;", FN)

    def test_physics_unchanged(self):
        self.assertIn("ROLL_MAX = 4.2", PIX)
        self.assertIn("ROLL_ACC = 7", PIX)


if __name__ == "__main__":
    unittest.main()
