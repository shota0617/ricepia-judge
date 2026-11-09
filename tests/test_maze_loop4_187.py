"""第4弾サイクル187：特大絵の足元の水彩のにじみの輪郭を、固定の揺らぎで手描き風にする。"""
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


STUB = """
const calls = [];
globalThis.ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { if (k === 'fillStyle') calls.push(['fill=', v]); t[k] = v; return true; } });
"""


class GiantWash187(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([giantWashLayout(0,0,0), giantWashLayout(0,0,-5), giantWashLayout('a',0,10), giantWashLayout(0,NaN,10), giantWashLayout(0,0,Infinity), giantWashLayout(), giantWashLayout(null,0,1)]))")
        self.assertEqual(out, [None] * 7)

    def test_wob(self):
        L = run_node("console.log(JSON.stringify(giantWashLayout(100,200,400)))")
        seen = set()
        for l in L["layers"]:
            self.assertEqual(len(l["wob"]), 12)
            for v in l["wob"]:
                self.assertGreaterEqual(v, 0.90)
                self.assertLessEqual(v, 1.0)
            self.assertGreater(len(set(l["wob"])), 1)
            seen.add(tuple(l["wob"]))
        self.assertEqual(len(seen), 3)

    def test_geometry_unchanged(self):
        L = run_node("console.log(JSON.stringify(giantWashLayout(100,200,400)))")
        cx, ground = 100 + 200, 200 + 400 * 0.72
        cy = ground - 4
        self.assertAlmostEqual(L["ground"], ground)
        exp = [(cx, cy, 184, 52, "rgba(255,240,190,.22)"), (cx - 24, cy + 6, 152, 42, "rgba(170,210,140,.18)"), (cx + 28, cy - 4, 120, 34, "rgba(170,210,240,.16)")]
        for l, (ex, ey, rx, ry, f) in zip(L["layers"], exp):
            self.assertAlmostEqual(l["cx"], ex)
            self.assertAlmostEqual(l["cy"], ey)
            self.assertAlmostEqual(l["rx"], rx)
            self.assertAlmostEqual(l["ry"], ry)
            self.assertEqual(l["fill"], f)

    def draw_calls(self):
        return run_node(STUB + "drawGiantWash(100, 200, 400); drawGiantWash(0, 0, 0); console.log(JSON.stringify(calls));")

    def test_stub_draw(self):
        calls = self.draw_calls()
        names = [c[0] for c in calls]
        self.assertEqual([c[1] for c in calls if c[0] == "fill="][::3], ["rgba(255,240,190,.22)", "rgba(170,210,140,.18)", "rgba(170,210,240,.16)"])
        self.assertEqual(names.count("ellipse"), 0)
        self.assertEqual(names.count("quadraticCurveTo"), 108)
        self.assertEqual(names.count("fillText") + names.count("stroke"), 0)
        self.assertEqual(names.count("fill"), 9)
        self.assertEqual(names.count("closePath"), 9)
        L = run_node("console.log(JSON.stringify(giantWashLayout(100,200,400)))")
        layer = -1
        for c in calls:
            if c[0] == "fill=":
                layer += 1
            if c[0] in ("moveTo", "quadraticCurveTo"):
                l = L["layers"][layer // 3]
                pts = [(c[1], c[2])] + ([(c[3], c[4])] if c[0] == "quadraticCurveTo" else [])
                for x, y in pts:
                    self.assertLessEqual(abs(x - l["cx"]), l["rx"] + 1e-9)
                    self.assertLessEqual(abs(y - l["cy"]), l["ry"] + 1e-9)

    def test_deterministic(self):
        self.assertEqual(self.draw_calls(), self.draw_calls())

    def test_call_site(self):
        self.assertEqual(len(re.findall(r"if \(giant\) drawGiantWash\(sx, sy, size\);", SRC)), 1)
        k = SRC.index("if (giant) drawGiantWash(sx, sy, size);")
        nxt = SRC[SRC.index("\n", k) + 1:].lstrip()
        self.assertTrue(nxt.startswith("ctx.drawImage(spr[0], Math.round(sx), Math.round(sy), size, size);"))
        self.assertIn("giantWashLayout, drawGiantWash", SRC[SRC.index("window.nishioPixel = {"):][:200])

    def test_body_clean(self):
        body = fn_src("giantWashLayout") + fn_src("drawGiantWash")
        for bad in ("ぼ" + "く", "だ" + "に", "約2" + "0%", "Math.sin", "Math.cos", "Math.random", "Date.now", "performance", "fillText", "stroke", "ellipse(", "setTimeout"):
            self.assertNotIn(bad, body)

    def test_only_expected_files_changed(self):
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
        files = {l[3:] for l in out.splitlines()}
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_186.py", "tests/test_maze_loop4_187.py", "tests/test_maze_loop4_188.py"})


if __name__ == "__main__":
    unittest.main()
