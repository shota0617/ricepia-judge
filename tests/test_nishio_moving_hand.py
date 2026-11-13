"""通常の手本は、押す動きの途中の中央も安全な置き方を優先する。

NISHIO_SOURCE_ROOT で比較する作業ツリーを指定できる。既存の配置関数と
当たり判定を実行し、旧版でも存在する返り値で判定する。ブラウザの代用ではない。
"""
import json
import os
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(os.environ.get("NISHIO_SOURCE_ROOT", Path(__file__).resolve().parent.parent))
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def function_source(name):
    start = re.search(r"\bfunction " + re.escape(name) + r"\(", PIX)
    if start is None:
        raise AssertionError("Missing existing function: " + name)
    return PIX[start.start():PIX.index("\n}\n", start.start()) + 2]


def definition(prefix):
    start = PIX.index(prefix)
    return PIX[start:PIX.index("\n", start) + 1]


FIXTURE = r"""
const MZ_K = 3, TILE_M = 8;
const bounds = {left:0, top:52, right:320, bottom:400, width:320, height:348};
const cv = {width:320, getBoundingClientRect:() => bounds};
const window = {innerWidth:320};
const document = {
  elementFromPoint:(x,y) => x >= 0 && x < 320 && y >= 52 && y < 400 ? cv : null,
  querySelectorAll:() => []
};
const $ = () => null, tiltBtn = null, shopHits = [];
const mzMap = {arrow:null}, mzRt = {};
let windows = [];
const inside = (r,x,y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const fieldHit = (x,y) => windows.some(r => inside(r,x,y + bounds.top)) ? {spot:1} : null;
function obstacles(arrow, spots = []) {
  mzMap.arrow = arrow && [arrow[0], arrow[1]-bounds.top, arrow[2], arrow[3]-bounds.top];
  windows = spots;
}
let rp = {x:1.5, y:20.5};
let project = (x,y) => ({x:80 + x*8, y:59 + y*8});
const tileClient = (x,y) => project(x,y);
const camTile = () => ({x:rp.x,y:rp.y}), toTile = (lat,lng) => ({x:lng,y:lat});
const mazeOn = () => true, mzOpen = () => false;
const G = {spots:[], guide:null, reachOf:() => 40};
const box = [0,52,320,400,null]; box.near = [];

// Independent geometry oracle for the unchanged 38px hand CSS keyframes:
// normal origin is its top; inverted origin is its center. Sample the full
// interpolation, then round the rendered center as the observed click does.
function unsafeCenters(q, up) {
  const bad = [], x = Math.round(q.x), anchor = Math.round(q.y);
  for (let phase = 0; phase <= 100; phase++) {
    const f = phase / 100, shift = 14 * (1-f), scale = 1 - .08*f;
    const y = Math.round(up ? anchor - 19 - shift : anchor + shift + 19*scale);
    if (!tapDemoWalks({x,y},0,[])) bad.push({phase,x,y});
  }
  return bad;
}
"""


