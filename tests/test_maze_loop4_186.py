"""第4弾サイクル186：特大の名所絵すべての足元に、水彩の手描き風の「地面のにじみ」を敷く。"""
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
    code = fn_src("giantWashLayout") + fn_src("drawGiantWash") + body
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


class GiantWash186(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([giantWashLayout(0,0,0), giantWashLayout(0,0,-5), giantWashLayout('a',0,10), giantWashLayout(0,NaN,10), giantWashLayout(0,0,Infinity), giantWashLayout(), giantWashLayout(null,0,1)]))")
        self.assertEqual(out, [None] * 7)

    def test_geometry(self):
        L = run_node("console.log(JSON.stringify(giantWashLayout(100,200,400)))")
        self.assertAlmostEqual(L["ground"], 200 + 400 * 0.72)
        self.assertEqual(len(L["layers"]), 3)
        rxs = [l["rx"] for l in L["layers"]]
        self.assertEqual(rxs, sorted(rxs, reverse=True))
        self.assertGreaterEqual(L["x"], 100)
        self.assertLessEqual(L["x"] + L["w"], 100 + 400)
        for l in L["layers"]:
            self.assertGreaterEqual(l["cx"] - l["rx"], L["x"] - 1e-9)
            self.assertLessEqual(l["cx"] + l["rx"], L["x"] + L["w"] + 1e-9)

    def test_stub_draw(self):
        out = run_node("""
const calls = [];
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { if (k === 'fillStyle') calls.push(['fill=', v]); t[k] = v; return true; } });
drawGiantWash(0, 0, 400); const n1 = calls.length; drawGiantWash(0, 0, 0);
console.log(JSON.stringify({ n1, n: calls.length, cols: calls.filter(c => c[0] === 'fill=').map(c => c[1]), ell: calls.filter(c => c[0] === 'ellipse').length, quad: calls.filter(c => c[0] === 'quadraticCurveTo').length, text: calls.filter(c => c[0] === 'fillText' || c[0] === 'stroke').length }));
""")
        self.assertEqual(out["n"], out["n1"])
        self.assertEqual(out["ell"], 0)
        self.assertEqual(out["quad"], 252)   # 188で色むらの斑、190で斑の縁が加わった（12×21）
        self.assertEqual(out["text"], 0)
        self.assertEqual(out["cols"][::7], ["rgba(255,240,190,.22)", "rgba(170,210,140,.18)", "rgba(170,210,240,.16)"])

    def test_call_site(self):
        self.assertEqual(len(re.findall(r"if \(giant\) drawGiantWash\(sx, sy, size\);", SRC)), 1)
        k = SRC.index("if (giant) drawGiantWash(sx, sy, size);")
        nxt = SRC[SRC.index("\n", k) + 1:].lstrip()
        self.assertTrue(nxt.startswith("ctx.drawImage(spr[0], Math.round(sx), Math.round(sy), size, size);"))
        self.assertIn("giantWashLayout, drawGiantWash", SRC[SRC.index("window.nishioPixel = {"):][:200])

    def test_added_lines_clean(self):
        body = fn_src("giantWashLayout") + fn_src("drawGiantWash")
        for bad in ("ぼ" + "く", "だ" + "に", "約2" + "0%", "sin(", "点滅", "Date.now", "performance", "fillText", "setTimeout", "stroke"):
            self.assertNotIn(bad, body)

    def test_only_expected_files_changed(self):
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        files = {l[3:] for l in out.splitlines()}
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_186.py", "tests/test_maze_loop4_187.py", "tests/test_maze_loop4_188.py"})


if __name__ == "__main__":
    unittest.main()
