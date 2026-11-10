"""第4弾サイクル191：スタートの1分（動き・操作と結果・見える景色）。せかいちずから もどれる・始まりの場所は 通路の上・ゴールの選びなおしは 1こまの中・ことわったときの知らせ。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")


def fn_src(src, name):
    i = src.index("function %s(" % name)
    return src[i:src.index("\n}\n", i) + 3]


class FirstMinute191(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "nishio-go/game.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_world_back_button_shown_while_world_open(self):
        body = fn_src(PIX, "firstWalkBtns")
        self.assertIn("b.hidden = fw && !(id === 'pxWorld' && worldMode);", body)
        sw = fn_src(PIX, "setWorld")
        self.assertIn("firstWalkBtns();", sw)
        self.assertLess(sw.index("worldMode = on;"), sw.index("firstWalkBtns();"))   # 開いた・閉じた あとの 状態で 決める
        self.assertIn("G.toast('🌏 ゴールは 🏁 の 所（👣 で めいろに もどる）');", PIX)   # 知らせの とおりに 押せる

    def test_start_is_fixed_point_near_station(self):
        m = re.search(r"center: \[([\d.]+), ([\d.]+)\],", GAME)
        lat, lng = float(m.group(1)), float(m.group(2))
        self.assertEqual((lat, lng), (34.86253, 137.05725))
        self.assertLess(abs(lat - 34.8625) * 111320 + abs(lng - 137.0570) * 91400, 30)   # もとの 場所から 30m より 近い（同じ 町・同じ はじめての ゴール）

    def test_repick_runs_within_one_frame(self):
        body = fn_src(PIX, "mzRoute")
        self.assertIn("if (G.guideNoPath(g, true)) return mzRoute(now);", body)
        self.assertIn("G.setGuide(bg); return mzRoute(now); }", body)
        self.assertEqual(body.count("return mzRoute(now)"), 2)
        self.assertIn("if (ts.length >= 3) return false;", GAME)   # くり返しは 3回まで（同じ こまの 中でも 止まる）

    def test_tilt_denied_toast_has_no_keyboard_talk(self):
        m = re.search(r"const fallback = \(\) => G\.toast\('([^']*)'\)", PIX)
        self.assertEqual(m.group(1), "地図を タップして 遊べるよ")

    def test_playtest_checks(self):
        for k in ["worldBack", "tiltDeniedMsg", "startNoJump", "firstGoalNoFlip"]:
            self.assertRegex(PLAY, r"\n  %s: '" % k)
        self.assertIn("...(await startSteadyChecks(browser, R))", PLAY)
        self.assertIn("get goalArrowRect() { return mzMap.arrow ? mzMap.arrow.slice(0, 4) : null; }", PIX)


if __name__ == "__main__":
    unittest.main()
