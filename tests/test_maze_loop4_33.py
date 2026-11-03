import json, subprocess, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIXEL = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")

JS = r"""
require(%r + '/nishio-go/rollsync.js');
const R = globalThis.nishioRollSync;
const out = {};
const base = ['a', 'b'];
out.add = R.idleNoteFail(base, 'c');
out.dup = R.idleNoteFail(base, 'a');
out.baseKept = base;
let big = [];
for (let i = 0; i < 30; i++) big = R.idleNoteFail(big, 'k' + i);
out.cap = big;
out.badFail = [R.idleNoteFail(null, 'x'), R.idleNoteFail(undefined, 3), R.idleNoteFail('s', 'x'), R.idleNoteFail([1, 'a'], {}), R.idleNoteFail()];
out.excl = R.idleExclude(['a', 'b'], ['b', 'c', 'a', 'd']);
out.exclMixed = R.idleExclude(['a', 1, null, 'a'], [{}, 'z', 2]);
out.exclBad = [R.idleExclude(), R.idleExclude('x', 5), R.idleExclude(null, ['q'])];
out.failed = [R.idleFailed(['a'], 'a'), R.idleFailed(['a'], 'b'), R.idleFailed(null, 'a'), R.idleFailed()];
const spots = [{ x: 9, y: 0, key: 's:1' }, { x: 9, y: 9, key: 's:2' }, { x: 0, y: 9, key: 's:3' }];
function tour(spots, wall) {
  // pixel.js と同じ規則: 一巡で skip だけ解放・fails は残す・届かない名所は 4秒で fails へ入れ その場で次へ
  let x = 0, y = 0, vx = 0, vy = 0, skip = [], fails = [], arrivals = 0, dist = 0, restarts = 0, tries = {}, seq = [], stuck = 0;
  let anchor = null, lastKey = '';
  const dt = 1 / 60;
  for (let i = 0; i < 7200; i++) {
    const ex = R.idleExclude(skip, fails);
    let tg = R.nextIdleTarget(x, y, null, spots, ex);
    if (!tg) {
      if (skip.length) { skip = []; restarts++; tg = R.nextIdleTarget(x, y, null, spots, R.idleExclude(skip, fails)); }
      if (!tg) { vx *= 0.99; vy *= 0.99; continue; }
    }
    const f = R.idleForce(x, y, tg.x, tg.y, vx, vy);
    if (f.arrived) { skip.push(tg.key); arrivals++; seq.push(tg.key); continue; }
    if (tg.key !== lastKey) { tries[tg.key] = (tries[tg.key] || 0) + 1; lastKey = tg.key; anchor = { x, y, i }; }
    else if (i - anchor.i > 240) {
      if (Math.hypot(x - anchor.x, y - anchor.y) < 0.5) { fails = R.idleNoteFail(fails, tg.key); skip.push(tg.key); anchor = null; lastKey = ''; continue; }
      anchor = { x, y, i };
    }
    vx += f.fx * dt; vy += f.fy * dt;
    const k = 1 - 0.6 * dt; vx *= k; vy *= k;
    let sx = vx * dt, sy = vy * dt;
    if (wall && wall(x + sx, y + sy)) { vx = 0; vy = 0; sx = 0; sy = 0; }
    x += sx; y += sy; dist += Math.hypot(sx, sy);
  }
  return { arrivals, dist, restarts, tries, fails, seq };
}
out.open = tour(spots, null);
// s:2 (9,9) は 壁の むこう: y>=4 へは 入れない。s:3 (0,9) も 同じ壁で届かない
out.walled = tour([{ x: 9, y: 0, key: 's:1' }, { x: 9, y: 9, key: 's:2' }, { x: 0, y: -9, key: 's:3' }], (nx, ny) => ny > 4);
console.log(JSON.stringify(out));
"""


def node():
    r = subprocess.run(["node", "-e", JS % str(ROOT)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


class PureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.o = node()

    def test_note_fail(self):
        o = self.o
        self.assertEqual(o["add"], ["a", "b", "c"])
        self.assertEqual(o["dup"], ["a", "b"])
        self.assertEqual(o["baseKept"], ["a", "b"])
        self.assertEqual(len(o["cap"]), 30)
        self.assertEqual(o["cap"][0], "k0")
        self.assertEqual(o["cap"][-1], "k29")
        self.assertEqual(o["badFail"], [["x"], [], ["x"], ["a"], []])

    def test_exclude_and_failed(self):
        o = self.o
        self.assertEqual(o["excl"], ["a", "b", "c", "d"])
        self.assertEqual(o["exclMixed"], ["a", "z"])
        self.assertEqual(o["exclBad"], [[], [], ["q"]])
        self.assertEqual(o["failed"], [True, False, False, False])

    def test_open_tour_continues(self):
        t = self.o["open"]
        self.assertGreaterEqual(t["arrivals"], 3)
        self.assertGreaterEqual(t["dist"], 20)
        self.assertEqual(t["fails"], [])

    def test_walled_spot_retried_once(self):
        t = self.o["walled"]
        self.assertIn("s:2", t["fails"])
        self.assertEqual(t["tries"]["s:2"], 1)
        self.assertGreaterEqual(t["seq"].count("s:1"), 2)
        self.assertGreaterEqual(t["seq"].count("s:3"), 2)
        self.assertGreaterEqual(t["arrivals"], 1)
        self.assertEqual(t["seq"].count("s:2"), 0)
        self.assertGreaterEqual(t["dist"], 8)


class PixelWiringTest(unittest.TestCase):
    def body(self):
        a = PIXEL.index("function idleRollForce()")
        return PIXEL[a:PIXEL.index("function rollStep(", a)]

    def test_roll_state_and_touch(self):
        self.assertIn("skip: [], fails: [], guideKey: ''", PIXEL)
        line = next(l for l in PIXEL.splitlines() if l.startswith("function idleTouch()"))
        self.assertIn("idleRoll.fails = []", line)

    def test_uses_exclude(self):
        b = self.body()
        self.assertIn("RS.idleExclude", b)
        self.assertIn("RS.nextIdleTarget(rp.x, rp.y, gEff, list, ex)", b)
        self.assertIn("RS.idleTarget(rp.x, rp.y, list, ex)", b)
        self.assertIn("idleRoll.fails.indexOf(gobj.key)", b)

    def test_restart_keeps_fails(self):
        b = self.body()
        line = next(l for l in b.splitlines() if "restarted = true" in l)
        self.assertIn("idleRoll.skip = []", line)
        self.assertNotIn("fails", line)

    def test_unreachable_branch_continues(self):
        b = self.body()
        a = b.index("< 0.5) {")
        br = b[a:b.index("idleRoll.anchor = { key: tg.key, x: rp.x, y: rp.y, t: now };\n    }", a)]
        self.assertIn("idleSkipAdd(tg.key)", br)
        self.assertIn("RS.idleNoteFail", br)
        self.assertIn("tg = null; continue;", br)
        self.assertNotIn("return null", br)
        self.assertEqual(b.count("idleSkipAdd(tg.key)"), 2)


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
