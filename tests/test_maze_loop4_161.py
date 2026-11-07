"""第4弾サイクル161：差5 きろくの「めぐったスポット」をギャラリー1つに統合"""
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


class TestMerge(unittest.TestCase):
    def test_html(self):
        self.assertNotIn("visitedList", HTML)
        self.assertEqual(HTML.count('id="visitedGallery"'), 1)
        self.assertGreater(HTML.index('id="visitedGallery"'), HTML.index("めぐったスポット"))

    def test_game_no_list(self):
        self.assertNotIn("$('visitedList')", GAME)
        self.assertNotIn("'visitedList'", GAME)
        self.assertIn("['heardList', 'visitedGallery']", GAME)

    def test_pin_fallback(self):
        r = fn_src("renderVisitedGallery")
        self.assertNotIn("filter(Boolean)", r)
        self.assertIn("vg-pin", r)
        self.assertIn("📍", r)
        self.assertNotIn("×", r)
        self.assertNotIn(".n}", r)

    def test_css(self):
        self.assertRegex(CSS, r"\.vg-pin\{[^}]*width:96px;height:96px")

    def test_gallery_tiles_unchanged(self):
        code = fn_src("galleryTiles") + """const v={a:{first:30,name:'A'},b:{first:10,name:'B'},c:{last:20,name:'C'}};
console.log(JSON.stringify(galleryTiles(v,['a','b','c','z'])));console.log(JSON.stringify(galleryTiles(null,['a'])));"""
        l = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout.splitlines()
        self.assertEqual([t["id"] for t in json.loads(l[0])], ["b", "c", "a"])
        self.assertEqual(l[1], "[]")

    def test_no_banned(self):
        added = fn_src("renderVisitedGallery") + CSS[CSS.index(".vg-pin"):CSS.index(".vg-pin") + 200]
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
