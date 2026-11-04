"""第3弾サイクル38：復帰時の「おかえりなさい！」結果カードを廃止し、トースト＋きろくに寄せる。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")


def idle():
    i = GAME.index("function idleCheck(")
    return GAME[i:GAME.index("\n}\n", i)]


class IdleReturnNoCard(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(["node", "--check", str(ROOT / "nishio-go/game.js")], check=True)

    def test_no_card(self):
        b = idle()
        self.assertNotIn("showReward", b)
        self.assertNotIn("おかえりなさい！ るすばん中に", b)
        self.assertNotIn("dotLines", b)

    def test_text_gone(self):
        self.assertNotIn("おかえりなさい！ るすばん中に まちをさんぽしてきました", GAME)

    def test_gains_kept(self):
        b = idle()
        for k in ("gainPoints(pts)", "learnFact(", "gainDot(", "S.log.unshift({ type: 'idle'", "save();", "track('idle_return'", "renderLog();", "refreshNearby();"):
            self.assertIn(k, b)

    def test_log_has_breakdown(self):
        b = idle()
        self.assertIn("時間", b)
        self.assertIn("まちメモ+", b)
        self.assertIn("mins:", b)
        self.assertLess(b.index("const h = Math.floor"), b.index("S.log.unshift"))

    def test_toast(self):
        b = idle()
        self.assertIn("toast(", b)
        self.assertIn("⭐Lv", b)

    def test_changed_files(self):
        out = subprocess.run(["git", "diff", "--name-only", "origin/main"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        out = [f for f in out if f not in ("tests/test_maze_loop3_38.py", "tests/test_maze_loop3_36.py", "tests/test_maze_loop3_39.py", "tests/test_maze_loop3_40.py", "tests/test_maze_loop3_41.py", "tests/test_maze_loop3_16.py", "tests/test_maze_loop3_28.py", "tests/test_maze_loop3_29.py", "tests/test_maze_loop3_30.py", "tests/test_maze_loop3_31.py", "tests/test_maze_loop3_32.py", "nishio-go/pixel.js", "nishio-go/game.js", "nishio-go/kometalk.js", "nishio-go.html", "nishio-go/postcard.js", "nishio-go/photoquiz.js", "nishio-go/daystamp.js", "nishio-go/picross.js", "nishio-go/shopmap.js", "nishio-go/bingo.js", "nishio-go/memory.js", "nishio-go/slidepuzzle.js", "nishio-go/janken.js", "nishio-go/rollsync.js", "nishio-go/landscape.js", "nishio-go/biglandmark.js", "nishio-go/rolltrail.js", "nishio-go/meiro.js", "nishio-go/shomai.js", "nishio-go/art/shomai-cute.png", "tests/test_maze_loop3_42.py")]
        self.assertTrue(set(f for f in out if not f.startswith("tests/")) <= {"nishio-go/game.js", "nishio-go/pixel.js", "nishio-go/style.css"})   # 後のサイクルの ブランチでは game.js も 差分に 出ない

    def test_no_forbidden_words(self):
        d = subprocess.run(["git", "diff", "HEAD", "--", "nishio-go/game.js"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        for w in ("ぼく", "約20%"):
            self.assertNotIn(w, d)


if __name__ == "__main__":
    unittest.main()
