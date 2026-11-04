"""第3弾サイクル20：迷路の手描き探索マップ（ミニマップ）。"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(head):
    i = PIXEL.index(head)
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class MiniMap(unittest.TestCase):
    def test_functions_exist_and_wired(self):
        # サイクル63：描画（drawMzMini）は廃止。記録層だけ残る
        for h in ("function mzMiniTick(", "function mzMiniMarks(", "function mzMiniState("):
            self.assertIn(h, PIXEL)
        self.assertIn("mzMiniTick();", PIXEL)
        self.assertNotIn("drawMzMini", PIXEL)

    def test_tick_has_no_storage(self):
        self.assertNotIn("localStorage", func_body("function mzMiniTick("))
        self.assertIn("Math.hypot", func_body("function mzMiniTick("))

    def test_reset_rules(self):
        self.assertRegex(PIXEL, r"mzMini\.seen\.clear\(\);[^\n]*\n\s*mzTrail\.clear\(\);")
        self.assertRegex(PIXEL, r"!mazeOn\(\) && mzMini\.seen\.size\) mzMini\.seen\.clear\(\)")

    def test_test_hooks(self):
        self.assertIn("mini: () => mzMiniState()", PIXEL)
        st = func_body("function mzMiniState(")
        for k in ("explored", "me:", "goal:"):
            self.assertIn(k, st)

    def test_hidden_cache_not_spoiled(self):
        # かくし宝箱（サイクル14）は3歩以内でのみ光る隠し要素。ミニマップの印も同じ条件のときだけ付ける
        body = func_body("function mzMiniMarks(")
        self.assertIn("mzCache.dist <= MZ_CACHE.show", body)

    def test_no_forbidden_words(self):
        seg = PIXEL[PIXEL.index("// 見えたしるしの記録（表示はサイクル63で廃止"):PIXEL.index("// びゅんパネル（運営者の声")]
        self.assertNotIn("ぼく", seg)
        self.assertNotRegex(seg, r"抹茶.{0,6}20")


if __name__ == "__main__":
    unittest.main()
