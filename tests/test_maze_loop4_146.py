import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()
HTML = open(os.path.join(ROOT, "nishio-go.html"), encoding="utf-8").read()


def fn(src, name):
    i = src.index("function " + name + "(")
    j = src.index("\n}\n", i)
    return src[i:j + 3]


class TestF3(unittest.TestCase):
    def test_next_goal_label_gone(self):
        d = fn(PIX, "drawMzNext")
        self.assertIn("mzNext.want = false; mzNext.t0 = 0; return;", d)
        self.assertNotIn("fillText", d)
        self.assertNotIn("['🏁 つぎの ゴール'", PIX)   # 札の見出しとして描く配列は無い（コメント内の言及は対象外）
        self.assertNotIn("めいろで ${", PIX)
        self.assertNotIn("mzNext.want = true", PIX)
        self.assertIn("mzNext.name = g.name || '';", PIX)

    def test_maze_goal_single_line(self):
        g = fn(GAME, "mazeGoal")
        for bad in ("めいろ ゴール！", "がんばったじゃん", "お疲れ様です。ここで"):
            self.assertNotIn(bad, g)
        self.assertIn("MZ.goalFx('')", g)
        for keep in ("glowArrive(id, lines)", "rescueGoal", "mzShare = {", "track('maze_goal'"):
            self.assertIn(keep, g)
        c = fn(GAME, "checkin")
        self.assertIn("if (mz) toast(`⭐ +${total}", c)
        self.assertIn("toast(lvUp ? `+${total}pt　⭐ レベル${lvUp}！` : `+${total}pt`)", c)

    def test_hint_tick_silent(self):
        h = fn(PIX, "mzHintTick")
        self.assertNotIn("道しるべ：光る 点の ほうへ", h)
        self.assertNotIn("まよったら、せっていで 道しるべを", h)
        self.assertNotIn("G.toast", h)
        self.assertIn("mzRt.showUntil = now + 6000", h)
        self.assertIn("mzRt.hints = (mzRt.hints || 0) + 1", h)
        self.assertIn("now - mzRt.bestT > 25000", h)

    def test_loading_status_gone(self):
        self.assertNotIn("いまの 場所を さがしているよ", GAME)
        self.assertNotIn("いまの 場所を さがしているよ", HTML)
        self.assertIn('<div class="status" id="status"></div>', HTML)
        self.assertIn("(demo ? '地図をタップすると、その場所へ移動します。' : waitLine())", GAME)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        for l in added:
            self.assertIsNone(re.search("\u307c\u304f|\u3060\u306b|\u7d0420%", l), l)


if __name__ == "__main__":
    unittest.main()
