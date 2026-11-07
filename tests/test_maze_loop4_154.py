"""第4弾サイクル154：類5 転がった跡が花の点々として景色に残る"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
RT = os.path.join(ROOT, "nishio-go", "rolltrail.js")


def node(js):
    code = "require(%s);const R=globalThis.nishioRollTrail;" % json.dumps(RT) + js
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()


class TestBloom(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(node("console.log([R.BLOOM_GAP,R.BLOOM_MAX,R.BLOOM_LIFE_MS,R.BLOOM_ALPHA].join())"), "1.1,120,300000,0.8")

    def test_push(self):
        out = node("""let l=[];l=R.bloomPush(l,0,0,0);l=R.bloomPush(l,0.5,0,1);l=R.bloomPush(l,1.2,0,2);l=R.bloomPush(l,2.4,0,3);
console.log(JSON.stringify(l.map(p=>p.n)));
let m=[];for(let i=0;i<200;i++)m=R.bloomPush(m,i*2,0,i);console.log(m.filter(p=>p.fo==null).length,m.filter(p=>p.fo!=null).length,m[m.length-1].n);""")
        self.assertEqual(out.splitlines(), ["[0,1,2]", "120 80 199"])   # 第4弾サイクル157：上限超えは即消さず fo を付けて退場（生きた点は120のまま）

    def test_push_invalid(self):
        out = node("""const l=[{x:0,y:0,t:0,n:0}];
console.log(R.bloomPush(null,1,1,1).length, R.bloomPush(l,NaN,1,1)===l, R.bloomPush(l,'a',1,1)===l, R.bloomPush(undefined,1,1,1).length, l.length);""")
        self.assertEqual(out, "1 true true 1 1")

    def test_alive(self):
        out = node("""const l=[{t:0},{t:1},null,{t:'x'}];
console.log(R.bloomAlive(l,300000).length, R.bloomAlive(l,300001).length, R.bloomAlive(null,1).length);""")
        self.assertEqual(out, "2 1 0")

    def test_alpha(self):
        out = node("""const L=R.BLOOM_LIFE_MS,A=R.BLOOM_ALPHA;
console.log(R.bloomAlpha(-5)===A,R.bloomAlpha(0)===A,R.bloomAlpha(L*0.6)===A,R.bloomAlpha(L)===0,R.bloomAlpha(L+1)===0,R.bloomAlpha(NaN)===0,R.bloomAlpha('x')===0);
let prev=A,mono=true;for(let a=L*0.6;a<=L;a+=1000){const v=R.bloomAlpha(a);if(v>prev+1e-12)mono=false;prev=v;}
console.log(mono,R.bloomAlpha(L*0.8)<A,R.bloomAlpha(L*0.8)>0);""")
        self.assertEqual(out.splitlines(), ["true true true true true true true", "true true true"])

    def test_petal(self):
        out = node("""const a=JSON.stringify([0,1,2,3,7].map(R.bloomPetal)),b=JSON.stringify([0,1,2,3,7].map(R.bloomPetal));
console.log(a===b,[0,1,2,3].map(n=>R.bloomPetal(n).petals).join(),R.bloomPetal(NaN).petals);""")
        self.assertEqual(out, "true 4,5,4,5 4")


class TestWiring(unittest.TestCase):
    def test_push_line(self):
        self.assertRegex(PIX, r"RT\.push\(rollPath\.list[^\n]*RT\.bloomPush\(rollBloom\.list, hp\.x, hp\.y, now\)[^\n]*RT\.bloomAlive\(rollBloom\.list, now\)")

    def test_draw_after_path(self):
        calls = [m.start() for m in re.finditer(r"drawRollPath\(ox, oy, T, now\);", PIX)]
        self.assertEqual(len(calls), 2)
        for c in calls:
            self.assertRegex(PIX[c:], r"^drawRollPath\(ox, oy, T, now\);(?: if \(!mazeOn\(\)\))? drawRollBloom\(ox, oy, T, now\);")

    def test_api(self):
        self.assertIn("bloom: () => rollBloom.list.map(", PIX)

    def test_no_forbidden(self):
        diff = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go"], capture_output=True, text=True, cwd=ROOT).stdout
        added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
