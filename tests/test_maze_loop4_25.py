import json, os, re, subprocess, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def node(expr):
    code = "global.window=global;require('./nishio-go/rollsync.js');const R=window.nishioRollSync;console.log(JSON.stringify(" + expr + "))"
    out = subprocess.run(["node", "-e", code], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


class ShadowStretch(unittest.TestCase):
    def test_bounds(self):
        r = node("[R.shadowStretch(0),R.shadowStretch(1.5),R.shadowStretch(7.5),R.shadowStretch(99),R.shadowStretch(3),R.shadowStretch(4)]")
        self.assertEqual(r[0], 1)
        self.assertEqual(r[1], 1)
        self.assertAlmostEqual(r[2], 1.15)
        self.assertAlmostEqual(r[3], 1.15)
        self.assertTrue(1 < r[4] < r[5] < 1.15)

    def test_invalid(self):
        self.assertEqual(node("[R.shadowStretch(NaN),R.shadowStretch(null),R.shadowStretch('a'),R.shadowStretch(Infinity),R.shadowStretch()]"), [1, 1, 1, 1, 1])


class FpsStep(unittest.TestCase):
    def test_fast(self):
        r = node("(()=>{let s=null;for(let i=0;i<120;i++)s=R.fpsStep(s,16.7);return s})()")
        self.assertTrue(55 <= r["fps"] <= 65)
        self.assertFalse(r["slow"])

    def test_slow(self):
        r = node("(()=>{let s=null;for(let i=0;i<120;i++)s=R.fpsStep(s,33);return s})()")
        self.assertGreaterEqual(r["n"], 90)
        self.assertTrue(r["slow"])

    def test_not_judged_early(self):
        self.assertFalse(node("(()=>{let s=null;for(let i=0;i<50;i++)s=R.fpsStep(s,33);return s})()")["slow"])

    def test_hysteresis(self):
        # 落とした後は 48fps を超えるまで戻さない（境界近くで出入りを繰り返さない）
        r = node("(()=>{let s=null;for(let i=0;i<120;i++)s=R.fpsStep(s,33);const slow1=s.slow;for(let i=0;i<200;i++)s=R.fpsStep(s,22);const mid=s.slow;for(let i=0;i<200;i++)s=R.fpsStep(s,16.7);return [slow1,mid,s.slow,R.FPS_RECOVER]})()")
        self.assertTrue(r[0])
        self.assertTrue(r[1])
        self.assertFalse(r[2])
        self.assertEqual(r[3], 48)

    def test_invalid_dt_and_immutable(self):
        r = node("(()=>{const a={ema:50,n:100};const b=R.fpsStep(a,0),c=R.fpsStep(a,NaN),d=R.fpsStep(a,1000),e=R.fpsStep(a,16);return [a,b,c,d,e,R.fpsStep(undefined,'x')]})()")
        self.assertEqual(r[0], {"ema": 50, "n": 100})
        for x in r[1:4]:
            self.assertEqual((x["ema"], x["n"]), (50, 100))
        self.assertEqual(r[4]["n"], 101)
        self.assertEqual(r[5]["n"], 0)


class PixelWiring(unittest.TestCase):
    def setUp(self):
        self.src = read("nishio-go/pixel.js")

    def test_unlock(self):
        self.assertRegex(self.src, r"const unlock = \(\) => \{[^\n]*sfxCtx\(\)")
        self.assertIn("addEventListener('pointerdown', unlock", self.src)
        self.assertIn("addEventListener('keydown', unlock", self.src)

    def test_shadow(self):
        self.assertIn("RSs.shadowStretch(roll.v)", self.src)
        self.assertIn("(shw / 2) * st, (2 * u) / Math.sqrt(st), rot", self.src)
        self.assertIn("st > 1.02", self.src)  # 低速では影を回さない（Codex指摘）

    def test_fps(self):
        self.assertIn("RSf.fpsStep(fpsMeter", self.src)
        self.assertIn("!fpsMeter.slow && riceBall.cv", self.src)
        self.assertIn("!fpsMeter.slow && rollOn && rp.x !== null) drawSpeedLines", self.src)

    def test_getter(self):
        self.assertIn("fps: fpsMeter.fps", self.src)
        self.assertIn("shadow: RSg && RSg.shadowStretch", self.src)


class NoBannedWords(unittest.TestCase):
    def test_diff(self):
        banned = [chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + "20%"]
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, capture_output=True, text=True).stdout
        for l in d.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                for b in banned:
                    self.assertNotIn(b, l)


if __name__ == "__main__":
    unittest.main()
