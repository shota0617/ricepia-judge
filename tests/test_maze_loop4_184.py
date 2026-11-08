"""第4弾サイクル184：自店の特大絵の足元に「精米の所作」の小道具（銀の精米機・粒のざる・虫眼鏡）を絵だけで置く。"""
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
    code = fn_src("seimaiLayout") + fn_src("drawShopSeimai") + body
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


class Seimai184(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([seimaiLayout(0,0,0), seimaiLayout(0,0,-5), seimaiLayout('a',0,10), seimaiLayout(0,NaN,10), seimaiLayout(0,0,Infinity), seimaiLayout(), seimaiLayout(null,0,1)]))")
        self.assertEqual(out, [None] * 7)

    def test_ratios(self):
        L = run_node("console.log(JSON.stringify(seimaiLayout(100,200,400)))")
        self.assertAlmostEqual(L["ground"], 200 + 400 * 0.72)
        self.assertAlmostEqual(L["w"], 400 * 0.34)
        self.assertAlmostEqual(L["h"], 400 * 0.30)
        self.assertAlmostEqual(L["x"], 100 + 400 * 0.03)
        self.assertAlmostEqual(L["y"], L["ground"] - L["h"])
        self.assertEqual(len(L["grains"]), 7)

    def test_no_overlap_shomai(self):
        sh = (ROOT / "nishio-go" / "shomai.js").read_text(encoding="utf-8")
        self.assertIn("size * 0.84", sh)
        L = run_node("console.log(JSON.stringify(seimaiLayout(0,0,500)))")
        self.assertLess(L["x"] + L["w"], 500 * 0.84)

    def test_parts_inside_scene(self):
        L = run_node("console.log(JSON.stringify(seimaiLayout(0,0,500)))")
        r, b = L["x"] + L["w"], L["y"] + L["h"]
        t = L["tray"]; l = L["lens"]
        for v in (t["cx"] + t["rx"], l["cx"] + l["r"], l["hx1"]):
            self.assertLessEqual(v, r + 1e-6)
        self.assertLessEqual(t["cy"] + t["ry"], b + 1e-6)

    def test_call_site(self):
        self.assertEqual(len(re.findall(r"if \(s\.shop && giant\) drawShopSeimai\(sx, sy, size\);", SRC)), 1)
        k = SRC.index("drawShopSeimai(sx, sy, size);")
        self.assertLess(SRC.rindex("shopHits.push([q.x", 0, k), k)
        self.assertLess(k, SRC.index("const t = drawShopTag(sx + size / 2, sy, dpr, s);", k - 10))

    def test_stub_draw(self):
        out = run_node("""
const calls = [];
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { if (k === 'fillStyle') calls.push(['fill=', v]); else if (k === 'strokeStyle') calls.push(['stroke=', v]); t[k] = v; return true; } });
drawShopSeimai(0, 0, 400); drawShopSeimai(0, 0, 0);
const n = k => calls.filter(c => c[0] === k).length;
const cols = calls.filter(c => c[0] === 'fill=' || c[0] === 'stroke=').map(c => c[1]);
console.log(JSON.stringify({ rect: n('fillRect'), ellipse: n('ellipse'), arc: n('arc'), cols }));
""")
        self.assertGreaterEqual(out["rect"], 10)
        self.assertEqual(out["ellipse"], 2)
        self.assertEqual(out["arc"], 7 + 2)   # 粒7つ＋虫眼鏡のガラスと縁
        for c in ("#d9dee3", "#f2f4f6", "#aeb6bd", "#ffd54f", "#ffffff", "rgba(180,220,255,.35)"):
            self.assertIn(c, out["cols"])

    def test_added_lines_clean(self):
        body = fn_src("seimaiLayout") + fn_src("drawShopSeimai")
        for bad in ("ぼ" + "く", "だ" + "に", "約2" + "0%", "sin", "点滅", "Date.now", "performance", "fillText", "setTimeout"):
            self.assertNotIn(bad, body)


if __name__ == "__main__":
    unittest.main()
