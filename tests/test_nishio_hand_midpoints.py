"""通常手の中央が矢印に重なる横画面の配置を、実測の幾何で再現する。

第65周の geometry-analysis.json から rc・box・path・projection・arrow を固定。
元の記録 SHA: 412f33e794142ac7c13395a976d19a7227ef1490b077fe58d4eb4c225ce7235a
製品の配置・当たり判定関数を実行するが、fieldHit は null、DOM は矩形に簡略化。
名所・人物の描画や実ブラウザでの歩行安全まで証明するテストではない。
NISHIO_SOURCE_ROOT で比較対象の製品ソースを指定できる。
"""
import json
import os
import subprocess
import unittest
from pathlib import Path


ROOT = Path(os.environ.get("NISHIO_SOURCE_ROOT", Path(__file__).resolve().parent.parent))
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
# Keep the existing constants and actual Walks/Layout/Spot functions together.
# A new implementation may add local helpers or constants without the test
# requiring their names; both extraction boundaries already exist in the old code.
PLACEMENT = PIX[PIX.index("const DEMO_IDLE_MS ="):PIX.index("const DEMO_LEAD_PX =")]


FIXTURE = r"""
const recorded = {
  rc: {x:422, y:150},
  box: [0,52,844,248,null,[]],
  path: [[599,632],[599,631],[600,631],[600,630]],
  projection: {
    p00:{x:-28346.00000000127,y:-30201.99999999982},
    p10:{x:-28330.00000000127,y:-30201.99999999982},
    p01:{x:-28346.00000000127,y:-30185.99999999982}
  },
  arrow:[448.6447811530441,42.3,520.9033972559723,139.32380234080426],
  tip:{x:469.99999999873035,y:70.00000000017826}
};
const bounds = {left:0,top:52,right:844,bottom:332,width:844,height:280};
const cv = {width:844,height:280,getBoundingClientRect:() => bounds};
const window = {innerWidth:844,innerHeight:390};
const document = {
  elementFromPoint:(x,y) => x >= 0 && x < 844 && y >= 52 && y < 248 ? cv : null,
  querySelectorAll:() => []
};
const sheet = {getBoundingClientRect:() => ({top:recorded.box[3],height:84})};
const $ = id => id === 'sheet' ? sheet : null;
const tiltBtn = null, shopHits = [], mzMap = {arrow:recorded.arrow};
// No fieldHit snapshot exists. Keep this explicitly geometry-only rather than
// pretending that unmeasured landmark/person/alpha tests were reproduced.
const fieldHit = () => null;
const MZ_K = 3, TILE_M = 8;
const p = recorded.projection;
const dx = {x:p.p10.x-p.p00.x,y:p.p10.y-p.p00.y};
const dy = {x:p.p01.x-p.p00.x,y:p.p01.y-p.p00.y};
const tileClient = (x,y) => ({x:p.p00.x+x*dx.x+y*dy.x,y:p.p00.y+x*dx.y+y*dy.y});
// tapDemoSpot derives rc from rp minus half a tile. Reconstruct rp so this
// function receives the captured rc without rounding the measured projection.
const rp = {x:(recorded.rc.x-p.p00.x)/dx.x+.5,y:(recorded.rc.y-p.p00.y)/dy.y+.5};
const camTile = () => ({x:rp.x,y:rp.y});
const toTile = (lat,lng) => ({x:lng,y:lat});
const mazeOn = () => true, mzOpen = () => false;
const G = {spots:[],guide:null,reachOf:() => 40};

// Independent oracle for the existing normal-hand CSS: 38px height, 14px
// pressing translation, and 1..0.92 scale. Check rounded click centers across
// the interpolation rather than asserting a particular search implementation.
function unsafeCenters(q, up) {
  const bad = [], x = Math.round(q.x), anchor = Math.round(q.y);
  for (let phase = 0; phase <= 100; phase++) {
    const f = phase/100, shift = 14*(1-f), scale = 1-.08*f;
    const y = Math.round(up ? anchor-19-shift : anchor+shift+19*scale);
    if (!tapDemoWalks({x,y},0,[])) bad.push({phase,x,y});
  }
  return bad;
}
"""


