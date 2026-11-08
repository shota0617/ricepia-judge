"""第4弾サイクル183：起動の待ち時間。転がるのに要らない39本を、load のあとの後読みへ回す（同期 script 70本 → 31本）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")

LAZY_MOVED = [
    "komebanashi", "michikusa", "otomo", "nimotsu", "yume", "deai", "kobore", "otedama", "kasa", "meguri",
    "tsun", "kage", "nedoko", "yuami", "horidashi", "chasetsu", "shimatabi", "isshiki", "chochinyoru", "hazusanpo",
    "kawabe", "tombolo", "mangekyo", "nazonazo", "youkoso", "shirushi", "monosashi", "okaeri", "furusato", "jokamachi",
    "chatsumi", "tsutsumi", "kiri", "shopmap", "shomai", "oldmap", "kirara", "yatsumushi", "idlecard",
]
LAZY_OLD = ["runner", "harvest", "movie", "dankyu", "hiryoyama", "dots", "godot-field"]
SYNC = [
    "icons", "analytics", "events", "npcs", "meibutsu", "shizen", "kome", "sangyo", "machi", "edition", "region",
    "season", "weather", "osm-query", "gochiso", "kometalk", "course", "photoquiz", "daystamp", "rollsync",
    "rolltrail", "landscape", "biglandmark", "postcard", "shogo", "game", "landmark-gen", "korostyle", "pixel",
    "meiro", "share",
]
CORE = ["leaflet", "icons", "region", "game", "pixel", "meiro", "rollsync", "rolltrail", "landscape", "biglandmark", "gochiso"]


def sync_scripts():
    return re.findall(r'<script src="([^"]+)"', HTML)


def lazy_files():
    m = re.search(r"var files = \[([^\]]*)\]", HTML)
    return re.findall(r'"([\w-]+)"', m.group(1))


class Lazy183(unittest.TestCase):
    def test_sync_list_fixed(self):
        names = [re.sub(r"^nishio-go/|\.js$", "", s) for s in sync_scripts()]
        self.assertTrue(names[0].startswith("https://unpkg.com/leaflet"))
        self.assertEqual(names[1:], SYNC)
        self.assertEqual(len(names), 32)   # leaflet + 31（変更前は 71 = leaflet + 70）
        moved = sum((ROOT / "nishio-go" / (m + ".js")).stat().st_size for m in LAZY_MOVED)
        self.assertGreater(moved, 150_000)   # 変更前の同期合計 2,174,795 バイトから、これだけ起動の道から外れた

    def test_moved_not_sync_and_lazy_in_order(self):
        sync = set(re.sub(r"^nishio-go/|\.js$", "", s) for s in sync_scripts())
        for m in LAZY_MOVED:
            self.assertNotIn(m, sync, m)
            self.assertTrue((ROOT / "nishio-go" / (m + ".js")).exists(), m)
        self.assertEqual(lazy_files(), LAZY_MOVED + LAZY_OLD)

    def test_loader_behaviour_kept(self):
        for s in ["el.async = false;", "el.onload = next;", "el.onerror = function ()", "window.__nsgLazyDone = true;",
                  "window.addEventListener('load', next)"]:
            self.assertIn(s, HTML)

    def test_core_still_sync(self):
        names = [re.sub(r"^nishio-go/|\.js$", "", s) for s in sync_scripts()]
        for c in CORE:
            self.assertTrue(any(n == c or n.startswith("https://unpkg.com/" + c) for n in names), c)

    def test_load_time_captures_stay_sync(self):
        # game.js / pixel.js が読み込み時に window.X を掴むモジュールは同期のまま
        for m in ["kometalk", "course", "postcard", "shogo", "landmark-gen", "korostyle", "share", "photoquiz", "daystamp"]:
            self.assertIn(m, SYNC)

    def _git(self, *a):
        r = subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else None

    def test_added_lines_have_no_banned_words(self):
        base = (self._git("merge-base", "HEAD", "origin/main") or "").strip()
        d = self._git("diff", base, "--", "nishio-go.html") if base else None
        if d is None:
            self.skipTest("origin/main なし")
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ["ぼ" + "く", "だ" + "に", "約" + "20%"]:
            self.assertNotIn(w, added)

    def test_changed_files_limited(self):
        base = (self._git("merge-base", "HEAD", "origin/main") or "").strip()
        d = self._git("diff", "--name-only", base) if base else None
        if d is None:
            self.skipTest("origin/main なし")
        for f in d.split():
            self.assertTrue(f == "nishio-go.html" or f.startswith("tests/"), f)


if __name__ == "__main__":
    unittest.main()
