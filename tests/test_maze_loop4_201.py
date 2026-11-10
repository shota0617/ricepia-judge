"""第4弾サイクル201：米の流れの下地も、特大絵のにじみと同じ固定の揺らぎで手描き水彩らしくする。"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")

STUB = """
const calls = [];
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { if (k === 'fillStyle') calls.push(['fill=', v]); t[k] = v; return true; } });
"""


def fn_src(name):
    i = SRC.index("function %s(" % name)
    j = SRC.index("\n}\n", i) + 3
    return SRC[i:j]


def run_node(body):
    code = fn_src("seimaiLayout") + fn_src("riceJourneyLayout") + fn_src("drawRiceJourney") + body
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


WASH = {"ine": ["rgba(255,224,130,.28)", "rgba(200,225,120,.22)"], "momi": ["rgba(255,236,170,.3)", "rgba(255,214,120,.2)"],
        "genmai": ["rgba(238,210,160,.3)", "rgba(226,190,140,.2)"], "hakumai": ["rgba(255,255,255,.4)", "rgba(220,235,250,.25)"]}


class RiceJourneyWash201(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([riceJourneyLayout(0,0,0), riceJourneyLayout('a',0,10), riceJourneyLayout(0,NaN,10), riceJourneyLayout()]))")
        self.assertEqual(out, [None] * 4)

    def test_wash_geometry_and_colors(self):
        L = run_node("console.log(JSON.stringify(riceJourneyLayout(100,200,400)))")
        for s in L["stages"]:
            r, c = s["r"], WASH[s["kind"]]
            exp = [(0, 0, 1.55, 1.2, c[0]), (0.3, 0.15, 1.2, 1.05, c[1]), (-0.25, -0.2, 1.0, 0.85, c[0])]
            self.assertEqual(len(s["wash"]), 3)
            for w, (dx, dy, rx, ry, f) in zip(s["wash"], exp):
                self.assertAlmostEqual(w["cx"], s["cx"] + r * dx, places=6)
                self.assertAlmostEqual(w["cy"], s["cy"] + r * dy, places=6)
                self.assertAlmostEqual(w["rx"], r * rx, places=6)
                self.assertAlmostEqual(w["ry"], r * ry, places=6)
                self.assertEqual(w["fill"], f)
        self.assertEqual(len(L["stages"]), 4)

    def test_wob(self):
        L = run_node("console.log(JSON.stringify([riceJourneyLayout(0,0,500), riceJourneyLayout(0,0,500)]))")
        self.assertEqual(L[0], L[1])
        for j in range(3):
            seen = set()
            for s in L[0]["stages"]:
                wob = s["wash"][j]["wob"]
                self.assertEqual(len(wob), 12)
                self.assertTrue(all(0.90 <= v <= 1.00 for v in wob))
                seen.add(tuple(wob))
            self.assertEqual(len(seen), 4)

    def test_stub_draw(self):
        out = run_node(STUB + """
drawRiceJourney(0, 0, 400);
const a = JSON.stringify(calls); calls.length = 0;
drawRiceJourney(0, 0, 400);
const b = JSON.stringify(calls);
const cols = calls.filter(c => c[0] === 'fill=').map(c => c[1]);
console.log(JSON.stringify({ same: a === b, q: calls.filter(c => c[0] === 'quadraticCurveTo').length, text: calls.filter(c => c[0] === 'fillText').length, cols }));
""")
        self.assertTrue(out["same"])
        self.assertEqual(out["q"], 148)   # 下地 12枚×12 + 稲の茎3 + ぬかの山1
        self.assertEqual(out["text"], 0)
        for c in sum(WASH.values(), []):
            self.assertIn(c, out["cols"])

    def test_body_clean(self):
        body = fn_src("riceJourneyLayout") + fn_src("drawRiceJourney")
        for bad in ("ぼ" + "く", "だ" + "に", "約2" + "0%", "Math.sin", "Math.cos", "Math.random", "Date.now", "fillText", "setTimeout"):
            self.assertNotIn(bad, body)

    def test_only_expected_files_changed(self):
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        files = {l[3:] for l in out.splitlines()}
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_201.py"})


if __name__ == "__main__":
    unittest.main()
