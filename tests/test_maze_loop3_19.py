"""第3弾サイクル19：流れを止める自動表示の全廃（おはなし・ごほうび・完走パネル・出会い）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KT = (ROOT / "nishio-go/kometalk.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go/game.js").read_text(encoding="utf-8")
PIXEL = (ROOT / "nishio-go/pixel.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go/style.css").read_text(encoding="utf-8")


def func_body(src, head):
    i = src.index(head)
    j = src.index("\n}\n", i)
    return src[i:j]


class KomeTalkNonBlocking(unittest.TestCase):
    def test_no_dialog_role_no_focus_auto_advance(self):   # 11/2 吹き出し廃止：窓そのものが 無い
        for w in ("role', 'dialog'", ".focus(", "toastHold", "toastFlush", "createElement", "setTimeout"):
            self.assertNotIn(w, KT)

    def test_hidden_does_not_arm_auto_timers(self):   # 11/2 窓が 無いので タイマーも 無い
        self.assertNotIn("afterType", KT)
        self.assertNotIn("setInterval", KT)

    def test_css_pointer_events(self):
        self.assertRegex(CSS, r"\.kome-talk\{pointer-events:none;")
        self.assertRegex(CSS, r"\.kome-talk \.kt-btn\{pointer-events:auto\}")


class RewardNonBlocking(unittest.TestCase):
    def test_reward_css(self):
        self.assertIn(".reward.show{pointer-events:none}", CSS)
        self.assertRegex(CSS, r"\[data-rw-share\][^{]*\{pointer-events:auto")
        self.assertRegex(CSS, r"\[data-rw-tip\][^{]*\{pointer-events:auto")
        self.assertNotIn("タップで とじる", CSS)

    def test_map_covered_ignores_reward(self):
        body = func_body(PIXEL, "function mapCovered(soft, free)")
        self.assertNotIn("$('reward')", body)

    def test_ending_has_close(self):
        self.assertIn("data-rw-close", GAME)


class CourseAndMeet(unittest.TestCase):
    def test_course_celebrate_toasts(self):
        body = func_body(GAME, "function courseCelebrate()")
        self.assertNotIn("openCourse", body)
        self.assertIn("toastAfter", body)

    def test_meet_non_blocking(self):
        self.assertRegex(CSS, r"\.meet\{pointer-events:none;")
        line = next(l for l in GAME.splitlines() if l.startswith("const ktBusy"))
        self.assertNotIn("meetBox", line)
        self.assertNotIn("rewardBusy", line)
        self.assertNotIn("$('meetBox').addEventListener('click'", GAME)


class Forbidden(unittest.TestCase):
    def test_no_forbidden_words_in_diff(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%", "約20％"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
