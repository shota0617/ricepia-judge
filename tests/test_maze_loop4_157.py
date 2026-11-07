"""第4弾サイクル157：類5仕上げ 転がった跡の花は穏やかに退場し、重ならない"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RT_PATH = os.path.join(ROOT, "nishio-go", "rolltrail.js")
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
RT_SRC = open(RT_PATH, encoding="utf-8").read()


def node(js):
    pre = "global.window=global;require(%s);const R=window.nishioRollTrail;" % json.dumps(RT_PATH)
    out = subprocess.run(["node", "-e", pre + js], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class TestBloomFade(unittest.TestCase):
    def test_value(self):
        self.assertEqual(node("console.log(JSON.stringify([R.BLOOM_FADE_MS,R.BLOOM_GAP,R.BLOOM_MAX,R.BLOOM_LIFE_MS,R.BLOOM_ALPHA]))"), [4000, 1.1, 120, 300000, 0.8])

    def test_revisit_no_overlap(self):
        r = node("let l=[];l=R.bloomPush(l,0,0,0);l=R.bloomPush(l,5,0,1);l=R.bloomPush(l,0.5,0.2,2);const a=l.length;l=R.bloomPush(l,0,3,3);console.log(JSON.stringify([a,l.length]))")
        self.assertEqual(r, [2, 3])

    def test_cap_marks_oldest_not_dropped(self):
        r = node("let l=[];for(let i=0;i<120;i++)l=R.bloomPush(l,i*2,0,i);const before=l.length;l=R.bloomPush(l,999,0,500);console.log(JSON.stringify({before,len:l.length,fo:l.map(p=>p.fo==null?null:p.fo).filter(v=>v!==null),first:l[0].fo,last:l[l.length-1].n}))")
        self.assertEqual((r["before"], r["len"]), (120, 121))
        self.assertEqual(r["fo"], [500])
        self.assertEqual(r["first"], 500)
        self.assertEqual(r["last"], 120)

    def test_codex_fixes(self):
        # 退場中（まだ見えている）花の近くには重ねない／消え終わった花は push のときに落とす
        r = node("let l=[{x:0,y:0,t:0,n:0,fo:1000}];l=R.bloomPush(l,0.4,0,1500);const a=l.length;l=R.bloomPush(l,9,9,1500);const b=l.length;l=R.bloomPush(l,0.4,0,1000+R.BLOOM_FADE_MS+1);console.log(JSON.stringify([a,b,l.length,l[l.length-1].n]))")
        self.assertEqual(r, [1, 2, 2, 2])

    def test_fading_point_drops_after_fade(self):
        r = node("const p={x:0,y:0,t:0,n:0,fo:500};console.log(JSON.stringify([R.bloomAlive([p],500+R.BLOOM_FADE_MS).length,R.bloomAlive([p],500+R.BLOOM_FADE_MS+1).length]))")
        self.assertEqual(r, [1, 0])

    def test_alpha_at(self):
        r = node("""const o=[];for(const age of [0,1000,100000,200000,290000]){o.push(R.bloomAlphaAt({t:0},age)===R.bloomAlpha(age));}
const fo={t:0,fo:1000};const s=[1000,2000,3000,4000,5000].map(n=>R.bloomAlphaAt(fo,n));
console.log(JSON.stringify({same:o,s,bad:[R.bloomAlphaAt(null,1),R.bloomAlphaAt({t:0},NaN),R.bloomAlphaAt({},1)]}))""")
        self.assertTrue(all(r["same"]))
        s = r["s"]
        self.assertEqual(s[0], 0.8)
        self.assertEqual(s[-1], 0)
        self.assertTrue(all(a > b for a, b in zip(s, s[1:])))
        self.assertEqual(r["bad"], [0, 0, 0])

    def test_pixel_wiring(self):
        m = re.search(r"^function drawRollBloom\(.*?^}\n", PIX, re.S | re.M).group(0)
        self.assertIn("RT.bloomAlphaAt ? RT.bloomAlphaAt(p, now) : RT.bloomAlpha(now - p.t)", m)
        self.assertIn("fo: p.fo == null ? null : p.fo", PIX)

    def test_no_banned_words(self):
        for w in ["ぼ" + "く", "だ" + "に", "約20" + "%"]:
            self.assertNotIn(w, RT_SRC[RT_SRC.index("BLOOM_FADE_MS"):])


if __name__ == "__main__":
    unittest.main()
