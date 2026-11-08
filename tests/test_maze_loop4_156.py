"""第4弾サイクル156：類7 ゴールの区切りは短く、絵と動きだけで"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def body(name):
    m = re.search(r"^function %s\(.*?^}\n" % name, PIX, re.S | re.M)
    assert m, name
    return m.group(0)


def spec():
    m = re.search(r"^const MZ_GOAL_FX = (\{.*?\});", PIX, re.M)
    assert m
    out = subprocess.run(["node", "-e", "console.log(JSON.stringify(%s))" % m.group(1)], capture_output=True, text=True, check=True).stdout
    import json
    return json.loads(out)


class TestGoalFx(unittest.TestCase):
    def test_values(self):
        s = spec()
        self.assertEqual(s["n"], 24)
        self.assertEqual(s["bannerSec"], 1.6)
        self.assertEqual(s["happyMs"], 1600)
        self.assertEqual(s["fadeSec"], 0.4)
        self.assertEqual((s["vMin"], s["vVar"], s["up"]), (1.2, 2.4, 2.2))

    def test_shorter_than_before(self):
        s = spec()
        self.assertLess(s["bannerSec"], 4)
        self.assertLessEqual(round(s["lifeMin"] + s["lifeVar"], 6), s["bannerSec"])
        self.assertEqual(round(s["lifeMin"] + s["lifeVar"], 6), 1.1)
        self.assertLessEqual(s["happyMs"], s["bannerSec"] * 1000)

    def test_goalfx_uses_const(self):
        b = body("mzGoalFx")
        for k in ("MZ_GOAL_FX.n", "MZ_GOAL_FX.vMin", "MZ_GOAL_FX.up", "MZ_GOAL_FX.lifeMin"):
            self.assertIn(k, b)
        self.assertNotIn("i < 60", b)
        self.assertNotIn("2 + Math.random() * 6", b)
        self.assertNotIn("1 + Math.random() * 0.8", b)
        for k in ("rice", "leaf", "gold"):
            self.assertIn(k, b)

    def test_draw_uses_const(self):
        b = body("drawMzFx")
        self.assertIn("ba < MZ_GOAL_FX.bannerSec", b)
        self.assertIn("(MZ_GOAL_FX.bannerSec - ba) / MZ_GOAL_FX.fadeSec", b)
        self.assertIn("MZ_GOAL_FX.happyMs", b)
        self.assertNotIn("ba < 4", b)

    def test_help_delay(self):
        m = re.search(r"if \(n === MZ_HELP_N .*", PIX)
        self.assertIn("mzHelp.helpToast = true", m.group(0))
        self.assertNotIn("setTimeout", m.group(0))
        self.assertNotIn("4500", m.group(0))

    def test_spec_exposed(self):
        self.assertIn("goalFxSpec: () => ({ ...MZ_GOAL_FX })", PIX)

    def test_no_banned_words(self):
        added = subprocess.run(["git", "diff", "HEAD", "--", "nishio-go/pixel.js"], capture_output=True, text=True, cwd=ROOT).stdout
        lines = [l for l in added.splitlines() if l.startswith("+") and not l.startswith("+++")]
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertFalse(any(w in l for l in lines), w)


if __name__ == "__main__":
    unittest.main()
