"""第4弾サイクル158：差2 芽は140マスで止まらず、その先もゆっくり育ち続ける（類1の差分）"""
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


def thresholds():
    return [int(x) for x in re.search(r"const GROW_TH = \[([\d, ]+)\];", PIX).group(1).split(",")]


class TestGrowContinues(unittest.TestCase):
    def test_thresholds_extended(self):
        self.assertEqual(thresholds(), [15, 40, 80, 140, 210, 300, 420, 570, 760, 1000, 1300, 1700, 2200, 2800, 3600, 4600, 5900, 7600, 9800, 12700, 16500, 21400, 27800, 36100, 46900, 60900, 79100])
        # 段階0〜4のしきい値はサイクル150のまま変えない
        self.assertEqual(thresholds()[:4], [15, 40, 80, 140])

    def test_gaps_widen(self):
        th = thresholds()
        gaps = [th[0]] + [b - a for a, b in zip(th, th[1:])]
        self.assertEqual(gaps, sorted(gaps), gaps)  # 区間は単調に広がる（育ちはゆっくりになる）
        self.assertTrue(all(g > 0 for g in gaps))

    def test_stage_boundaries_in_node(self):
        code = (re.search(r"const GROW_TH = .*?;", PIX).group(0)
                + re.search(r"function growStageFor\(d\) \{.*?\n", PIX).group(0)
                + "console.log([0,139,140,209,210,299,300,419,420,100000].map(growStageFor).join());")
        out = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, "0,3,4,4,5,5,6,6,7,27")

    def test_stem_height_capped(self):
        body = fn(PIX, "growStep")
        self.assertIn("const sh = 2 + Math.min(st, 4);", body)

    def test_side_flower_and_fruit_branches(self):
        body = fn(PIX, "growStep")
        self.assertIn("if (st >= 5)", body)          # 横の花
        self.assertIn("st === 5", body)              # 段階5は小さい花
        self.assertIn("if (st >= 7)", body)          # 金の実
        self.assertIn("x0 + 4 * q", body)            # 横の花の位置（メインと1つぶ空ける。Codex指摘で3→4）
        # 段階3のつぼみ・段階4の花は従来どおり
        self.assertIn("if (st === 3)", body)
        self.assertIn("if (st >= 4)", body)

    def test_no_color_overlap_in_node(self):
        # growStep をスタブctxで実際に描かせ、同じマスが2色で塗られないこと（金の実が花びらを上書きしないこと）を確認する
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
            " for(const [x,y,w,h,c] of calls){ for(let dx=0; dx<w; dx+=2) for(let dy=0; dy<h; dy+=2){ const k=(x+dx)+','+(y+dy); if(k in cells && cells[k]!==c) bad++; cells[k]=c; } }"
            " out[st]={bad, white:Object.entries(cells).filter(([k,v])=>v==='#ffffff').length}; }"
            "console.log(JSON.stringify(out));"
        )
        out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout.strip()
        import json
        res = json.loads(out)
        for st in range(8):
            self.assertEqual(res[str(st)]["bad"], 0, f"stage {st} で色の重なり")
        # 段階5の横の花は小さく、段階6でメインと同じ大きさぶん白が増える
        self.assertLess(res["5"]["white"], res["6"]["white"])
        self.assertGreater(res["5"]["white"], res["4"]["white"])

    def test_no_text_no_pitch_escalation(self):
        self.assertNotIn("fillText", fn(PIX, "growStep"))
        self.assertNotIn("fillText", fn(PIX, "growStageFor"))
        self.assertIn("if (gs > grow.stage) { grow.stage = gs; grow.popT = performance.now(); dotSound(0); }", PIX)
        self.assertNotRegex(PIX, r"dotSound\([^)]*(grow|gs)")
        self.assertNotIn("grow.stage--", PIX)

    def test_physics_unchanged(self):
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")

    def test_api_unchanged_shape(self):
        self.assertIn("grow: { stage: () => grow.stage, stageFor: growStageFor, TH: GROW_TH, popAt: () => grow.popT }", PIX)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        # 未追跡の新規テストファイルも対象にする
        with open(os.path.abspath(__file__), encoding="utf-8") as fh:
            d += fh.read()
        added = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        pat = "|".join(["ぼ" + "く", "だ" + "に", "約" + "20%"])
        for l in added:
            self.assertIsNone(re.search(pat, l), l)


if __name__ == "__main__":
    unittest.main()
