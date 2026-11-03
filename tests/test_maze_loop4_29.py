import json, re, subprocess, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")

JS = r"""
require(%r + '/nishio-go/rollsync.js');
const R = globalThis.nishioRollSync;
const out = {};
const g = { x: 1, y: 0, key: 'g:a' };
const sp = [{ x: 3, y: 0, key: 's:near' }, { x: 12, y: 0, key: 's:far' }];
out.guideFirst = R.nextIdleTarget(0, 0, g, sp, []);
out.guideSkipped = R.nextIdleTarget(0, 0, g, sp, ['g:a']);
out.guideSkipStr = R.nextIdleTarget(0, 0, g, sp, 'g:a');
out.second = R.nextIdleTarget(0, 0, g, sp, ['g:a', 's:near']);
out.allSkip = R.nextIdleTarget(0, 0, g, sp, ['g:a', 's:near', 's:far']);
out.none = R.nextIdleTarget(0, 0, null, [], []);
out.bad = [
  R.nextIdleTarget(NaN, 0, g, sp, []), R.nextIdleTarget(0, 0, g, 'x', []),
  R.nextIdleTarget(0, 0, { x: 'a' }, [null, { x: NaN, y: 1 }, 3], undefined),
  R.nextIdleTarget(0, 0, undefined, undefined, null), R.nextIdleTarget(),
];
function sim(guide, spots) {
  let x = 0, y = 0, vx = 0, vy = 0, skip = [], arrivals = 0, dist = 0, order = [], nulls = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 3600; i++) {
    const tg = R.nextIdleTarget(x, y, guide, spots, skip);
    if (!tg) { nulls++; vx *= 0.99; vy *= 0.99; continue; }
    const f = R.idleForce(x, y, tg.x, tg.y, vx, vy);
    if (f.arrived) { skip.push(tg.key); arrivals++; order.push(tg.key); continue; }
    vx += f.fx * dt; vy += f.fy * dt;
    const k = 1 - 0.6 * dt; vx *= k; vy *= k;
    const sx = vx * dt, sy = vy * dt; x += sx; y += sy; dist += Math.hypot(sx, sy);
  }
  return { arrivals, dist, order, nulls, vmax: Math.hypot(vx, vy) };
}
out.chain = sim({ x: 0.8, y: 0, key: 'g:a' }, [{ x: 9, y: 0, key: 's:1' }, { x: 9, y: 9, key: 's:2' }, { x: 0, y: 9, key: 's:3' }]);
out.guideOnly = sim({ x: 0.8, y: 0, key: 'g:a' }, []);
function simTour(guide, spots) {
  // pixel.js と同じ接続規則: 目的地の済みは guideKey で別保持、一巡したら skip だけ解放して再開
  let x = 0, y = 0, vx = 0, vy = 0, skip = [], guideKey = '', arrivals = 0, dist = 0, restarts = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 7200; i++) {
    const gEff = (guide && guideKey === guide.key) ? null : guide;
    const tg = R.nextIdleTarget(x, y, gEff, spots, skip);
    if (!tg) {
      if (skip.length) { skip = []; restarts++; continue; }
      vx *= 0.99; vy *= 0.99; continue;
    }
    const f = R.idleForce(x, y, tg.x, tg.y, vx, vy);
    if (f.arrived) { if (tg.guide) guideKey = tg.key; skip.push(tg.key); arrivals++; continue; }
    vx += f.fx * dt; vy += f.fy * dt;
    const k = 1 - 0.6 * dt; vx *= k; vy *= k;
    const sx = vx * dt, sy = vy * dt; x += sx; y += sy; dist += Math.hypot(sx, sy);
  }
  return { arrivals, dist, restarts, guideKey };
}
out.tour = simTour({ x: 0.8, y: 0, key: 'g:a' }, [{ x: 9, y: 0, key: 's:1' }, { x: 9, y: 9, key: 's:2' }, { x: 0, y: 9, key: 's:3' }]);
console.log(JSON.stringify(out));
"""


def node():
    r = subprocess.run(["node", "-e", JS % str(ROOT)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


class NextIdleTargetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.o = node()

    def test_guide_first(self):
        t = self.o["guideFirst"]
        self.assertEqual((t["key"], t["guide"]), ("g:a", True))
        self.assertAlmostEqual(t["dist"], 1)

    def test_spots_after_guide(self):
        o = self.o
        for k in ("guideSkipped", "guideSkipStr"):
            self.assertEqual((o[k]["key"], o[k]["guide"]), ("s:near", False))
        self.assertEqual(o["second"]["key"], "s:far")

    def test_null_and_bad(self):
        self.assertIsNone(self.o["allSkip"])
        self.assertIsNone(self.o["none"])
        b = self.o["bad"]
        self.assertEqual([b[0], b[2], b[3], b[4]], [None] * 4)
        self.assertEqual(b[1]["key"], "g:a")  # 非配列 spots でも ガイドは 返る

    def test_chain_sim(self):
        c = self.o["chain"]
        self.assertEqual(c["order"][0], "g:a")
        self.assertEqual(c["order"][1:], ["s:1", "s:2", "s:3"])
        self.assertGreaterEqual(c["dist"], 20)
        self.assertGreaterEqual(c["arrivals"], 2)
        self.assertEqual(c["nulls"] > 0 and c["arrivals"] == 4, True)

    def test_guide_only_stops(self):
        g = self.o["guideOnly"]
        self.assertEqual(g["arrivals"], 1)
        self.assertGreater(g["nulls"], 0)

    def test_tour_restarts_after_full_round(self):
        t = self.o["tour"]
        self.assertEqual(t["guideKey"], "g:a")
        self.assertGreaterEqual(t["restarts"], 1)
        self.assertGreaterEqual(t["arrivals"], 6)
        self.assertGreaterEqual(t["dist"], 40)


class PixelWiringTest(unittest.TestCase):
    def body(self):
        a = PIXEL.index("function idleRollForce()")
        return PIXEL[a:PIXEL.index("function rollStep(", a)]

    def test_uses_next_idle_target(self):
        b = self.body()
        self.assertIn("RS.nextIdleTarget(", b)
        self.assertIn("RS.idleTarget(", b)  # フォールバック
        self.assertNotRegex(b, r"if \(guide\) \{ idleRoll\.on = false; idleRoll\.last = now")

    def test_guide_skip(self):
        b = self.body()
        self.assertEqual(b.count("idleSkipAdd(tg.key)"), 2)
        self.assertIn("skip.length > 24", b)

    def test_guide_key_and_tour_restart(self):
        b = self.body()
        self.assertIn("guideKey", b)
        self.assertIn("idleRoll.skip = []", b)  # 一巡で名所履歴を解放
        self.assertIn("idleRoll.guideKey = ''", PIXEL)  # 手動入力で目的地優先に戻る


class NoBannedWordsTest(unittest.TestCase):
    def test_added_lines(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"],
                              cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        banned = (chr(0x307C) + chr(0x304F), chr(0x3060) + chr(0x306B), chr(0x7D04) + "20%")
        for w in banned:
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
