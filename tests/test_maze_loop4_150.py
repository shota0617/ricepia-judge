"""第4弾サイクル150：類1 転がすほど見た目が育つ（頭の上の芽）＋段階が上がる瞬間だけの小さな手応え"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def fn(src, name):
    i = src.index("function " + name + "(")
    j = src.index("\n}\n", i)
    return src[i:j + 3]


def stage_for(d):
    th = [int(x) for x in re.search(r"const GROW_TH = \[([\d, ]+)\];", PIX).group(1).split(",")]
    return sum(1 for t in th if d >= t)


class TestGrow(unittest.TestCase):
    def test_thresholds(self):
        self.assertIn("const GROW_TH = [15, 40, 80, 140, 210, 300, 420, 570, 760];", PIX)  # サイクル158（差2）で拡張
        self.assertIn("function growStageFor(d)", PIX)
        for d, s in [(0, 0), (14, 0), (15, 1), (39, 1), (40, 2), (79, 2), (80, 3), (139, 3), (140, 4), (209, 4), (210, 5), (300, 6), (420, 7), (99999, 9)]:  # 210以降はサイクル158
            self.assertEqual(stage_for(d), s, d)

    def test_stage_for_logic_runs_in_node(self):
        code = (re.search(r"const GROW_TH = .*?;", PIX).group(0) + re.search(r"function growStageFor\(d\) \{.*?\n", PIX).group(0)
                + "console.log([0,14,15,40,80,140,1e6].map(growStageFor).join());")
        out = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, "0,0,1,2,3,4,9")  # 1e6 はサイクル170で段階9

    def test_growstep_after_hero_draw(self):
        a = PIX.index("drawRiceBall(hx, by, u, th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, mood, roll.look")
        self.assertGreater(PIX.index("growStep(hx, by, u, now);"), a)
        self.assertEqual(PIX.count("growStep(hx, by, u, now);"), 1)

    def test_no_text(self):
        self.assertNotIn("fillText", fn(PIX, "growStep"))
        self.assertNotIn("fillText", fn(PIX, "growStageFor"))

    def test_sound_on_rise_only_same_pitch(self):
        self.assertIn("if (gs > grow.stage) { grow.stage = gs; grow.popT = performance.now(); dotSound(0); }", PIX)
        self.assertNotRegex(PIX, r"dotSound\([^)]*(grow|gs)")
        self.assertNotIn("grow.stage--", PIX)

    def test_physics_unchanged(self):
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")

    def test_api(self):
        self.assertIn("grow: { stage: () => grow.stage, stageFor: growStageFor, TH: GROW_TH, popAt: () => grow.popT }", PIX)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        pat = "|".join(["ぼ" + "く", "だ" + "に", "約" + "20%"])
        for l in added:
            self.assertIsNone(re.search(pat, l), l)


if __name__ == "__main__":
    unittest.main()
