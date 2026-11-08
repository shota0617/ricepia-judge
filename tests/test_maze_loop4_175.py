"""サイクル175（差19）: 芽は5900マスの先も育つ。GROW_TH 19件、段階18=金のつぼみ、段階19=つぼみが開く。"""
import re, subprocess, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def thresholds():
    return [int(x) for x in re.search(r"const GROW_TH = \[([\d, ]+)\];", PIX).group(1).split(",")]


class Cycle175(unittest.TestCase):
    def test_thresholds(self):
        th = thresholds()
        self.assertEqual(th, [15, 40, 80, 140, 210, 300, 420, 570, 760, 1000, 1300, 1700, 2200, 2800, 3600, 4600, 5900, 7600, 9800, 12700, 16500, 21400, 27800])
        gaps = [th[0]] + [b - a for a, b in zip(th, th[1:])]
        self.assertEqual(gaps, [15, 25, 40, 60, 70, 90, 120, 150, 190, 240, 300, 400, 500, 600, 800, 1000, 1300, 1700, 2200, 2900, 3800, 4900, 6400])
        self.assertEqual(gaps, sorted(gaps))

    def test_stage_boundaries_in_node(self):
        code = (re.search(r"const GROW_TH = .*?;", PIX).group(0)
                + re.search(r"function growStageFor\(d\) \{.*?\n", PIX).group(0)
                + "console.log([5899,5900,7599,7600,9799,9800,1000000].map(growStageFor).join());")
        out = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, "16,17,17,18,18,19,23")

    def test_draw_code(self):
        self.assertIn("if (st >= 17) { const fx0 = x0, fy0 = y0 - (sh + 16) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); }", PIX)
        self.assertIn("if (st >= 18) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 19) * q, q, 2 * q); }", PIX)
        self.assertIn("if (st >= 19) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 - q, y0 - (sh + 18) * q, q, q); ctx.fillRect(x0 + q, y0 - (sh + 18) * q, q, q); }", PIX)
        self.assertIn("const sh = 2 + Math.min(st, 4);", PIX)

    def test_scope_and_words(self):
        base = subprocess.run(["git", "merge-base", "HEAD", "origin/main"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        out = subprocess.run(["git", "diff", "--name-only", base], cwd=ROOT, capture_output=True, text=True).stdout.split()
        for f in out:
            self.assertTrue(f == "nishio-go/pixel.js" or f.startswith("tests/"), f)
        diff = subprocess.run(["git", "diff", base, "--", "nishio-go/pixel.js"], cwd=ROOT, capture_output=True, text=True).stdout
        for l in diff.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
                    self.assertNotIn(w, l)


if __name__ == "__main__":
    unittest.main()
