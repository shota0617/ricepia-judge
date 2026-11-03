"""第3弾サイクル44：たいまつの 残り時間が 炎の 大きさで 見える。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(src, head):
    i = src.index(head)
    j = src.find("\n}\n", i)
    k = src.find("\n", i)
    return src[i:k] if src[i:k].rstrip().endswith("}") and j > k + 400 else src[i:j]


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


class Scale(unittest.TestCase):
    def test_pure_ratio(self):
        b = func_body(PIXEL, "function mzTorchFlameScale(")
        self.assertIn("mzTorchLeft(now) / MZ_TORCH.ms", b)
        self.assertIn("Math.min(1", b)
        self.assertIn("Math.max(0", b)

    def test_read_only(self):
        b = func_body(PIXEL, "function mzTorchFlameScale(")
        self.assertNotRegex(b, r"mzTorch\.\w+\s*(=[^=]|\+\+|--|\+=)")
        for w in ("G.", "floatText", "localStorage", "save"):
            self.assertNotIn(w, b)

    def test_test_port(self):
        self.assertIn("torchFlame: () => mzTorchFlameScale()", PIXEL)


class Flame(unittest.TestCase):
    def setUp(self):
        self.b = func_body(PIXEL, "function drawMzTorchFlame(")

    def test_guards_kept(self):
        self.assertIn("if (!mzTorch.until || mzTorch.until <= now || rp.x === null) return;", self.b)

    def test_scale_on_both_flames(self):
        self.assertIn("mzTorchFlameScale(now)", self.b)
        self.assertIn("0.45 + 0.55 * scale", self.b)
        self.assertIn("0.6 + 0.4 * scale", self.b)
        lines = [l for l in self.b.splitlines() if "mzFlamePath(" in l]
        self.assertEqual(len(lines), 2)
        for l, c in zip(lines, ("#e8590c", "#ffd84a")):
            self.assertIn(c, l)
            self.assertIn("* hk", l)
            self.assertIn("* wk", l)

    def test_smoke_condition(self):
        self.assertIn("if (scale <= 0.25) {", self.b)
        self.assertIn("ctx.arc(", self.b)

    def test_blink_kept(self):
        self.assertIn("mzTorch.until - now < 6000", self.b)
        self.assertIn("ctx.globalAlpha = last ? 0.55 : 1;", self.b)
        self.assertIn("#8a5a2b", self.b)


class Order(unittest.TestCase):
    def test_draw_order(self):
        line = next(l for l in PIXEL.splitlines() if "drawMzFogVeil(tx0" in l and "drawMzTorchFlame(" in l)
        self.assertLess(line.index("drawMzFogVeil("), line.index("drawMzTorchFlame("))
        self.assertIn("drawMzTorchFlame(ox, oy, T, now); drawMzBrigadeMates(ox, oy, T, now);", line)


class Sight(unittest.TestCase):
    def test_bonus_unchanged(self):
        self.assertIn("function mzTorchBonus() { return mzTorch.until > performance.now() ? MZ_TORCH.sight : 0; }", PIXEL)


class Diff(unittest.TestCase):
    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        add = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        txt = "\n".join(add)
        self.assertNotIn("fillText", txt)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        out = git("diff", "--name-only", "origin/main").split()
        self.assertTrue(set(f for f in out if not f.startswith("tests/")) <= {"nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go.html", "tests/test_maze_loop4_1.py", "tests/test_maze_loop4_3.py", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_48.py", "tests/test_maze_loop3_49.py", "tests/test_maze_loop3_50.py", "tests/test_maze_loop3_51.py", "tests/test_maze_loop3_52.py", "tests/test_maze_loop3_53.py", "tests/test_maze_loop3_54.py", "tests/test_maze_loop3_55.py", "tests/test_maze_loop3_56.py", "tests/test_maze_loop3_57.py", "tests/test_maze_loop3_58.py", "tests/test_maze_loop3_59.py", "tests/test_maze_loop3_60.py", "tests/test_maze_loop3_61.py", "tests/test_maze_loop3_62.py", "tests/test_maze_loop3_63.py", "tests/test_maze_loop3_65.py", "tests/test_maze_loop3_66.py", "tests/test_maze_loop3_67.py", "tests/test_maze_loop3_68.py", "tests/test_maze_loop3_35.py", "tests/test_maze_fog.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_33.py", "tests/test_maze_loop3_34.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_46.py", "tests/test_maze_loop3_12.py", "tests/test_maze_loop3_13.py", "tests/test_maze_loop3_14.py", "tests/test_maze_loop3_15.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_17.py"}, out)


if __name__ == "__main__":
    unittest.main()
