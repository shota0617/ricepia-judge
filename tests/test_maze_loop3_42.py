"""第3弾サイクル42：かおりちゃんは しゃべらない（吹き出し・おはなし窓の 全廃）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KT = (ROOT / "nishio-go/kometalk.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")


def func_body(src, head):
    i = src.index(head)
    return src[i:src.index("\n}\n", i)]


class KomeTalk(unittest.TestCase):
    def test_say_false_no_window(self):
        self.assertRegex(KT, r"say:\s*\(\)\s*=>\s*false")
        self.assertRegex(KT, r"on:\s*\(\)\s*=>\s*false")
        self.assertNotIn("createElement", KT)
        self.assertNotIn("localStorage", KT)
        self.assertNotIn("Image(", KT)

    def test_api_shape(self):
        for k in ("setOn", "clear", "open", "close", "text", "pickFor"):
            self.assertIn(k, KT)

    def test_node_check(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/kometalk.js")], check=True)


class Toggle(unittest.TestCase):
    def test_removed(self):
        self.assertNotIn("komeTalkToggle", HTML)
        self.assertNotIn("komeTalkToggle", GAME)


class RiceSay(unittest.TestCase):
    def test_no_text_kept_or_drawn(self):
        body = func_body(PIXEL, "function riceSay(")
        self.assertNotIn("riceBub.t", body)
        self.assertNotIn("log", body)
        self.assertNotRegex(PIXEL, r"riceBub\.t\b|riceBub\.log")
        draw = func_body(PIXEL, "function drawRiceSay(")
        self.assertNotRegex(draw, r"fillText|measureText|fillRect")

    def test_timing_and_face_kept(self):
        body = func_body(PIXEL, "function riceSay(")
        self.assertIn("until", body)
        self.assertIn("happyT", body)


class Nazo(unittest.TestCase):
    def test_no_question(self):
        step = func_body(PIXEL, "function nazoStep(")
        first = step.split("\n")[1]
        self.assertRegex(first, r"nazo\.cur = null")
        self.assertIn("return", first)
        tap = func_body(PIXEL, "function nazoTap(")
        self.assertEqual(tap.split("\n")[1].strip(), "return false;")


class Scope(unittest.TestCase):
    def test_files_and_words(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.split()
        for f in out:
            self.assertRegex(f, r"^(nishio-go/|nishio-go\.html$|tests/)")
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        self.assertNotIn("ぼく", added)
        self.assertNotRegex(added, r"約\s*20\s*[%％]")


if __name__ == "__main__":
    unittest.main()
