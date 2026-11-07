import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEN = (ROOT / 'tools' / 'blender' / 'giant-gen.py').read_text(encoding='utf-8')

# 運営者の声（2026-11-06）「西尾らしさがない」：街の主な建物の型（病院・学校など）に 西尾らしさを 足す


class GiantNishioTouch(unittest.TestCase):
    def test_town_kinds_get_touch(self):
        for k in ('school', 'hospital', 'police', 'fire', 'post', 'townhall', 'library'):
            self.assertIn(f"'{k}'", re.search(r"TOWN_K = \{([^}]*)\}", GEN).group(1))
        self.assertIn('nishio_touch(rng, k, area)', GEN)

    def test_nishio_motifs(self):
        for f in ('def kawara_bei', 'def chanoki', 'def jokamachi', 'def chochin'):
            self.assertIn(f, GEN)
        self.assertIn("'kawaraG'", GEN)   # 三州瓦
        self.assertIn("'kurokabe'", GEN)  # 黒い 下見板
        self.assertIn("'cha'", GEN)       # 茶の木

    def test_area_from_tiles(self):
        self.assertIn("'giant', 'poi.json'", GEN)
        self.assertIn("'areas.json'", GEN)
        self.assertEqual(re.search(r"NISHIO_AREAS = \{([^}]*)\}", GEN).group(1).count("'"), 10)


if __name__ == '__main__':
    unittest.main()
