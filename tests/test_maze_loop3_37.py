"""第3弾サイクル37：歩くと地図タイルがはまっていく（Carto）。画面の間だけ・見た目だけ。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class MapTiles(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_constant_and_record(self):
        self.assertIn("const MZ_TILE_N = 8, mzTiles = new Map();", PIXEL)
        t = body("mzTileTick")
        self.assertIn("/ MZ_TILE_N", t)
        self.assertIn("if (!mzTiles.has(k)) mzTiles.set(k, [a, b, performance.now()]);", t)   # 初めて入ったタイルだけ増える

    def test_tick_has_no_side_effects(self):
        t = body("mzTileTick")
        for bad in ("G.", "addPoints", "sound", "Sound", "float", "riceSay", "localStorage", "save"):
            self.assertNotIn(bad, t)

    def test_tick_wiring_at_end(self):
        line = re.search(r"^.*mzCubeTick\(now\); mzTileTick\(\); \} else.*$", PIXEL, re.M)
        self.assertIsNotNone(line)

    def test_draw_order(self):
        line = re.search(r"^\s*if \(mazeOn\(\)\) \{ drawMzFogTint.*$", PIXEL, re.M).group(0)
        p = lambda n: line.index(n + "(")
        self.assertLess(p("drawMzPebs"), p("drawMzTiles"))
        self.assertLess(p("drawMzTiles"), p("drawMzTrail"))
        self.assertLess(p("drawMzTiles"), p("drawMaze"))
        self.assertLess(p("drawMzTiles"), p("drawMzFogVeil"))

    def test_draw_style(self):
        t = body("drawMzTiles")
        self.assertIn("if (!mzTiles.size) return;", t)
        for s in ("fillRect", "setLineDash([g, g])", "strokeRect", "arc(cx, cy, r"):
            self.assertIn(s, t)
        self.assertIn("rgba(255,244,214,.18)", t)
        self.assertIn("globalAlpha = p", t)   # はまった直後はふわっと現れる
        self.assertIn("(now - t0) / 450", t)
        self.assertNotIn("fillText", t)

    def test_reset_both_places(self):
        self.assertRegex(PIXEL, r"mzCubeReset\(\);[^\n]*\n\s*mzTiles\.clear\(\);   // はまった タイルも ゴールごとに")
        self.assertIn("if (!mazeOn() && mzTiles.size) mzTiles.clear();", PIXEL)

    def test_test_hook(self):
        self.assertIn("tiles: () => ({ n: mzTiles.size, size: MZ_TILE_N,", PIXEL)

    def test_no_save_or_text(self):
        i = PIXEL.index("const MZ_TILE_N")
        blk = PIXEL[i:PIXEL.index("// 一度通った 近道（P5）")]
        for bad in ("localStorage", "fillText", "G.", "addPoints"):
            self.assertNotIn(bad, blk)

    def test_forbidden_words(self):
        i = PIXEL.index("const MZ_TILE_N")
        blk = PIXEL[i:PIXEL.index("// 一度通った 近道（P5）")] + Path(__file__).read_text(encoding="utf-8").split("def test_forbidden_words")[0]
        for w in ("ぼ" + "く", "だ" + "に", "約" + "20%"):
            self.assertNotIn(w, blk)


if __name__ == "__main__":
    unittest.main()
