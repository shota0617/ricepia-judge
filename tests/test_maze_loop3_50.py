"""第3弾サイクル50：生け垣の近道の戸が、柱と梁の「門」の形で大きく描かれる（未通過はクリーム、通過は金）。"""
import re
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


BODY = func_body("function drawMzGates(")


class Call(unittest.TestCase):
    def test_defined_and_order(self):
        self.assertIn("function drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now) {", PIXEL)
        self.assertEqual(PIXEL.count("drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now);"), 1)
        line = next(l for l in PIXEL.splitlines() if "drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now);" in l and "drawMaze(" in l)
        self.assertTrue(line.index("drawMaze(") < line.index("drawMzGates(") < line.index("drawMzPads("))


class Shape(unittest.TestCase):
    def test_center_on_border(self):
        self.assertIn("mzOn((cx + 0.5 + dx * 0.5) * MZ_K, (cy + 0.5 + dy * 0.5) * MZ_K)", BODY)
        self.assertNotIn("0.25, 0.5, 0.75", BODY)
        self.assertNotIn("rgba(255,250,232,.7)", BODY)

    def test_pillars(self):
        self.assertIn("px = dy, py = dx", BODY)
        self.assertIn("T * 0.42", BODY)
        self.assertIn("T * 0.2", BODY)
        self.assertIn("#1a1a1a", BODY)

    def test_beam(self):
        for s in ("beginPath", "moveTo(ax, ay)", "moveTo(bx, by)", "stroke()", "T * 0.14", "ctx.save()", "ctx.restore()"):
            self.assertIn(s, BODY)
        # 梁は柱から内がわへ少しだけで、まん中の開き口を開ける（Codex指摘への対応）
        self.assertIn("lineTo(ax - px * T * 0.22, ay - py * T * 0.22)", BODY)
        self.assertIn("lineTo(bx + px * T * 0.22, by + py * T * 0.22)", BODY)
        self.assertNotIn("lineTo(bx, by); ctx.stroke()", BODY)


class Colors(unittest.TestCase):
    def test_unused_cream(self):
        self.assertIn("'#fff8e6'", BODY)
        self.assertIn("0.55 + 0.3 * pulse", BODY)

    def test_used_gold(self):
        for s in ("'#ffe066'", "'#ffd24a'", "rgba(255,214,102,"):
            self.assertIn(s, BODY)


class Pure(unittest.TestCase):
    def test_no_state_or_text(self):
        for w in ("fillText", "G.", "mzGateUsed.add", "mzGateUsed.delete", "mzGate.set", "mzGate.delete", "floatText", "riceSay"):
            self.assertNotIn(w, BODY)
        self.assertIn("mzGateUsed.has(k)", BODY)
        self.assertIsNone(re.search(r"\bmzGate(Used)?\.(add|set|delete|clear)\(", BODY))


class Unchanged(unittest.TestCase):
    def test_gate_rules(self):
        self.assertIn("MZ_GATE_NEAR = 3", PIXEL)
        self.assertIn("function mzGateTry(", PIXEL)
        self.assertIn("mzGateUsed.add(key)", func_body("function mzGateWalk("))
        self.assertIn("mzGate", func_body("function mzOpen("))

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)


class Diff(unittest.TestCase):
    def test_added_lines_clean(self):
        d = git("diff", "origin/main", "--", "nishio-go/pixel.js")
        txt = "\n".join(l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, txt)

    def test_changed_files(self):
        for f in git("diff", "--name-only", "origin/main").split():
            self.assertTrue(f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go.html") or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
