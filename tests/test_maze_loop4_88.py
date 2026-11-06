"""第4弾サイクル88：歩く人の絵（people.png）を手描きドット絵に作り直す"""
import re
import subprocess
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
IM = Image.open(ROOT / "nishio-go" / "art" / "people.png").convert("RGBA")
CELLS = [IM.crop((i * 16, 0, i * 16 + 16, 16)) for i in range(26)]
NAMES = ["elder", "granny", "man", "woman", "kid", "student", "fisher", "staff", "guide", "monk"]


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def colors(c):
    return {p[:3] for p in c.getdata() if p[3] == 255}


class Loop88(unittest.TestCase):
    def test_sheet(self):
        self.assertEqual(IM.size, (416, 16))
        self.assertLessEqual(len({p[:3] for p in IM.getdata() if p[3]}), 80)

    def test_cells(self):
        for c in CELLS:
            px = list(c.getdata())
            op = [p for p in px if p[3] == 255]
            self.assertGreaterEqual(len(op), len(px) * 0.4)
            self.assertIn((38, 38, 38), {p[:3] for p in op})
        self.assertEqual(len({c.tobytes() for c in CELLS}), 26)

    def test_npc_cloth_colors(self):
        block = PX[PX.index("const NPC_COLORS"):]
        for i, n in enumerate(NAMES):
            m = re.search(n + r":\s*\{[^}]*?c: '(#[0-9a-fA-F]{6})'", block)
            for c in CELLS[i * 2:i * 2 + 2]:
                self.assertIn(rgb(m.group(1)), colors(c), n)

    def test_hero(self):
        down, up = CELLS[20], CELLS[22]
        self.assertIn((242, 194, 48), colors(down))
        self.assertIn((244, 197, 143), colors(down))
        self.assertNotEqual(down.tobytes(), up.tobytes())
        self.assertNotIn((244, 197, 143), colors(up.crop((0, 5, 16, 9))))

    def test_pixel_js(self):
        self.assertIn("nishio-go/art/people.png", PX)
        self.assertNotIn("tools/blender/people.py", PX)

    def test_no_banned_words(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go/pixel.js"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):   # 禁止表現はエスケープ表記
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
