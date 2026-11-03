"""第3弾サイクル57：道しるべの点が「ルートの矢印（シェブロン）の流れ」になる。"""
import json
import math
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


HINT = func_body("function drawMzHint(")
SECOND = HINT[HINT.index("if (now >= mzRt.showUntil) return;"):]
HELP = HINT[:HINT.index("if (now >= mzRt.showUntil) return;")]
ADDED = [l[1:] for l in git("diff", "-U0", "origin/main", "--", "nishio-go/pixel.js").splitlines() if l.startswith("+") and not l.startswith("+++") and "!G.demo" not in l]


class Angle(unittest.TestCase):
    def test_defined_once(self):
        self.assertEqual(PIXEL.count("function mzRouteChevAngle("), 1)

    def test_values(self):
        i = PIXEL.index("function mzRouteChevAngle(")
        fn = PIXEL[i:PIXEL.index("\n", i)]
        js = fn + "\nconsole.log(JSON.stringify([[1,0],[0,1],[-1,0],[0,-1],[0,0],['a',1],[null,undefined],[NaN,1]].map(a=>mzRouteChevAngle(...a))));"
        r = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
        for got, want in zip(r, [0, math.pi / 2, math.pi, -math.pi / 2, 0, 0, 0, 0]):
            self.assertAlmostEqual(got, want)


class Draw(unittest.TestCase):
    def test_chevron(self):
        self.assertIn("mzRouteChevAngle(", SECOND)
        self.assertIn("ctx.rotate(", SECOND)
        self.assertIn("ctx.save()", SECOND)
        self.assertIn("#ffd54f", SECOND)
        self.assertIn("pts = mzRt.path.slice(1, 9)", SECOND)
        self.assertNotIn("ctx.arc(", SECOND)
        self.assertNotIn("mzHelp.dots", SECOND)

    def test_help_unchanged(self):
        self.assertIn("mzHelpOn()", HELP)
        self.assertIn("#7fe0ff", HELP)
        self.assertIn("Math.floor(now / 120) % 8", SECOND)

    def test_outgoing_and_real_end(self):
        # 続きがある点は次の次のマスへの向き、終点扱いは本当の最終マスのときだけ
        self.assertIn("P[i + 1]", SECOND)
        self.assertIn("end = i === P.length - 1", SECOND)
        # 1つだけのときも入ってきた向き（path[0]→path[1]）を使う
        self.assertIn("cx - P[i - 1][0]", SECOND)


class Safety(unittest.TestCase):
    def test_no_state_or_text(self):
        for l in ADDED:
            self.assertNotIn("G.", l)
            self.assertNotIn("fillText", l)
            for w in ("ぼく", "だに", "約20%"):
                self.assertNotIn(w, l)

    def test_files_allowed(self):
        files = set(git("diff", "--name-only", "origin/main").split())
        self.assertTrue(all(f.startswith("tests/") or f in ("nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/style.css") for f in files), files)


if __name__ == "__main__":
    unittest.main()
