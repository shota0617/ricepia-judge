"""第4弾サイクル192：斑＋halo の重ねで中心が濃くならないよう、3回分の alpha を半分にして元の淡さに戻す。"""
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


ORIG = [(.12, "255,255,255"), (.10, "215,175,80"), (.10, "105,165,80"), (.11, "255,255,255"), (.13, "255,255,255"), (.10, "90,150,200")]
GEOM190 = [
    [(52, -4.8, 44, 12.8), (-60, 5.6, 52, 14.4)],
    [(40, 4, 40, 12), (-44, -4, 36, 10.4)],
    [(28, -3.2, 32, 9.6), (-36, 3.6, 34, 10)],
]


def parts(f):
    m = re.fullmatch(r"rgba\((\d+,\d+,\d+),(\.\d+)\)", f)
    return m.group(1), float(m.group(2))


def spots(L):
    return [s for l in L["layers"] for s in l["spots"]]


class GiantWash192(unittest.TestCase):
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
        for l, (ex, ey, rx, ry, f), sps in zip(L["layers"], exp, GEOM190):
            self.assertAlmostEqual(l["cx"], ex)
            self.assertAlmostEqual(l["cy"], ey)
            self.assertAlmostEqual(l["rx"], rx)
            self.assertAlmostEqual(l["ry"], ry)
            self.assertEqual(l["fill"], f)
            self.assertEqual(len(l["wob"]), 12)
            for s, (dx, dy, srx, sry) in zip(l["spots"], sps):
                self.assertAlmostEqual(s["cx"], l["cx"] + dx)
                self.assertAlmostEqual(s["cy"], l["cy"] + dy)
                self.assertAlmostEqual(s["rx"], srx)
                self.assertAlmostEqual(s["ry"], sry)
                self.assertEqual(len(s["wob"]), 12)
                self.assertEqual(len(s["halo"]), 2)
                self.assertAlmostEqual(s["halo"][0]["rx"], srx * 1.30)
                self.assertAlmostEqual(s["halo"][0]["ry"], sry * 1.30)
                self.assertAlmostEqual(s["halo"][1]["rx"], srx * 1.15)
                self.assertAlmostEqual(s["halo"][1]["ry"], sry * 1.15)

    def test_no_temp_field(self):
        # サイクル192 Codex注記: 元の fill を運ぶ一時フィールド A が返値に残らないこと
        L = run_node(LAYOUT)
        for l in L["layers"]:
            for s in l["spots"]:
                self.assertNotIn("A", s)
                self.assertEqual(set(s.keys()), {"cx", "cy", "rx", "ry", "fill", "wob", "halo"})

    def test_alpha_ratios(self):
        ss = spots(run_node(LAYOUT))
        self.assertEqual(len(ss), 6)
        for s, (A, rgb) in zip(ss, ORIG):
            rb, ab = parts(s["fill"])
            r0, a0 = parts(s["halo"][0]["fill"])
            r1, a1 = parts(s["halo"][1]["fill"])
            self.assertEqual((rb, r0, r1), (rgb, rgb, rgb))
            self.assertAlmostEqual(ab, A / 2, delta=0.011)
            self.assertAlmostEqual(a1, A / 3, delta=0.011)
            self.assertAlmostEqual(a0, A / 6, delta=0.011)
            self.assertLess(a0, a1)
            self.assertLess(a1, ab)

    def test_center_effective_alpha(self):
        for s, (A, _) in zip(spots(run_node(LAYOUT)), ORIG):
            a0, a1, ab = (parts(f)[1] for f in (s["halo"][0]["fill"], s["halo"][1]["fill"], s["fill"]))
            eff = 1 - (1 - a0) * (1 - a1) * (1 - ab)
            self.assertAlmostEqual(eff, A, delta=0.01)

    def test_fixed_values(self):
        got = [(s["fill"], [h["fill"] for h in s["halo"]]) for s in spots(run_node(LAYOUT))]
        self.assertEqual(got[0], ("rgba(255,255,255,.06)", ["rgba(255,255,255,.02)", "rgba(255,255,255,.04)"]))
        self.assertEqual(got[1], ("rgba(215,175,80,.05)", ["rgba(215,175,80,.02)", "rgba(215,175,80,.03)"]))
        self.assertEqual(got[3], ("rgba(255,255,255,.06)", ["rgba(255,255,255,.02)", "rgba(255,255,255,.04)"]))
        self.assertEqual(got[4], ("rgba(255,255,255,.07)", ["rgba(255,255,255,.02)", "rgba(255,255,255,.04)"]))

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
        self.assertLessEqual(files, {"nishio-go/pixel.js", "tests/test_maze_loop4_192.py", "tests/test_maze_loop4_190.py", "tests/test_maze_loop4_188.py"})


if __name__ == "__main__":
    unittest.main()
