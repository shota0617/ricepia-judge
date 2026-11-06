"""第3弾サイクル41：きょうりゅうの足跡が進む向きを向く（Jurassic World Alive）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def body(name):
    i = PIXEL.index(f"function {name}(")
    return PIXEL[i:PIXEL.index("\n}\n", i)]


class Footprints(unittest.TestCase):
    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/pixel.js")], check=True)

    def test_ang_state(self):
        self.assertIn("trail: [], ang: [], found: false", PIXEL[PIXEL.index("const mzDino = {"):])
        self.assertIn("trail: [], ang: [], found: false", body("mzDinoReset"))
        t = body("mzDinoTick")
        self.assertIn("mzDino.trail.push(c); mzDino.ang.push(mzDinoAngle(null, c, path[i + 1]))", t)

    def test_angle_fn(self):
        t = body("mzDinoAngle")
        self.assertIn("Math.atan2(dy, dx)", t)
        js = t + "\n}\nconsole.log(JSON.stringify([mzDinoAngle([0,0],null,[1,0]), mzDinoAngle([0,0],null,[0,1]), mzDinoAngle([2,2],null,[2,2]), mzDinoAngle(null,null,[1,1]), mzDinoAngle([0,0],[2,0],[2,1])]));"
        out = subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True).stdout
        import json
        v = json.loads(out)
        self.assertAlmostEqual(v[0], 0)
        self.assertAlmostEqual(v[1], 1.5707963, places=5)
        self.assertEqual(v[2:4], [0, 0])
        # 曲がり角: (0,0)→(1,0)→(2,0)→(2,1)→(1,1) の (2,0) の足跡は南（次の 一歩）を向き、弦の南東にはならない
        self.assertAlmostEqual(v[4], 1.5707963, places=5)

    def test_draw_rotated(self):
        d = body("drawMzDino")
        a, b = d.index("ctx.save()"), d.index("ctx.restore()")
        self.assertLess(a, b)
        inner = d[a:b]
        self.assertIn("ctx.translate(", inner)
        self.assertIn("ctx.rotate(", inner)
        self.assertIn("mzDino.ang[i]", inner)
        self.assertIn("Math.PI / 2", inner)
        self.assertIn("ctx.ellipse(", inner)
        self.assertIn("ctx.arc(", inner)

    def test_growing_size(self):
        d = body("drawMzDino")
        self.assertIn("0.85 + 0.35 * (i / Math.max(1, mzDino.trail.length - 1))", d)

    def test_draw_pure(self):
        d = body("drawMzDino")
        for bad in ("G.", "floatText", "dirty =", "mzDino.found =", "mzDino.trail =", "mzDino.ang =", "Math.random", "Date.now"):
            self.assertNotIn(bad, d)

    def test_changed_files_and_words(self):
        names = subprocess.run(["git", "diff", "--name-only", "origin/main...HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.split()
        for n in names:
            # サイクル42（吹き出し廃止）は kometalk.js・game.js・nishio-go.html も変更する
            self.assertTrue(n in ("nishio-go/pixel.js", "nishio-go/kometalk.js", "nishio-go/game.js", "nishio-go/style.css", "nishio-go.html", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/share.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "nishio-go/art/rice-dot.png", "nishio-go/art/poi.png", "nishio-go/art/spots.png", "nishio-go/art/people.png", "nishio-go/art/cat-art.png", "nishio-go/art/cat-beach.png", "nishio-go/art/cat-castle.png", "nishio-go/art/cat-historic.png", "nishio-go/art/cat-library.png", "nishio-go/art/cat-museum.png", "nishio-go/art/cat-park.png", "nishio-go/art/cat-shrine.png", "nishio-go/art/cat-sight.png", "nishio-go/art/cat-station.png", "nishio-go/art/cat-temple.png", "nishio-go/art/cat-townhall.png", "nishio-go/art/cat-view.png", "nishio-go/art/cat-worship.png", "nishio-go/art/giant/nishio-castle.png", "nishio-go/art/giant/okazaki-castle.png", "nishio-go/art/giant/iwase-bunko.png", "nishio-go/art/giant/konrenji.png", "nishio-go/art/giant/nishio-station.png", "nishio-go/art/giant/daibutsu.png", "nishio-go/art/giant/ohirune.png", "nishio-go/art/giant/kurokabe.png", "nishio-go/art/giant/chaen.png", "nishio-go/art/giant/ricepia.png", "nishio-go/art/giant/kondo.png", "nishio-go/dankyu.js", "nishio-go/harvest.js", "nishio-go/hiryoyama.js", "nishio-go/idlecard.js") or re.fullmatch(r"tests/test_maze_(loop3_\d+|loop4_\d+|fog|coverage)\.py", n) or re.fullmatch(r"tests/test_maze_loop3_\d+\.py", n) or re.fullmatch(r"tests/test_(furusato|monosashi|nedoko|okaeri|reward_tip|shirushi|yume)\.py", n), n)
        diff = subprocess.run(["git", "diff", "origin/main...HEAD", "--", "nishio-go/pixel.js"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
        for l in diff.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                for w in ("ぼく", "だに", "約20%"):
                    self.assertNotIn(w, l)


if __name__ == "__main__":
    unittest.main()
