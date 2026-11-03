"""第3弾サイクル62：地図ピースが 1枚の パノラマに つながる（mzPieceJoin・drawMzPieceArt の joined・棚の 完成時・迷路の ピースの 切り分け絵）。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def fn(name):
    a = PIXEL.index("function " + name + "(")
    return PIXEL[a:PIXEL.index("\n}\n", a) + 3]


JOIN, ART, SHELF, PANO, PIECE = (fn(n) for n in ["mzPieceJoin", "drawMzPieceArt", "drawMzShelf", "drawMzViewPanorama", "drawMzPiece"])
DIFF = git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js")
ADDED = [l[1:] for l in DIFF.splitlines() if l.startswith("+") and not l.startswith("+++")]


def join(*kinds):
    js = JOIN + "\nconsole.log(JSON.stringify([" + ",".join("mzPieceJoin(%s)" % k for k in kinds) + "]));"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


class Join(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzPieceJoin("), 1)

    def test_horizon_same(self):
        self.assertEqual([j["horizon"] for j in join(0, 1, 2)], [3, 3, 3])

    def test_path_connects(self):
        a, b, c = join(0, 1, 2)
        self.assertIsNone(a["pathIn"])
        self.assertIsNone(c["pathOut"])
        self.assertEqual(a["pathOut"], b["pathIn"])
        self.assertEqual(b["pathOut"], c["pathIn"])
        self.assertEqual(a["pathOut"], 6)

    def test_sun_shared(self):
        a, b, c = join(0, 1, 2)
        self.assertEqual(a["sun"], {"dx": 8, "dy": 2, "r": 1.6})
        self.assertEqual(b["sun"], {"dx": 0, "dy": 2, "r": 1.6})
        self.assertEqual(a["sun"]["dy"], b["sun"]["dy"])
        self.assertEqual(a["sun"]["r"], b["sun"]["r"])
        self.assertIsNone(c["sun"])

    def test_invalid_null(self):
        self.assertEqual(join("-1", "3", "1.5", "'0'", "null", "undefined", "NaN"), [None] * 7)


class Art(unittest.TestCase):
    def test_uses_join_and_joined(self):
        self.assertIn("mzPieceJoin(kind)", ART)
        self.assertIn("kind, on, joined)", ART.splitlines()[0])
        self.assertIn("if (joined)", ART)
        self.assertIn("kind === 0", ART)
        self.assertIn("kind === 2", ART)

    def test_shelf_only_done_joined(self):
        self.assertIn("i < mzPiece.got, !!done)", SHELF)
        self.assertEqual(SHELF.count("drawMzPieceArt("), 1)

    def test_panorama_unchanged(self):
        self.assertIn("drawMzPieceArt(x0 + i * (ph + gap), y0, ph, i, true);", PANO)


class Maze(unittest.TestCase):
    def test_piece_draws_cut_art(self):
        self.assertIn("drawMzPieceArt(X - h, Y - h, h * 2, mzPiece.got, true, false)", PIECE)
        self.assertIn("mzPiece.got < MZ_PIECE.n", PIECE)


    def test_river_same_color_all_pieces(self):
        self.assertIn("ctx.fillStyle = '#4aa8e0';", ART)
        self.assertNotIn("'#c9a46a'", ART)

    def test_scope_and_words(self):
        files = git("diff", "--name-only", "origin/main").split()
        self.assertTrue(set(f for f in files if not f.startswith("tests/")) <= {"nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/meiro.js", "nishio-go.html", "tests/test_maze_loop4_1.py", "tests/test_maze_loop4_3.py", "tests/test_maze_loop4_6.py", "tests/test_maze_loop3_62.py", "tests/test_maze_loop3_63.py", "tests/test_maze_loop3_64.py", "tests/test_maze_loop3_65.py", "tests/test_maze_loop3_66.py", "tests/test_maze_loop3_67.py", "tests/test_maze_loop3_68.py", "tests/test_maze_loop3_12.py", "tests/test_maze_loop3_13.py", "tests/test_maze_loop3_14.py", "tests/test_maze_loop3_15.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_17.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_44.py", "tests/test_maze_loop3_45.py", "tests/test_maze_loop3_46.py", "tests/test_maze_loop3_47.py", "tests/test_maze_loop3_48.py"}, files)
        body = "\n".join(ADDED)
        for w in ["ぼく", "だに", "約20%"]:
            self.assertNotIn(w, body)


if __name__ == "__main__":
    unittest.main()
