"""第4弾サイクル83：開いてすぐ転がれる（歩く地図から開く・区画の同時読みこみ・目印の一覧は後から）"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def block(src, start, end):
    i = src.index(start)
    return src[i:src.index(end, i)]


class Loop83(unittest.TestCase):
    def test_back_player_opens_walk_map(self):
        i = PX.index("let backPlayer")
        b = PX[i:i + 700]
        self.assertIn("store.get('nsg_started')", b)
        self.assertIn("store.get('nsg_mode') === 'demo'", b)
        self.assertIn("worldOn === '1' && !backPlayer", b)
        self.assertNotIn("setItem('nsg_world_on'", b)
        self.assertNotIn("store.set('nsg_world_on'", b)

    def test_pump_parallel_limit(self):
        self.assertIn("const PUMP_PAR = 3;", PX)
        b = block(PX, "async function pump()", "async function overpass(")
        self.assertIn("pumping = true", b)
        self.assertIn("queue.sort(", b)
        self.assertIn("Array.from({ length: PUMP_PAR }", b)
        self.assertIn("if (queue.length) pump();", b)
        lb = block(PX, "async function loadChunk(", "async function pump()")
        self.assertIn("loading \u306e\u307e\u307e\u6b8b\u3055\u306a\u3044", lb)   # outer catch comment (fail-safe)

    def test_chunk_three_stage_order(self):
        b = block(PX, "async function loadChunk(", "async function pump()")
        i1, i2, i3 = b.index("bakedChunk(cx, cy)"), b.index("store.get(PX_KEY + k)"), b.index("overpass(chunkQuery")
        self.assertTrue(i1 < i2 < i3)
        self.assertIn("saveChunk(k, g", b)
        self.assertIn("state: 'fail'", b)
        self.assertEqual(b.count("nbrCache.clear()"), 3)

    def test_lists_fetched_after_load(self):
        self.assertIn("function afterLoad(fn)", PX)
        self.assertIn("requestIdleCallback", PX)
        for u in ("landmarks.json", "art/giant/list.json", "art/pr/list.json", "art/giant/poi.json"):
            self.assertRegex(PX, r"afterLoad\(\(\) => fetch\('nishio-go/" + re.escape(u))
            self.assertEqual(len(re.findall(r"^fetch\('nishio-go/" + re.escape(u), PX, re.M)), 0)

    def test_roll_physics_unchanged(self):
        self.assertIn("const ROLL_ACC = 7, ROLL_MAX = 4.2, ROLL_BOUNCE = 0.25, ROLL_STICK = 0.6;", PX)
        self.assertIn("const ROLL_CRR = 0.9, ROLL_LIN = 0.28, ROLL_AIR = 0.12;", PX)

    def test_no_forbidden_words_added(self):
        diff = subprocess.run(["git", "diff", "HEAD~1", "HEAD", "--", "nishio-go/pixel.js"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = "\n".join(x for x in diff.splitlines() if x.startswith("+") and not x.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
