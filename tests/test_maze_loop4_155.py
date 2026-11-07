"""第4弾サイクル155：類6 着いた名所が絵で「集まった」と分かる記録"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()
HTML = open(os.path.join(ROOT, "nishio-go.html"), encoding="utf-8").read()
CSS = open(os.path.join(ROOT, "nishio-go", "style.css"), encoding="utf-8").read()


def fn_src(name):
    m = re.search(r"^function %s\(.*?^}\n" % name, GAME, re.S | re.M)
    assert m, name
    return m.group(0)


def node(js):
    code = fn_src("galleryTiles") + js
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.strip()


class TestGalleryTiles(unittest.TestCase):
    def test_order_and_filter(self):
        out = node("""const v={a:{first:30,last:99,name:'A'},b:{first:10,last:50,name:'B'},x:{first:1,name:'X'},c:{last:20,name:'C'},d:{}};
console.log(JSON.stringify(galleryTiles(v,new Set(['a','b','c','d']))));
console.log(JSON.stringify(galleryTiles(v,['a','b'])));""")
        l = out.splitlines()
        self.assertEqual(json.loads(l[0]), [{"id": "d", "name": "d"}, {"id": "b", "name": "B"}, {"id": "c", "name": "C"}, {"id": "a", "name": "A"}])
        self.assertEqual([t["id"] for t in json.loads(l[1])], ["b", "a"])

    def test_invalid(self):
        out = node("console.log(JSON.stringify([galleryTiles(null,new Set()),galleryTiles('x',['a']),galleryTiles(5,['a']),galleryTiles({a:{name:'A'}},null)]))")
        self.assertEqual(out, "[[],[],[],[]]")

    def test_no_mutation(self):
        out = node("const v={a:{first:2,name:'A'},b:{first:1,name:'B'}};const s=JSON.stringify(v);galleryTiles(v,['a','b']);console.log(s===JSON.stringify(v))")
        self.assertEqual(out, "true")


class TestWiring(unittest.TestCase):
    def test_render(self):
        self.assertRegex(fn_src("renderLog"), r"renderVisitedGallery\(\)")
        r = fn_src("renderVisitedGallery")
        self.assertIn("$('visitedGallery')", r)
        self.assertIn('class="vg-tile"', r)
        self.assertNotIn("×", r)
        self.assertNotIn("あと", r)
        self.assertNotIn(".n}", r)

    def test_click_and_export(self):
        self.assertIn("'visitedGallery'", GAME)
        self.assertIn("closest('[data-spot]')", GAME)
        self.assertRegex(GAME, r"window\.nishioGo = \{\s*galleryTiles")

    def test_html_once_after_heading(self):
        self.assertEqual(HTML.count('id="visitedGallery"'), 1)
        self.assertGreater(HTML.index('id="visitedGallery"'), HTML.index("めぐったスポット"))

    def test_css(self):
        self.assertIn(".vg-grid[hidden]{display:none}", CSS)
        self.assertIn("image-rendering:pixelated", CSS[CSS.index(".vg-tile img.vg-art"):])

    def test_no_banned(self):
        added = fn_src("galleryTiles") + fn_src("renderVisitedGallery") + CSS[CSS.index(".vg-grid"):]
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
