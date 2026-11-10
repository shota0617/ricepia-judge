"""第4弾サイクル188：特大絵の足元の水彩のにじみに、固定の「色むら」（抜けと溜まりの斑）を入れる。"""
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
LAYOUT = "console.log(JSON.stringify(giantWashLayout(100,200,400)))"


class GiantWash188(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([giantWashLayout(0,0,0), giantWashLayout(0,0,-5), giantWashLayout('a',0,10), giantWashLayout(0,NaN,10), giantWashLayout(0,0,Infinity), giantWashLayout(), giantWashLayout(null,0,1)]))")
        self.assertEqual(out, [None] * 7)

    def test_geometry_unchanged(self):
        L = run_node(LAYOUT)
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
            self.assertEqual(len(l["wob"]), 12)

    def test_spots(self):
        L = run_node(LAYOUT)
        fills = set()
        wobs = set()
        for l in L["layers"]:
            self.assertEqual(len(l["spots"]), 2)
            holes = 0
            for s in l["spots"]:
                self.assertLessEqual(abs(s["cx"] - l["cx"]), l["rx"] * 0.45 + 1e-9)
                self.assertLessEqual(abs(s["cy"] - l["cy"]), l["ry"] * 0.45 + 1e-9)
                self.assertLessEqual(s["rx"], l["rx"] * 0.35 + 1e-9)
                self.assertLessEqual(s["ry"], l["ry"] * 0.45 + 1e-9)
                self.assertGreaterEqual(s["cx"] - s["rx"], l["cx"] - l["rx"])
                self.assertLessEqual(s["cx"] + s["rx"], l["cx"] + l["rx"])
                self.assertGreaterEqual(s["cy"] - s["ry"], l["cy"] - l["ry"])
                self.assertLessEqual(s["cy"] + s["ry"], l["cy"] + l["ry"])
                self.assertEqual(len(s["wob"]), 12)
                for v in s["wob"]:
                    self.assertGreaterEqual(v, 0.90)
                    self.assertLessEqual(v, 1.0)
                wobs.add(tuple(s["wob"]))
                fills.add(s["fill"])
                self.assertNotEqual(s["fill"], l["fill"])
                if s["fill"].startswith("rgba(255,255,255,"):
                    holes += 1
            self.assertEqual(holes, 1)
        self.assertEqual(len(fills), 6)
        self.assertEqual(len(wobs), 6)

    def draw_calls(self):
        return run_node(STUB + "drawGiantWash(100, 200, 400); drawGiantWash(0, 0, 0); console.log(JSON.stringify(calls));")

    def test_stub_draw(self):
        calls = self.draw_calls()
        names = [c[0] for c in calls]
        L = run_node(LAYOUT)
        exp = []
        for l in L["layers"]:
            exp += [l["fill"]]
            for s in l["spots"]:
                exp += [h["fill"] for h in s["halo"]] + [s["fill"]]   # 190：斑の前に外側の淡い縁2つ
        self.assertEqual([c[1] for c in calls if c[0] == "fill="], exp)
        self.assertEqual(len(exp), 21)
        self.assertEqual(names.count("fill"), 21)
        self.assertEqual(names.count("closePath"), 21)
        self.assertEqual(names.count("ellipse"), 0)
        self.assertEqual(names.count("quadraticCurveTo"), 252)
        self.assertEqual(names.count("fillText") + names.count("stroke"), 0)
        layer = -1
        for c in calls:
            if c[0] == "fill=":
                layer += 1
                l = L["layers"][layer // 7]
            if c[0] in ("moveTo", "quadraticCurveTo"):
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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_188.py", "tests/test_maze_loop4_187.py", "tests/test_maze_loop4_186.py", "tests/test_maze_loop4_190.py"})


if __name__ == "__main__":
    unittest.main()
