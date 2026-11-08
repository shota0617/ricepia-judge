"""第4弾サイクル93：スタートの1分。任意機能を load のあとの遅延読み込みにする。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
# サイクル183：任意機能の後読みを先頭に足した（元の文書順）
LAZY183 = ["komebanashi", "michikusa", "otomo", "nimotsu", "yume", "deai", "kobore", "otedama", "kasa", "meguri", "tsun", "kage", "nedoko", "yuami", "horidashi", "chasetsu", "shimatabi", "isshiki", "chochinyoru", "hazusanpo", "kawabe", "tombolo", "mangekyo", "nazonazo", "youkoso", "shirushi", "monosashi", "okaeri", "furusato", "jokamachi", "chatsumi", "tsutsumi", "kiri", "shopmap", "shomai", "oldmap", "kirara", "yatsumushi", "idlecard"]
LAZY = ["runner", "harvest", "movie", "dankyu", "hiryoyama", "dots", "godot-field"]
SYNC = ["icons", "analytics", "game", "pixel", "meiro", "share"]


def sync_tags():
    return re.findall(r'<script src="nishio-go/([\w-]+)\.js"></script>', HTML)


class Lazy93(unittest.TestCase):
    def test_lazy_not_sync(self):
        for n in LAZY:
            self.assertNotIn(n, sync_tags(), n)

    def test_main_stay_sync(self):
        tags = sync_tags()
        for n in SYNC:
            self.assertIn(n, tags, n)
        self.assertLess(tags.index("game"), tags.index("pixel"))
        self.assertLess(tags.index("pixel"), tags.index("meiro"))

    def test_loader(self):
        m = re.search(r"var files = \[([^\]]*)\];", HTML)
        self.assertTrue(m)
        self.assertEqual(re.findall(r'"([\w-]+)"', m.group(1)), LAZY183 + LAZY)
        self.assertIn("el.async = false", HTML)
        self.assertIn("el.onload = next", HTML)
        self.assertIn("window.__nsgLazyDone = true", HTML)
        self.assertIn("addEventListener('load', next)", HTML)
        self.assertIn("document.readyState === 'complete'", HTML)

    def test_lazy_files_exist_and_parse(self):
        for n in LAZY:
            f = ROOT / "nishio-go" / (n + ".js")
            self.assertTrue(f.exists(), n)
            subprocess.run(["node", "--check", str(f)], check=True)

    def test_entries_guarded(self):
        game = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
        pix = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
        self.assertIn("if (window.NISHIO_JUMP) NISHIO_JUMP.open();", game)
        for g in ("NISHIO_HARVEST", "NISHIO_DANKYU", "NISHIO_HIRYO"):
            self.assertIn("window." + g + " &&", pix)
        # Codex 指摘（サイクル93）: MOVIE / DOTS / GODOT の入口ガードも固定する
        self.assertIn("if (!window.NISHIO_MOVIE) return;", game)
        self.assertIn("if (!D || !grid) return;", game)
        self.assertIn("window.NSG_GODOT &&", pix)

    def test_physics_unchanged(self):
        pix = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
        self.assertRegex(pix, r"ROLL_MAX\s*=\s*4\.2\b")
        self.assertRegex(pix, r"ROLL_ACC\s*=\s*7\b")

    def test_no_forbidden_in_added_lines(self):
        bad = ["\u307c\u304f", "\u62b9\u8336\u7d0420%", "\u62b9\u8336\u300c\u7d0420%"]
        diff = subprocess.run(["git", "diff", "HEAD~1", "HEAD", "--", "nishio-go.html"], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout
        for line in diff.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                for b in bad:
                    self.assertNotIn(b, line)


if __name__ == "__main__":
    unittest.main()
