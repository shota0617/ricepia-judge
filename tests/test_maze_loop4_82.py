"""第4弾サイクル82：のんびり・平和への修正 第16弾「ころころの音と数は競わせない」（参考：Haven Park）"""
import unittest
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "nishio-go"
PX = (D / "pixel.js").read_text(encoding="utf-8")


def block(src, start, end):
    i = src.index(start)
    return src[i:src.index(end, i)]


class Loop82(unittest.TestCase):
    def test_combo_note_and_draw_removed(self):
        self.assertNotIn("comboNote", PX)
        self.assertNotIn("drawCombo", PX)
        self.assertNotIn("×${combo.n}", PX)
        self.assertNotIn("PENTA", PX)

    def test_combo_step_is_record_only(self):
        b = block(PX, "function comboStep()", "function comboEnd()")
        self.assertNotIn("mzFx", b)
        self.assertNotIn("Math.random", b)
        self.assertIn("mzRt.run.combo = combo.n", b)

    def test_rice_feel_uses_koto_sound(self):
        b = block(PX, "function riceFeel(", "if (roll.h > 0) {")
        self.assertIn("combo.n++", b)
        self.assertIn("kotoSound(Math.min(1, speed / 5) * g.snd)", b)
        self.assertNotIn("else kotoSound", b)
        self.assertNotIn("Math.pow", b)

    def test_pad_sound_flat(self):
        b = block(PX, "function padSound(", "function dotSound(")
        self.assertNotIn("Math.pow", b)
        self.assertNotIn("chain - 1", b)
        self.assertIn("setValueAtTime(330, t)", b)
        self.assertIn("exponentialRampToValueAtTime(1320,", b)

    def test_dot_sound_flat(self):
        b = block(PX, "function dotSound(", "function chordSound(")
        self.assertNotIn("Math.pow", b)
        self.assertNotIn("% 10", b)
        self.assertIn("f = 1046.5", b)
        self.assertIn("chordSound(); combo.n += 2", PX)

    def test_pad_say_fixed(self):
        self.assertNotIn(".repeat(", block(PX, "mzPad.chain >= 2", "padSound(mzPad.chain)"))
        self.assertIn("riceSay('びゅーん\U0001F4A8', 1200, 'happy')", PX)

    def test_havenpark_comments(self):
        self.assertGreaterEqual(PX.count("Haven Park"), 3)

    def test_records_kept(self):
        self.assertIn("comboAdd: k =>", PX)
        self.assertIn("comboBest:", PX)
        self.assertIn("get combo()", PX)
        self.assertIn("function comboEnd()", PX)

    def test_no_banned_words(self):
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
            self.assertNotIn(w, block(PX, "// ころころコンボ（第4弾", "function comboEnd()"))


if __name__ == "__main__":
    unittest.main()