def run_scene(scene):
    definitions = "".join(definition(prefix) for prefix in (
        "const DEMO_TAP_MS =", "const DEMO_SLOP =", "const DEMO_HAND_TAP =",
        "const DEMO_HAND =", "const DEMO_HAND1 =",
    ))
    functions = "\n".join(function_source(name) for name in (
        "tapDemoWalks", "demoHandClear", "tapDemoLayout", "tapDemoGoalSpot", "tapDemoSpot",
    ))
    result = subprocess.run(
        ["node", "-e", FIXTURE + definitions + functions + scene],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode:
        raise AssertionError("Fixture execution failed: " + result.stderr[-1500:])
    return json.loads(result.stdout)


class MovingHandPlacement(unittest.TestCase):
    def test_recorded_arrow_overlap_is_rejected_while_a_route_point_remains(self):
        """q=(160,67) passes the old20px test but its moving center hits the arrow."""
        out = run_scene(r"""
obstacles([145,94.3,175,130]);
const recorded = {x:160,y:67};
const path = [[0,0],[1,0],[2,0],[3,0],[4,0]];
const recordedChoice = tapDemoLayout(recorded,false,{x:88,y:219},box,
  up => tapDemoWalks({x:160,y:67+(up ? -20 : 20)},0,[]));
const sp = tapDemoSpot(path,false);
console.log(JSON.stringify({
  oldMiddleSafe:tapDemoWalks({x:160,y:87},0,[]),
  recordedCenterUnsafe:unsafeCenters(recorded,false).length > 0,
  recordedChoice, sp, bad:sp && unsafeCenters(sp.q,sp.up)
}));
""")
        self.assertTrue(out["oldMiddleSafe"])
        self.assertTrue(out["recordedCenterUnsafe"])
        self.assertIsNone(out["recordedChoice"], "The observed arrow-overlapping orientation is still preferred")
        self.assertIsNotNone(out["sp"], "Avoiding the arrow must not remove the guide")
        self.assertTrue(out["sp"]["hand"])
        self.assertEqual(out["bad"], [], "Selected hand center crosses the arrow during its animation")
        self.assertNotEqual(out["sp"]["q"], {"x": 160, "y": 67})

    def test_mid_animation_and_rounded_anchor_choose_the_safe_direction(self):
        """A safe20px point and safe endpoints do not prove the intervening clicks safe."""
        cases = [
            ("normal middle", {"x": 160, "y": 200}, {"x": 80, "y": 100},
             [159.5, 226.5, 160.5, 227.5], True),
            ("inverted middle", {"x": 160, "y": 200}, {"x": 80, "y": 300},
             [159.5, 172.5, 160.5, 173.5], False),
            ("rounded anchor", {"x": 159.6, "y": 200.4}, {"x": 80, "y": 100},
             [159.95, 216.95, 160.05, 217.05], True),
        ]
        for name, q, rice, obstacle, expected_up in cases:
            with self.subTest(name=name):
                params = json.dumps({"q": q, "rice": rice, "obstacle": obstacle})
                out = run_scene("const p = " + params + r""";
obstacles(null,[p.obstacle]);
const legacy = up => tapDemoWalks({x:p.q.x,y:p.q.y+(up ? -20 : 20)},0,[]);
const chosen = tapDemoLayout(p.q,false,p.rice,box,legacy);
console.log(JSON.stringify({legacyUp:legacy(true),legacyDown:legacy(false),chosen,
  bad:chosen && unsafeCenters(p.q,chosen.up)}));
""")
                self.assertTrue(out["legacyUp"])
                self.assertTrue(out["legacyDown"])
                self.assertIsNotNone(out["chosen"])
                self.assertIs(out["chosen"]["up"], expected_up)
                self.assertEqual(out["bad"], [])

    def test_plain_fallback_first_hand_and_later_edge_contracts_remain(self):
        """Unsafe centers lower placement preference; they do not delete the last guide."""
        out = run_scene(r"""
project = (x,y) => y === 20 ? {x:80,y:300} : {x:160,y:200};
obstacles(null,[[159.5,172.5,160.5,173.5],[159.5,226.5,160.5,227.5]]);
const fallback = tapDemoSpot([[0,0],[1,0],[2,0],[3,0]],false);

// First-hand placement keeps its existing sampled-clearance contract and
// separate input assistance. This narrow arrow is between those samples.
const q = {x:160,y:250}, rice = {x:80,y:100};
obstacles([159.5,276.5,160.5,277.5]);
const legacy = up => tapDemoWalks({x:q.x,y:q.y+(up ? -20 : 20)},0,[]);
const first = tapDemoLayout(q,true,rice,box,legacy);
const big = tapDemoLayout(q,'big',rice,box,legacy);

// A window at the hand's side is not a center-path obstruction. Existing
// first-big clearance excludes it; ordinary-hand layout remains available.
obstacles(null,[[180,52,188,400]]);
const laterEdge = tapDemoLayout(q,false,rice,box,legacy);
const bigEdge = tapDemoLayout(q,'big',rice,box,legacy);
console.log(JSON.stringify({fallback,first,big,laterEdge,bigEdge}));
""")
        self.assertIsNotNone(out["fallback"])
        self.assertFalse(out["fallback"]["hand"])
        self.assertEqual(out["fallback"]["q"], {"x": 160, "y": 200})
        self.assertIsNotNone(out["first"])
        self.assertIs(out["first"]["up"], False)
        self.assertIsNotNone(out["big"])
        self.assertIs(out["big"]["up"], False)
        self.assertIsNotNone(out["laterEdge"])
        self.assertIs(out["laterEdge"]["up"], False)
        self.assertIsNone(out["bigEdge"])


if __name__ == "__main__":
    unittest.main()
