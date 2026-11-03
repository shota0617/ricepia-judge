"""第4弾サイクル2：ポストカード帳のアルバム化と安全弁（say の禁止表現・issue の400枚上限・progress）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go/style.css").read_text(encoding="utf-8")
BAD = ["ぼく", "だに", "20%"]


def fn(src, name):
    a = src.index("function " + name + "(")
    return src[a:src.index("\n}\n", a) + 3]


def run_node(code):
    src = (ROOT / "nishio-go/postcard.js").read_text(encoding="utf-8")
    out = subprocess.run(["node", "-e", src + "\n;const P=globalThis.NISHIO_POSTCARD;" + code],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Say(unittest.TestCase):
    def test_banned_first_phrase_falls_back(self):
        for w in BAD:
            r = run_node(f"console.log(JSON.stringify(P.say('西尾城', '{w}の城。ひろい')))")
            self.assertEqual(r, "西尾城に 着いたに。ええとこだら？")
            self.assertFalse(any(b in r for b in BAD))

    def test_normal_desc_uses_first_phrase(self):
        r = run_node("console.log(JSON.stringify(P.say('西尾城', '抹茶の城。ひろい')))")
        self.assertIn("抹茶の城", r)

    def test_all_spots(self):
        spots = json.loads((ROOT / "nishio-go/spots.json").read_text(encoding="utf-8"))["spots"]
        descs = json.dumps([[s.get("name", ""), s.get("desc", "")] for s in spots], ensure_ascii=False)
        out = run_node(f"console.log(JSON.stringify({descs}.map(([n,d])=>P.say(n,d))))")
        self.assertEqual(len(out), len(spots))
        for t in out:
            self.assertLessEqual(len(t), 60)
            self.assertFalse(any(b in t for b in BAD))


class Issue(unittest.TestCase):
    CARDS = "const mk=n=>{const o={};for(let i=0;i<n;i++)o['s'+i]={day:'2026-01-01',say:'a'};return o};"

    def test_399_to_400(self):
        r = run_node(self.CARDS + "const r=P.issue(mk(399),'new','2026-11-03','x');console.log(JSON.stringify([r.fresh,Object.keys(r.st).length]))")
        self.assertEqual(r, [True, 400])

    def test_400_new_id_not_fresh(self):
        r = run_node(self.CARDS + "const r=P.issue(mk(400),'new','2026-11-03','x');console.log(JSON.stringify([r.fresh,Object.keys(r.st).length,'new' in r.st]))")
        self.assertEqual(r, [False, 400, False])

    def test_400_existing_id_not_fresh(self):
        r = run_node(self.CARDS + "const r=P.issue(mk(400),'s5','2026-11-03','x');console.log(JSON.stringify([r.fresh,Object.keys(r.st).length]))")
        self.assertEqual(r, [False, 400])


class Progress(unittest.TestCase):
    def test_values(self):
        r = run_node("console.log(JSON.stringify([P.progress(0,0),P.progress(3,10),P.progress(10,10),P.progress(15,10),P.progress(-4,10),P.progress(NaN,10),P.progress(2,NaN)]))")
        self.assertEqual(r[0], {"have": 0, "total": 0, "pct": 0, "left": 0})
        self.assertEqual(r[1], {"have": 3, "total": 10, "pct": 30, "left": 7})
        self.assertEqual(r[2], {"have": 10, "total": 10, "pct": 100, "left": 0})
        self.assertEqual(r[3], {"have": 10, "total": 10, "pct": 100, "left": 0})
        self.assertEqual(r[4], {"have": 0, "total": 10, "pct": 0, "left": 10})
        self.assertEqual(r[5], {"have": 0, "total": 10, "pct": 0, "left": 10})
        self.assertEqual(r[6], {"have": 0, "total": 0, "pct": 0, "left": 0})


class Static(unittest.TestCase):
    def test_render_postcards(self):
        b = fn(GAME, "renderPostcards")
        self.assertIn("PC.progress", b)
        self.assertIn("s.featured && !s.shop", b)
        self.assertIn("${pg.have}/${pg.total}枚", b)
        self.assertIn("postcardBarFill", b)
        self.assertIn("コンプ！", b)

    def test_html_css(self):
        for i in ("postcardAlbum", "postcardBarFill", "postcardLeft"):
            self.assertIn(i, HTML)
        self.assertRegex(CSS, r"\.pc-list\{display:grid")
        self.assertRegex(CSS, r"\.pc-album \.bar\{")
        self.assertIn(".pc-album[hidden]{display:none}", CSS)   # Codex指摘：display:flex が hidden を上書きしないこと

    def test_course_celebrate_regression(self):
        b = fn(GAME, "courseCelebrate")
        self.assertNotIn("openCourse", b)
        self.assertNotIn("setTimeout", b)
        self.assertIn("toastAfter", b)

    def test_no_forbidden_in_diff(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = [l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        for l in added:
            for b in BAD:
                self.assertNotIn(b, l)
