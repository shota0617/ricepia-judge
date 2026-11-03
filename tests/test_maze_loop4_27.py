import json, re, subprocess, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")

JS = r"""
const RS = require(%r + '/nishio-go/rollsync.js') || globalThis.nishioRollSync;
const R = globalThis.nishioRollSync;
const A = [0.9, 0.35, 0.2];
function run(dt, v0) {
  let v = v0, t = 0, d = 0, mono = true, steps = [];
  for (let i = 0; i < 100000 && v > 0; i++) {
    const n = R.glideSpeed(v, dt, ...A);
    if (n > v || n < 0) mono = false;
    steps.push(v - n); d += (v + n) / 2 * dt; t += dt; v = n;
  }
  return { t, d, mono, last: steps[steps.length - 1], steps };
}
const out = { r30: run(1/30, 4), r60: run(1/60, 4), r120: run(1/120, 4) };
const lo = R.glideSpeed(0.5, 1/60, ...A), hi = R.glideSpeed(3, 1/60, ...A);
out.lo = 0.5 - lo; out.hi = 3 - hi;
out.consts = [R.GLIDE_SOFT, R.STOP_V, R.GLIDE_H];
out.bad = [NaN, 'x', -3, null, undefined, Infinity].map(s => [R.glideSpeed(s, 1/60, ...A), R.glideSpeed(2, s, 0.9, 0.35, 0.2), R.glideSpeed(2, 1/60, s, s, s)]);
out.bigdt = [R.glideSpeed(2, 5, ...A), R.glideSpeed(0.03, 0.05, ...A)];
for (const k of ['r30','r60','r120']) delete out[k].steps;
console.log(JSON.stringify(out));
"""


def node():
    code = "globalThis.window = globalThis;" + JS % str(ROOT)
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


class GlideTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.o = node()

    def test_basic(self):
        for k in ("r30", "r60", "r120"):
            r = self.o[k]
            self.assertTrue(r["mono"])
            self.assertTrue(0.8 <= r["t"] <= 3.5, r)
            self.assertTrue(0.8 <= r["d"] <= 3.5, r)

    def test_dt_invariance(self):
        a, b, c = self.o["r30"], self.o["r60"], self.o["r120"]
        for x, y in ((a, b), (b, c), (a, c)):
            self.assertLessEqual(abs(x["t"] - y["t"]), 0.1)
            self.assertLessEqual(abs(x["d"] - y["d"]), 0.08)

    def test_smooth(self):
        o = self.o
        self.assertEqual(o["consts"], [0.6, 0.05, 1 / 240])
        self.assertLess(o["lo"], o["hi"])
        self.assertLessEqual(o["r60"]["last"], 0.05 + 0.9 / 60 + 1e-9)

    def test_bad_input(self):
        for row in self.o["bad"]:
            for v in row:
                self.assertGreaterEqual(v, 0)
        self.assertEqual(self.o["bigdt"][0], 2)
        self.assertEqual(self.o["bigdt"][1], 0)

    def test_pixel_wiring(self):
        i = PIXEL.index("function rollStep")
        body = PIXEL[i:i + 9000]
        self.assertRegex(body, r"glideSpeed\(sp, dt, cr, linK, airK\)")
        self.assertIn("ROLL_LIN * gnd.drag * (wxr ? wxr.lin : 1) * feel.lin * (KP.lin || 1)", body)
        self.assertIn("ROLL_AIR * (KP.air || 1)", body)
        self.assertIn("feel.crr", body)
        self.assertIn("nishioRollSync.STOP_V", body)

    def test_no_banned_words(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in (chr(0x307c) + chr(0x304f), chr(0x3060) + chr(0x306b), chr(0x7d04) + "20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
