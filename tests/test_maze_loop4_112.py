"""サイクル112：歩く地図の目印は、訪れたあとも元の色で描く。"""
from pathlib import Path
import unittest


PIX = (Path(__file__).resolve().parents[1] / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
SPOTS = PIX[PIX.index("  const heroGiant ="):PIX.index("  const sp = sightTick(now);")]


class TestLandmarkColors(unittest.TestCase):
    def test_original_color_for_base_and_foreground(self):
        self.assertIn("ctx.drawImage(spr[0], Math.round(sx), Math.round(sy), size, size);", SPOTS)
        self.assertIn("depthArt.push([spr[0], Math.round(sx), Math.round(sy), size, sy + size * 0.72, !!s.shop]);", SPOTS)
        self.assertNotIn("spr[cool ? 1 : 0]", SPOTS)

    def test_large_art_and_hit_area_remain(self):
        self.assertIn("s === heroGiant ? giantOf(s) : bigOf(s)", SPOTS)
        self.assertIn("const spr = giant || spriteOf(s);", SPOTS)
        self.assertIn("const size = bigSpotSize(s, spr, T, giant);", SPOTS)
        self.assertIn("giantHits.push([sx, sy, size, s, giant[0]])", SPOTS)

    def test_shop_landmark_remains(self):
        self.assertIn("rgba(255,213,79,.9)", SPOTS)
        self.assertIn("ctx.arc(rx, ry, rr, 0, Math.PI * 2)", SPOTS)
        self.assertIn("window.nishioShomai.place(sx, sy, size)", SPOTS)
        self.assertIn("drawShopTag(sx + size / 2, sy, dpr, s)", SPOTS)

    def test_face_and_rolling_constants_remain(self):
        self.assertIn("const happyFace = () => !calmMotion", PIX)
        self.assertIn("ROLL_ACC = 7, ROLL_MAX = 4.2", PIX)


if __name__ == "__main__":
    unittest.main()
