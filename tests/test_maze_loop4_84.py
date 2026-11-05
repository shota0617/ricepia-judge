"""第4弾サイクル84：速さの演出を穏やかに（スピード線と、速さだけで出る のこりかげを やめる）"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


class Loop84(unittest.TestCase):
    def test_speed_lines_removed(self):
        self.assertNotIn("drawSpeedLines", PX)   # スピード線の 描画は ない
        self.assertNotIn("speedFx.k =", PX)      # こさを 更新する コードも ない（speedK 互換は いつも 0）
        self.assertIn("get speedK() { return speedFx.k; }", PX)

    def test_ghost_only_when_chosen(self):
        self.assertIn("(KP.ghost && roll.v > 0.8)", PX)
        self.assertNotIn("roll.v > 4.0", PX)

    def test_physics_unchanged(self):
        self.assertRegex(PX, r"ROLL_MAX\s*=\s*4\.2\b")
        self.assertRegex(PX, r"ROLL_ACC\s*=\s*7\b")

    def test_reference_comment(self):
        self.assertIn("Smushi Come Home", PX)

    def test_no_forbidden_words_added(self):
        d = subprocess.run(["git", "diff", "HEAD~1", "HEAD", "-U0", "--", "nishio-go/pixel.js"], cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8", check=True).stdout
        add = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
            self.assertNotIn(w, add)


if __name__ == "__main__":
    unittest.main()
