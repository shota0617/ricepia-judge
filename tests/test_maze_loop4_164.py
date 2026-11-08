"""第4弾サイクル164：差8 跡の花が時間で育つ（bloomStage）"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RT_PATH = os.path.join(ROOT, "nishio-go", "rolltrail.js")
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def stage(vals):
    script = (
        "const w={};(function(window){" + "" + "})(w);"
        "global.window=undefined;"
        "require(%s);" % json.dumps(RT_PATH) +
        "const RT=globalThis.nishioRollTrail;"
        "console.log(JSON.stringify({c:[RT.BLOOM_STAGE1_MS,RT.BLOOM_STAGE2_MS],r:%s.map(v=>RT.bloomStage(v))}));" % json.dumps(vals).replace("null", "NaN")
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def draw_src():
    i = PIX.index("function drawRollBloom(")
    return PIX[i:PIX.index("\n}\n", i)]


class TestBloomStage(unittest.TestCase):
    def test_boundaries(self):
        d = stage([0, 29999, 30000, 119999, 120000, 10**9, None])
        self.assertEqual(d["c"], [30000, 120000])
        s = [(x["stage"], x["scale"]) for x in d["r"]]
        self.assertEqual(s, [(0, 0.55), (0, 0.55), (1, 1), (1, 1), (2, 1.25), (2, 1.25), (1, 1)])

    def test_monotonic(self):
        d = stage(list(range(0, 400000, 5000)))
        sc = [x["scale"] for x in d["r"]]
        self.assertEqual(sc, sorted(sc))


class TestDraw(unittest.TestCase):
    def test_uses_stage(self):
        s = draw_src()
        self.assertIn("RT.bloomStage(now - p.t)", s)
        self.assertIn("scale: 1", s)

    def test_stage1_values_unchanged(self):
        s = draw_src()
        self.assertIn("T * 0.10 * sc", s)
        self.assertIn("T * 0.08 * sc", s)
        self.assertIn("T * 0.06 * sc", s)
        self.assertIn("st.stage > 0 ? f.petals : 0", s)
        self.assertIn("'255,170,190' : '255,250,240'", s)
        self.assertIn("rgba(240,200,80,", s)
        self.assertIn("RT.bloomPetal(p.n)", s)

    def test_slow_keeps_dot_only(self):
        self.assertIn("if (!fpsMeter.slow) { const f", draw_src())


class TestDiff(unittest.TestCase):
    def test_files_and_words(self):
        try:
            names = subprocess.run(["git", "diff", "--name-only", "main...HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.split()
            wt = subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        except Exception:
            self.skipTest("git unavailable")
        # 本サイクルの触れる範囲（過去サイクルの差分は除く）：作業ツリー側だけ厳密に確認
        ok = {"nishio-go/rolltrail.js", "nishio-go/pixel.js", "tests/test_maze_loop4_164.py"}
        self.assertTrue(set(wt) <= ok, wt)
        diff = subprocess.run(["git", "diff", "HEAD", "--", "nishio-go"], cwd=ROOT, capture_output=True, text=True).stdout
        for l in diff.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                for w in ("ぼく", "だに", "約20%"):
                    self.assertNotIn(w, l)


if __name__ == "__main__":
    unittest.main()
