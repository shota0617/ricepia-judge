"""第4弾サイクル162：差6 花の仕上げ（横の花に枝をつなぐ＋重い端末でも跡の花が残る）"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()


def fn(src, name):
    i = src.index("function " + name + "(")
    j = src.index("\n}\n", i)
    return src[i:j + 3]


def render():
    body = fn(PIX, "growStep")
    script = (
        "const calls=[];"
        "const ctx={globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:0,beginPath(){},arc(){},stroke(){},"
        "fillRect(x,y,w,h){calls.push([x,y,w,h,this.fillStyle]);}};"
        "let grow={stage:0,popT:0}; const roll={v:0};"
        + body +
        "const out={};"
        "for(let st=0; st<=9; st++){ calls.length=0; grow={stage:st,popT:0}; growStep(100,200,2,100000);"
        " const cells={}; let bad=0;"
        " for(const [x,y,w,h,c] of calls){ for(let dx=0; dx<w; dx+=2) for(let dy=0; dy<h; dy+=2){"
        " const k=((x+dx-100)/2)+','+((y+dy-(200-30))/2); if(k in cells && cells[k]!==c) bad++; cells[k]=c; } }"
        " out[st]={bad,cells}; }"
        "console.log(JSON.stringify(out));"
    )
    return json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)


GREEN = "#4c9a3a"


class TestBranch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = render()

    def test_no_overlap(self):
        for st in range(8):
            self.assertEqual(self.res[str(st)]["bad"], 0, st)

    def test_low_stages_have_no_branch_cells(self):
        for st in range(5):
            sh = 2 + min(st, 4)
            cells = self.res[str(st)]["cells"]
            for dx in (2, 3, 4):
                self.assertNotIn(f"{dx},{-sh}", cells, (st, dx))

    def test_stage5_branch(self):
        c = self.res["5"]["cells"]; sh = 6
        self.assertEqual(c[f"2,{-sh}"], GREEN)
        self.assertEqual(c[f"3,{-sh}"], GREEN)
        self.assertEqual(c[f"4,{-sh}"], "#ffffff")

    def test_branch_row_continuous(self):
        # 茎（dx=0）から横の花（dx=4）まで、枝の行（dy=-sh）のセルが途切れないこと
        for st in ("5", "6", "7"):
            c = self.res[st]["cells"]; sh = 6
            for dx in range(5):
                self.assertIn(f"{dx},{-sh}", c, (st, dx))

    def test_stage6_7_support(self):
        for st in ("6", "7"):
            c = self.res[st]["cells"]; sh = 6
            self.assertEqual(c[f"2,{-sh}"], GREEN)
            self.assertEqual(c[f"3,{-sh}"], GREEN)
            self.assertEqual(c[f"4,{-sh}"], GREEN)

    def test_stem_unchanged(self):
        for st in range(1, 8):
            sh = 2 + min(st, 4)
            for r in range(1, sh + 1):
                self.assertEqual(self.res[str(st)]["cells"].get(f"0,{-r}"), GREEN, (st, r))


class TestBloomSlow(unittest.TestCase):
    def test_record_outside_slow_gate(self):
        line = next(l for l in PIX.splitlines() if "RT.bloomPush(rollBloom.list" in l)
        i = line.index("if (!fpsMeter.slow) {")
        j = line.index("}", i)
        self.assertLess(j, line.index("RT.bloomPush"))
        self.assertIn("rollPath.list = RT.push(", line[i:j])
        self.assertNotIn("!fpsMeter.slow", line[j:])

    def test_draw_bloom_slow(self):
        body = fn(PIX, "drawRollBloom")
        first = next(l for l in body.splitlines() if "return;" in l)
        self.assertNotIn("fpsMeter.slow", first)
        # 花びらの形（bloomPetal）は slow でない分岐の中でだけ計算する
        self.assertGreater(body.index("RT.bloomPetal(p.n)"), body.index("if (!fpsMeter.slow)"))
        self.assertIn("T * 0.06", body)

    def test_ribbon_and_ghost_still_stop(self):
        self.assertIn("if (!RT || fpsMeter.slow || !rollPath.list.length) return;", PIX)
        self.assertIn("if (!fpsMeter.slow && riceBall.cv && (KP.ghost", PIX)


class TestUnchanged(unittest.TestCase):
    def test_constants(self):
        th = re.search(r"const GROW_TH = \[([\d, ]+)\];", PIX).group(1)
        self.assertEqual([int(x) for x in th.split(",")], [15, 40, 80, 140, 210, 300, 420, 570, 760])
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
        self.assertIn("const sh = 2 + Math.min(st, 4);", fn(PIX, "growStep"))

    def test_api(self):
        self.assertIn("grow: { stage: () => grow.stage, stageFor: growStageFor, TH: GROW_TH, popAt: () => grow.popT }", PIX)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        with open(os.path.abspath(__file__), encoding="utf-8") as fh:
            d += fh.read()
        added = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        pat = "|".join(["ぼ" + "く", "だ" + "に", "約" + "20%"])
        for l in added:
            self.assertIsNone(re.search(pat, l), l)


if __name__ == "__main__":
    unittest.main()
