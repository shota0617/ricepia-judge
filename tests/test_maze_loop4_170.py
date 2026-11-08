"""サイクル170（差14）: 芽は420マスの先も育つ。GROW_TH 9件、段階8=左の花、段階9=金の実2つ。"""
import re, subprocess, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def thresholds():
    return [int(x) for x in re.search(r"const GROW_TH = \[([\d, ]+)\];", PIX).group(1).split(",")]


class Cycle170(unittest.TestCase):
    def test_thresholds(self):
        th = thresholds()
        self.assertEqual(th, [15, 40, 80, 140, 210, 300, 420, 570, 760, 1000, 1300, 1700, 2200, 2800, 3600, 4600, 5900, 7600, 9800])
        gaps = [th[0]] + [b - a for a, b in zip(th, th[1:])]
        self.assertEqual(gaps, sorted(gaps))

    def test_stage_boundaries_in_node(self):
        code = (re.search(r"const GROW_TH = .*?;", PIX).group(0)
                + re.search(r"function growStageFor\(d\) \{.*?\n", PIX).group(0)
                + "console.log([419,420,569,570,759,760,1000000].map(growStageFor).join());")
        out = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, "6,7,7,8,8,9,19")

    def test_draw_code(self):
        self.assertIn("if (st >= 8) { const lx0 = x0 - 4 * q;", PIX)
        self.assertIn("ctx.fillRect(x0 - 3 * q, y0 - sh * q, 2 * q, q); ctx.fillRect(x0 - 4 * q, y0 - sh * q, q, q);", PIX)
        self.assertIn("if (st >= 9) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - 3 * q, y0 - (sh + 5) * q, 2 * q, 2 * q); }", PIX)
        self.assertIn("const sh = 2 + Math.min(st, 4);", PIX)

    def test_scope_and_words(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        for f in out:
            self.assertTrue(f == "nishio-go/pixel.js" or f.startswith("tests/"), f)
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT, capture_output=True, text=True).stdout
        for l in diff.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
                    self.assertNotIn(w, l)


if __name__ == "__main__":
    unittest.main()
