"""第3弾サイクル46：たいまつの 明かりが 視界ぜんたいを 暖かく 照らす。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


class Lit(unittest.TestCase):
    def test_lit_pure(self):
        i = PIXEL.index("function mzTorchLit(")
        b = PIXEL[i:PIXEL.index("\n", i)]
        self.assertIn("mzTorch.held", b)
        for w in ("G.", "floatText", "localStorage", "mzTorch.held =", "++"):
            self.assertNotIn(w, b)

    def test_api(self):
        self.assertIn("torchLit: () => mzTorchLit()", PIXEL)
        self.assertLess(PIXEL.index("torchFlame: () => mzTorchFlameScale()"), PIXEL.index("torchLit: () => mzTorchLit()"))


class Light(unittest.TestCase):
    def setUp(self):
        self.b = func_body("function drawMzTorchLight(")

    def test_gradient_and_color(self):
        self.assertIn("createRadialGradient", self.b)
        self.assertIn("255,170,60", self.b)

    def test_sight_radius(self):
        self.assertIn("sight", self.b)
        self.assertIn("mzTorchBonus()", self.b)
        self.assertIn("sight * MZ_K * T", self.b)

    def test_guards(self):
        for w in ("rec", "rp.x === null", "mzTorchLit(now)", "mzViewClear(now)", "if (!sight) return"):
            self.assertIn(w, self.b)

    def test_flicker_speed(self):
        self.assertIn("Math.sin(now / 90) + Math.sin(now / 53)", self.b)
        self.assertIn("Math.max(0,", self.b)

    def test_no_text(self):
        for w in ("fillText", "riceSay", "floatText", "G.", "mzTorch.held ="):
            self.assertNotIn(w, self.b)


class Order(unittest.TestCase):
    def test_draw_order(self):
        self.assertIn("drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzTorchLight(ox, oy, T, now); drawMzSightRing(ox, oy, T, now);", PIXEL)


class Ring(unittest.TestCase):
    def test_ring_colors(self):
        b = func_body("function drawMzSightRing(")
        self.assertIn("255,246,200", b)
        self.assertIn("now / 700", b)
        self.assertIn("255,170,60", b)
        self.assertIn("mzTorchLit(now)", b)
        self.assertIn("Math.sin(now / 90) + Math.sin(now / 53)", b)
        self.assertIn("R = sight * MZ_K * T", b)
        self.assertIn("S * 0.35", b)

    def test_bonus_unchanged(self):
        self.assertIn("function mzTorchBonus() { return mzTorch.held ? MZ_TORCH.sight : 0; }", PIXEL)
        self.assertNotIn("function mzTorchLeft(", PIXEL)   # 第4弾サイクル81：残り時間は持たない
        self.assertIn("f.sight + bonus : 0", PIXEL)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l)
        self.assertNotIn("fillText", txt)
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        out = git("diff", "--name-only", "origin/main").split()
        self.assertTrue(set(f for f in out if not f.startswith("tests/")) <= {"nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html", "tests/test_maze_loop4_1.py", "tests/test_maze_loop4_3.py", "tests/test_maze_loop4_6.py", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_48.py", "tests/test_maze_loop3_49.py", "tests/test_maze_loop3_50.py", "tests/test_maze_loop3_51.py", "tests/test_maze_loop3_52.py", "tests/test_maze_loop3_53.py", "tests/test_maze_loop3_54.py", "tests/test_maze_loop3_55.py", "tests/test_maze_loop3_56.py", "tests/test_maze_loop3_57.py", "tests/test_maze_loop3_58.py", "tests/test_maze_loop3_59.py", "tests/test_maze_loop3_60.py", "tests/test_maze_loop3_61.py", "tests/test_maze_loop3_62.py", "tests/test_maze_loop3_63.py", "tests/test_maze_loop3_64.py", "tests/test_maze_loop3_65.py", "tests/test_maze_loop3_66.py", "tests/test_maze_loop3_67.py", "tests/test_maze_loop3_68.py", "tests/test_maze_loop3_35.py", "tests/test_maze_fog.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_33.py", "tests/test_maze_loop3_34.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_46.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_12.py", "tests/test_maze_loop3_13.py", "tests/test_maze_loop3_14.py", "tests/test_maze_loop3_15.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_17.py"}, out)


if __name__ == "__main__":
    unittest.main()
