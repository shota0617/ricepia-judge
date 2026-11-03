"""第3弾サイクル56：未踏の通路の入口が白い三角で光る（歩いた道から未探索へ続く入口）。"""
import json
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


TRAIL = func_body("function drawMzTrail(")
MINI = func_body("function drawMzMini(")
PULSE = func_body("function mzEntrancePulse(")
ENT = TRAIL[TRAIL.index("const ea = "):]
ADDED = [l[1:] for l in git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and not l.startswith("+++") and "//c17" not in l and "!G.demo" not in l]


class Pulse(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzEntrancePulse("), 1)

    def test_values(self):
        js = PULSE + "\n}\nconsole.log(JSON.stringify([null,undefined,'a',NaN,Infinity].map(mzEntrancePulse).concat([0,471.2,1000,5000].map(mzEntrancePulse))));"
        r = json.loads(subprocess.run(["node", "-e", js.replace("\n}\n}\n", "\n}\n")], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(r[:5], [0.8] * 5)
        for v in r[5:]:
            self.assertTrue(0.2 <= v <= 0.9)
        self.assertAlmostEqual(r[5], 0.55)

    def test_pure(self):
        for w in ("G.", "calmMotion", "ctx", "mzTrail"):
            self.assertNotIn(w, PULSE)


class Draw(unittest.TestCase):
    def test_now_passed(self):
        self.assertIn("function drawMzTrail(tx0, ty0, tx1, ty1, ox, oy, T, now)", PIXEL)
        self.assertEqual(PIXEL.count("drawMzTrail(tx0, ty0, tx1, ty1, ox, oy, T, now)"), 2)  # 定義側は function 行、呼び出しは1箇所
        self.assertEqual(len(re.findall(r"[^n] drawMzTrail\(", PIXEL)), 1)

    def test_collect_condition(self):
        self.assertIn("entrances = []", TRAIL)
        self.assertIn("mzOpen(cx, cy, dx, dy) && !mzTrail.has((cx + dx) + ',' + (cy + dy))) entrances.push(", TRAIL)

    def test_edge_middle(self):
        self.assertIn("ox + (cx + 0.5) * S + dx * S / 2, oy + (cy + 0.5) * S + dy * S / 2, dx, dy]", TRAIL)

    def test_triangle(self):
        self.assertIn("tip = [X + dx * T * 0.34, Y + dy * T * 0.34]", ENT)
        self.assertIn("base = [X - dx * T * 0.14, Y - dy * T * 0.14]", ENT)
        self.assertIn("perp = [dy, dx]", ENT)
        self.assertIn("T * 0.24", ENT)

    def test_white_pulse(self):
        self.assertIn("calmMotion ? 0.8 : mzEntrancePulse(now)", ENT)
        self.assertIn("'rgba(255,255,255,' + ea + ')'", ENT)
        self.assertIn("rgba(26,26,26,.35)", ENT)

    def test_linejoin_reset(self):
        self.assertIn("ctx.lineJoin = 'miter';", ENT)
        self.assertNotIn("ctx.save(", ENT)

    def test_after_stations(self):
        self.assertGreater(TRAIL.index("const ea = "), TRAIL.index("for (const [X, Y, rgb] of stations)"))

    def test_edges_unchanged(self):
        self.assertIn("for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!mzTrail.has((cx + dx) + ',' + (cy + dy))) edges.push([ox + cx * S, oy + cy * S, dx, dy,", TRAIL)


class Mini(unittest.TestCase):
    def test_mini_triangle(self):
        self.assertIn("mzOpen(cx, cy, dx, dy) && !mzTrail.has((cx + dx) + ',' + (cy + dy))", MINI)
        self.assertIn("px0 + (0.5 + dx * 0.5) * q - dx * q * 0.45, Y = py0 + (0.5 + dy * 0.5) * q - dy * q * 0.45", MINI)
        self.assertIn("ctx.fillStyle = '#ffffff'", MINI)
        self.assertIn("q * 0.45", MINI)
        self.assertIn("q * 0.4", MINI)

    def test_mini_order(self):
        self.assertGreater(MINI.index("q * 0.45"), MINI.index("if (!mzOpen(cx, cy, 1, 0))"))
        self.assertGreater(MINI.index("q * 0.45"), MINI.index("of mzMini.seen"))  # 入口は しるしの 上（Codex指摘対応）


class Safety(unittest.TestCase):
    def test_no_state_or_text(self):
        for l in ADDED:
            self.assertNotIn("G.", l)
            self.assertNotIn("fillText", l)
            self.assertFalse(re.search(r"\b(mzTrail|rp|mzScale)\s*=[^=]", l))
            for w in ("ぼく", "約20%"):
                self.assertNotIn(w, l)

    def test_files_allowed(self):
        files = set(git("diff", "--name-only", "origin/main").split())
        self.assertTrue(all(f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/meiro.js", "nishio-go.html") for f in files), files)
