"""第4弾サイクル185：自店の特大絵の足元に「米の流れ」（稲→もみ→玄米→白米・副産物）を水彩の手描き風で置く。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def fn_src(name):
    i = SRC.index("function %s(" % name)
    j = SRC.index("\n}\n", i) + 3
    return SRC[i:j]


def run_node(body):
    code = fn_src("seimaiLayout") + fn_src("riceJourneyLayout") + fn_src("drawRiceJourney") + body
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


class RiceJourney185(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([riceJourneyLayout(0,0,0), riceJourneyLayout(0,0,-5), riceJourneyLayout('a',0,10), riceJourneyLayout(0,NaN,10), riceJourneyLayout(0,0,Infinity), riceJourneyLayout(), riceJourneyLayout(null,0,1)]))")
        self.assertEqual(out, [None] * 7)

    def test_order_left_to_right(self):
        L = run_node("console.log(JSON.stringify(riceJourneyLayout(100,200,400)))")
        self.assertEqual([s["kind"] for s in L["stages"]], ["ine", "momi", "genmai", "hakumai"])
        xs = [s["cx"] for s in L["stages"]]
        self.assertEqual(xs, sorted(xs))
        self.assertEqual(len(L["arrows"]), 3)
        for i, a in enumerate(L["arrows"]):
            self.assertLess(a["x0"], a["x1"])
            self.assertGreater(a["x0"], xs[i])
            self.assertLess(a["x1"], xs[i + 1])
        self.assertEqual(len(L["piles"]), 3)

    def test_inside_picture_and_no_overlap(self):
        S = run_node("console.log(JSON.stringify([riceJourneyLayout(0,0,500), seimaiLayout(0,0,500)]))")
        L, P = S
        self.assertGreaterEqual(L["x"], 0)
        self.assertLessEqual(L["x"] + L["w"], 500)
        self.assertGreaterEqual(L["y"], 0)
        self.assertLessEqual(L["y"] + L["h"], 500)
        self.assertGreater(L["x"], P["x"] + P["w"])        # 精米の小道具と重ならない
        self.assertLess(L["x"] + L["w"], 500 * 0.84)        # 翔米（右手前0.84）と重ならない
        self.assertAlmostEqual(L["ground"], 500 * 0.72)

    def test_call_site(self):
        self.assertEqual(len(re.findall(r"if \(s\.shop && giant\) drawRiceJourney\(sx, sy, size\);", SRC)), 1)
        k = SRC.index("drawRiceJourney(sx, sy, size);")
        self.assertLess(SRC.rindex("drawShopSeimai(sx, sy, size);", 0, k), k)
        self.assertLess(k, SRC.index("const t = drawShopTag(sx + size / 2, sy, dpr, s);", k))
        self.assertIn("riceJourneyLayout, drawRiceJourney", SRC[SRC.index("window.nishioPixel = {"):][:200])

    def test_stub_draw(self):
        out = run_node("""
const calls = [];
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { if (k === 'fillStyle') calls.push(['fill=', v]); t[k] = v; return true; } });
drawRiceJourney(0, 0, 400); drawRiceJourney(0, 0, 0);
const cols = calls.filter(c => c[0] === 'fill=').map(c => c[1]);
console.log(JSON.stringify({ n: calls.length, cols, text: calls.filter(c => c[0] === 'fillText').length }));
""")
        self.assertEqual(out["text"], 0)
        for c in ("#f2d56b", "#f0d68a", "#e6c79a", "#ffffff", "rgba(255,255,255,.4)", "#e2c25a", "#d8b98a"):
            self.assertIn(c, out["cols"])

    def test_added_lines_clean(self):
        body = fn_src("riceJourneyLayout") + fn_src("drawRiceJourney")
        for bad in ("ぼ" + "く", "だ" + "に", "約2" + "0%", "sin(", "点滅", "Date.now", "performance", "fillText", "setTimeout"):
            self.assertNotIn(bad, body)

    def test_only_expected_files_changed(self):
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        files = {l[3:] for l in out.splitlines()}
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_185.py"})


if __name__ == "__main__":
    unittest.main()

class Test185Links(unittest.TestCase):
    def test_links_branch_to_piles(self):
        L = run_node("console.log(JSON.stringify(riceJourneyLayout(0,0,500)))")
        self.assertEqual(len(L["links"]), 3)
        for lk, pl in zip(L["links"], L["piles"]):
            self.assertAlmostEqual(lk["x1"], pl["cx"], places=6)
            self.assertLess(lk["y0"], lk["y1"])
