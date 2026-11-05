"""第4弾サイクル96：スタート地点の周りの名所を、密集地でも特大の絵で描く。"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


class HeroGiant96(unittest.TestCase):
    def test_constants_and_api(self):
        self.assertIn("const HERO_GIANT_RANGE = 18;", PIX)
        self.assertIn("heroGiant: () => heroGiantId, pickHeroGiant, HERO_GIANT_RANGE", PIX)

    def test_pick_conditions(self):
        m = re.search(r"function pickHeroGiant\(.*?\n\}\n", PIX, re.S)
        self.assertTrue(m)
        body = m.group(0)
        for t in ("s.featured || s.shop", "GIANT_ART[s.id]", "giantIds.has(s.id)", "HERO_GIANT_RANGE", "d < bd"):
            self.assertIn(t, body)

    def test_draw_uses_giantof_for_hero_only(self):
        self.assertIn("mazeOn() ? null : pickHeroGiant(spots, bigHero.x, bigHero.y)", PIX)
        self.assertIn("s === heroGiant ? giantOf(s) : bigOf(s)", PIX)
        self.assertIn("const bigOf = (s, load = true) => (giantTiles(s) >= 6 ? giantOf(s, load) : null);", PIX)

    @unittest.skipUnless(shutil.which("node"), "node が必要")
    def test_pick_numeric(self):
        m = re.search(r"const HERO_GIANT_RANGE = 18;\nlet heroGiantId = null;\nfunction pickHeroGiant\(.*?\n\}\n", PIX, re.S)
        js = ("const toTile=(lat,lng)=>({x:lng,y:lat});const GIANT_ART={a:1,b:1,c:1,d:1};let giantIds=new Set(['e']);"
              + m.group(0) +
              "const S=(id,x,o)=>Object.assign({id,lat:0,lng:x},o);"
              "const L=[S('a',5,{featured:1}),S('b',3,{shop:1}),S('c',2,{}),S('d',40,{featured:1}),S('x',1,{featured:1}),S('e',4,{featured:1})];"
              "console.log(JSON.stringify([pickHeroGiant(L,0,0).id,pickHeroGiant(L,50,0).id,pickHeroGiant([S('d',40,{featured:1})],0,0),pickHeroGiant(L,null,null),"
              "pickHeroGiant([S('a',3,{featured:1}),S('b',3,{featured:1})],0,0).id,pickHeroGiant([S('a',18,{featured:1})],0,0).id]));")
        out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, '["b","d",null,null,"a","a"]')


if __name__ == "__main__":
    unittest.main()
