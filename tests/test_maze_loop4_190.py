"""第4弾サイクル190：色むらの斑の境界を、外側の淡い縁（halo）の重ねでぼかす。"""
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


class GiantWash190(unittest.TestCase):
    def test_syntax(self):
        self.assertEqual(subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "pixel.js")]).returncode, 0)

    def test_invalid_is_null(self):
        out = run_node("console.log(JSON.stringify([giantWashLayout(0,0,0), giantWashLayout(0,0,-5), giantWashLayout('a',0,10), giantWashLayout(0,NaN,10), giantWashLayout(0,0,Infinity), giantWashLayout(), giantWashLayout(null,0,1)]))")
        self.assertEqual(out, [None] * 7)

    def test_geometry_unchanged(self):
        L = run_node(LAYOUT)
        cx, ground = 300, 200 + 400 * 0.72
        cy = ground - 4
        self.assertAlmostEqual(L["ground"], ground)
        exp = [(cx, cy, 184, 52, "rgba(255,240,190,.22)"), (cx - 24, cy + 6, 152, 42, "rgba(170,210,140,.18)"), (cx + 28, cy - 4, 120, 34, "rgba(170,210,240,.16)")]
        spots = [
            [(52, -4.8, 44, 12.8, "rgba(255,255,255,.06)"), (-60, 5.6, 52, 14.4, "rgba(215,175,80,.05)")],
            [(40, 4, 40, 12, "rgba(105,165,80,.05)"), (-44, -4, 36, 10.4, "rgba(255,255,255,.055)")],
            [(28, -3.2, 32, 9.6, "rgba(255,255,255,.065)"), (-36, 3.6, 34, 10, "rgba(90,150,200,.05)")],
        ]
        for l, (ex, ey, rx, ry, f), sps in zip(L["layers"], exp, spots):
            self.assertAlmostEqual(l["cx"], ex)
            self.assertAlmostEqual(l["cy"], ey)
            self.assertAlmostEqual(l["rx"], rx)
            self.assertAlmostEqual(l["ry"], ry)
            self.assertEqual(l["fill"], f)
            self.assertEqual(len(l["wob"]), 12)
            self.assertEqual(len(l["spots"]), 2)
            for s, (dx, dy, srx, sry, sf) in zip(l["spots"], sps):
                self.assertAlmostEqual(s["cx"], l["cx"] + dx)
                self.assertAlmostEqual(s["cy"], l["cy"] + dy)
                self.assertAlmostEqual(s["rx"], srx)
                self.assertAlmostEqual(s["ry"], sry)
                self.assertEqual(s["fill"], sf)
                self.assertEqual(len(s["wob"]), 12)

    def test_halo(self):
        L = run_node(LAYOUT)

        def parts(f):
            m = re.fullmatch(r"rgba\((\d+),(\d+),(\d+),(\.\d+)\)", f)
            return m.group(1, 2, 3), float(m.group(4))

        for l in L["layers"]:
            for s in l["spots"]:
                self.assertEqual(len(s["halo"]), 2)
                h0, h1 = s["halo"]
                self.assertAlmostEqual(h0["rx"], s["rx"] * 1.30)
                self.assertAlmostEqual(h0["ry"], s["ry"] * 1.30)
                self.assertAlmostEqual(h1["rx"], s["rx"] * 1.15)
                self.assertAlmostEqual(h1["ry"], s["ry"] * 1.15)
                rgb, a = parts(s["fill"])
                rgb0, a0 = parts(h0["fill"])
                rgb1, a1 = parts(h1["fill"])
                self.assertEqual(rgb0, rgb)
                self.assertEqual(rgb1, rgb)
                self.assertLess(a0, a1)
                self.assertLess(a1, a)
                for h in (h0, h1):
                    self.assertGreaterEqual(s["cx"] - h["rx"], l["cx"] - l["rx"])
                    self.assertLessEqual(s["cx"] + h["rx"], l["cx"] + l["rx"])
                    self.assertGreaterEqual(s["cy"] - h["ry"], l["cy"] - l["ry"])
                    self.assertLessEqual(s["cy"] + h["ry"], l["cy"] + l["ry"])

    def test_halo_fill_examples(self):
        # 199で小数第3位まで残した値（元 .12→本体.06・縁[.02,.04]、元 .10→.05・[.017,.033]、元 .11→.055・[.018,.037]、元 .13→.065・[.022,.043]）
        L = run_node(LAYOUT)
        got = [(s["fill"], [h["fill"] for h in s["halo"]]) for l in L["layers"] for s in l["spots"]]
        self.assertEqual(got[0], ("rgba(255,255,255,.06)", ["rgba(255,255,255,.02)", "rgba(255,255,255,.04)"]))
        self.assertEqual(got[1], ("rgba(215,175,80,.05)", ["rgba(215,175,80,.017)", "rgba(215,175,80,.033)"]))
        self.assertEqual(got[3], ("rgba(255,255,255,.055)", ["rgba(255,255,255,.018)", "rgba(255,255,255,.037)"]))
        self.assertEqual(got[4], ("rgba(255,255,255,.065)", ["rgba(255,255,255,.022)", "rgba(255,255,255,.043)"]))

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
                exp += [s["halo"][0]["fill"], s["halo"][1]["fill"], s["fill"]]
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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_190.py", "tests/test_maze_loop4_192.py", "tests/test_maze_loop4_188.py", "tests/test_maze_loop4_187.py", "tests/test_maze_loop4_186.py"})


if __name__ == "__main__":
    unittest.main()