def run_recorded_scene():
    scene = r"""
const sp = tapDemoSpot(recorded.path,false);
console.log(JSON.stringify({
  reconstructedRice:tileClient(rp.x-.5,rp.y-.5),
  recordedTipSafe:tapDemoWalks(recorded.tip,18,[]),
  recordedUnsafeCenters:unsafeCenters(recorded.tip,false),
  sp,
  unsafeCenters:sp && unsafeCenters(sp.q,sp.up)
}));
"""
    result = subprocess.run(
        ["node", "-e", FIXTURE + PLACEMENT + scene],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode:
        raise AssertionError("Fixture execution failed: " + result.stderr[-1500:])
    return json.loads(result.stdout)



# Placement-priority compatibility only. Geometry and actual walking remain
# separate concerns. Each case gets a fresh VM and the same extracted source.
POLICY_FIXTURE = r"""
const vm = require('node:vm');
const point = (cell, dx, dy) => [100 + (cell * 3 + dx) * 100, 200 + dy * 100];
const row = (cell, dx, dy, margin, hand) => ({
  point: point(cell, dx, dy), margin, hand,
});
const plain = row(3, 1, 1, 18, false);
const extra = row(3, .5, .5, 18, true);
const picked = (r, hand = r.hand) => ({q: {x: r.point[0], y: r.point[1]}, up: false, side: '', hand});
const goal = {q: {x: 700, y: 650}, up: false, side: '', hand: false, goal: true};
const existingLater = row(2, 1, 1, 18, true);

const cases = [
  {
    name: 'existing integer hand in later cell beats earlier-cell extra',
    first: false, rows: [plain, extra, existingLater], expected: picked(existingLater),
    expectedGoalCalls: [],
  },
  {
    name: 'existing 18px plain beats an extra hand that only passes slop zero',
    first: false, rows: [plain, row(3, .5, .5, 0, true)], expected: picked(plain),
    expectedGoalCalls: [],
  },
  {
    name: 'slop-zero plain is unchanged even when a slop-zero extra hand exists',
    first: false, rows: [row(3, 1, 1, 0, false), row(3, .5, .5, 0, true)],
    expected: picked(plain), expectedGoalCalls: [18],
  },
  {
    name: 'extra point with unsafe hand cannot replace original plain',
    first: false, rows: [plain, row(3, .5, .5, 18, false)], expected: picked(plain),
    expectedGoalCalls: [],
  },
  ...[true, 'big'].map(first => ({
    name: `first=${JSON.stringify(first)} ignores extra points`,
    first, rows: [plain, extra], expected: picked(plain), expectedGoalCalls: [],
  })),
  {
    name: 'without route plain, original goal fallback remains',
    first: false, rows: [extra], goal, expected: goal, expectedGoalCalls: [18],
  },
  {
    name: 'without route plain or goal, null remains',
    first: false, rows: [extra], expected: null, expectedGoalCalls: [18, 0],
  },
];

const prelude = String.raw`
const MZ_K = 3, TILE_M = 8;
const rp = {x:-10, y:-10};
const G = {spots:[], guide:null};
const window = {innerWidth:2000};
const document = {querySelectorAll:()=>[]};
const cv = {getBoundingClientRect:()=>({left:0, top:0, right:2000, bottom:2000})};
const tiltBtn = null, $ = () => null;
const camTile = () => ({x:0, y:0}), toTile = (lat,lng) => ({x:lng,y:lat});
const tileClient = (tx,ty) => ({x:100+tx*100, y:200+ty*100});
const goalCalls = [];
const anchor = q => spec.rows.find(r => q.x === r.point[0] && q.y === r.point[1]);
`;

// These three boundary dependencies deliberately model decisions, not terrain.
// Every listed anchor fits; margin=18 passes both slops, margin=0 only zero.
// Its existing 20px test passes exactly when hand=true. Both original and
// added branches must use the same dependencies. Real geometry has its own test.
const boundaries = String.raw`
function tapDemoLayout(q, first, rc, box, upOk) {
  const r = anchor(q);
  if (!r || (upOk && (!r.hand || !upOk(false)))) return null;
  return {up:false, side:''};
}
function tapDemoWalks(q, slop, near) {
  const r = anchor(q);
  if (r) return r.margin >= slop;
  return slop === 0 && spec.rows.some(r => r.hand && q.x === r.point[0] && q.y === r.point[1]+20);
}
function tapDemoGoalSpot(slop, first, rc, box, near) {
  goalCalls.push(slop);
  return spec.goal ? {...spec.goal, q:{...spec.goal.q}} : null;
}
JSON.stringify({
  selected:tapDemoSpot([[0,0],[1,0],[2,0],[3,0]],spec.first),
  goalCalls
});
`;


const placement = require('node:fs').readFileSync(0,'utf8');
const results = cases.map(spec => {
  const actual = JSON.parse(vm.runInNewContext(prelude + placement + boundaries, {spec}, {timeout:1000}));
  return {name:spec.name, expected:spec.expected, expectedGoalCalls:spec.expectedGoalCalls, ...actual};
});
console.log(JSON.stringify(results));
"""


def run_policy_cases():
    result = subprocess.run(
        ["node", "-e", POLICY_FIXTURE], input=PLACEMENT,
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode:
        raise AssertionError("Policy fixture execution failed: " + result.stderr[-1500:])
    return json.loads(result.stdout)


class HandMidpointPlacement(unittest.TestCase):
    def test_recorded_landscape_guide_uses_a_safe_moving_center(self):
        out = run_recorded_scene()
        self.assertEqual(out["reconstructedRice"], {"x": 422, "y": 150})
        self.assertTrue(out["recordedTipSafe"], "The captured plain tip must remain valid")
        self.assertTrue(out["recordedUnsafeCenters"], "The fixture must retain the observed overlap")
        self.assertIsNotNone(out["sp"], "Avoiding the arrow must not remove the guide")
        self.assertEqual(
            out["unsafeCenters"], [],
            "Selected moving hand center enters the arrow; a safe route placement must be preferred",
        )
        self.assertTrue(out["sp"]["hand"], "The selected ordinary hand must be safe across its animation")

        # Keep compatibility assertions after the recorded regression: the
        # single test still fails on the old source for the observed defect.
        for case in run_policy_cases():
            with self.subTest(policy=case["name"]):
                self.assertEqual(case["selected"], case["expected"])
                self.assertEqual(case["goalCalls"], case["expectedGoalCalls"])


if __name__ == "__main__":
    unittest.main()
